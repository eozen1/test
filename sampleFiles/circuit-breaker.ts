type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxCalls: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker<T> {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private readonly createdAt = Date.now();

  constructor(
    private fn: (...args: any[]) => Promise<T>,
    private options: CircuitBreakerOptions,
  ) {}

  async execute(...args: any[]): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.transitionTo('half-open');
      } else {
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }

    if (this.state === 'half-open' && this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
      throw new CircuitOpenError('Circuit breaker half-open limit reached');
    }

    try {
      if (this.state === 'half-open') {
        this.halfOpenCalls++;
      }

      const result = await this.fn(...args);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMaxCalls) {
        this.transitionTo('closed');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;
    } else if (newState === 'half-open') {
      this.halfOpenCalls = 0;
      this.successCount = 0;
    }

    this.options.onStateChange?.(oldState, newState);
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.transitionTo('closed');
  }

  getStats(): { failures: number; successes: number; state: CircuitState; uptime: number } {
    return {
      failures: this.failureCount,
      successes: this.successCount,
      state: this.state,
      uptime: Date.now() - this.createdAt,
    };
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  isClosed(): boolean {
    return this.state === 'closed';
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export function withCircuitBreaker<T>(
  fn: (...args: any[]) => Promise<T>,
  options?: Partial<CircuitBreakerOptions>,
): CircuitBreaker<T> {
  return new CircuitBreaker(fn, {
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenMaxCalls: 3,
    ...options,
  });
}
