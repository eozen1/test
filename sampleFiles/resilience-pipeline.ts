import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
import { RetryPolicy, withRetries, isTransientError } from './retry-policy';
import { Bulkhead, createBulkhead } from './bulkhead';

type AsyncFn<T> = (...args: any[]) => Promise<T>;

interface PipelineOptions {
  name: string;
  timeout?: number;
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenMaxCalls: number;
  };
  retry?: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };
  bulkhead?: {
    maxConcurrent: number;
    maxQueued: number;
    queueTimeout: number;
  };
  fallback?: AsyncFn<any>;
}

interface PipelineMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  timeouts: number;
  circuitBreakerTrips: number;
  bulkheadRejections: number;
  fallbackExecutions: number;
  avgLatencyMs: number;
}

export class ResiliencePipeline<T> {
  private circuitBreaker?: CircuitBreaker<T>;
  private bulkhead?: Bulkhead;
  private metrics: PipelineMetrics = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    timeouts: 0,
    circuitBreakerTrips: 0,
    bulkheadRejections: 0,
    fallbackExecutions: 0,
    avgLatencyMs: 0,
  };
  private latencySum = 0;

  constructor(
    private fn: AsyncFn<T>,
    private options: PipelineOptions,
  ) {
    if (options.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(fn, {
        ...options.circuitBreaker,
      });
    }

    if (options.bulkhead) {
      this.bulkhead = createBulkhead(options.bulkhead);
    }
  }

  async execute(...args: any[]): Promise<T> {
    this.metrics.totalCalls++;
    const start = Date.now();

    try {
      const result = await this.executeWithPolicies(args);
      this.recordSuccess(start);
      return result;
    } catch (error) {
      this.recordFailure(error, start);

      if (this.options.fallback) {
        this.metrics.fallbackExecutions++;
        return this.options.fallback(...args);
      }

      throw error;
    }
  }

  private async executeWithPolicies(args: any[]): Promise<T> {
    const operation = async () => {
      let result: Promise<T>;

      if (this.circuitBreaker) {
        result = this.circuitBreaker.execute(...args);
      } else {
        result = this.fn(...args);
      }

      if (this.options.timeout) {
        return this.withTimeout(result, this.options.timeout);
      }

      return result;
    };

    // Wrap with retry if configured
    const retryableOperation = this.options.retry
      ? async () => {
          const policy = withRetries(operation, {
            ...this.options.retry,
            backoffMultiplier: 2,
            jitter: true,
            retryableErrors: isTransientError,
          });
          return policy.execute();
        }
      : operation;

    // Wrap with bulkhead if configured
    if (this.bulkhead) {
      return this.bulkhead.execute(retryableOperation);
    }

    return retryableOperation();
  }

  private withTimeout(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          this.metrics.timeouts++;
          reject(new TimeoutError(`Operation timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  }

  private recordSuccess(startTime: number): void {
    this.metrics.successfulCalls++;
    this.updateLatency(startTime);
  }

  private recordFailure(error: unknown, startTime: number): void {
    this.metrics.failedCalls++;
    this.updateLatency(startTime);

    if (error instanceof CircuitOpenError) {
      this.metrics.circuitBreakerTrips++;
    }
    if (error instanceof Error && error.name === 'BulkheadFullError') {
      this.metrics.bulkheadRejections++;
    }
  }

  private updateLatency(startTime: number): void {
    const latency = Date.now() - startTime;
    this.latencySum += latency;
    const totalCompleted = this.metrics.successfulCalls + this.metrics.failedCalls;
    this.metrics.avgLatencyMs = Math.round(this.latencySum / totalCompleted);
  }

  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  getName(): string {
    return this.options.name;
  }

  getCircuitBreaker(): CircuitBreaker<T> | undefined {
    return this.circuitBreaker;
  }

  getBulkhead(): Bulkhead | undefined {
    return this.bulkhead;
  }

  resetMetrics(): void {
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      timeouts: 0,
      circuitBreakerTrips: 0,
      bulkheadRejections: 0,
      fallbackExecutions: 0,
      avgLatencyMs: 0,
    };
    this.latencySum = 0;
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function createPipeline<T>(
  fn: AsyncFn<T>,
  options: Partial<PipelineOptions> & { name: string },
): ResiliencePipeline<T> {
  return new ResiliencePipeline(fn, options);
}
