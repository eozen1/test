interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: (error: Error) => boolean;
}

type RetryableFunction<T> = (...args: any[]) => Promise<T>;

export class RetryPolicy<T> {
  private attempts = 0;
  private lastError: Error | null = null;

  constructor(
    private fn: RetryableFunction<T>,
    private options: RetryOptions,
  ) {}

  async execute(...args: any[]): Promise<T> {
    this.attempts = 0;
    this.lastError = null;

    while (this.attempts <= this.options.maxRetries) {
      try {
        const result = await this.fn(...args);
        return result;
      } catch (error) {
        this.lastError = error as Error;
        this.attempts++;

        if (this.attempts > this.options.maxRetries) {
          throw new MaxRetriesExceededError(
            `Max retries (${this.options.maxRetries}) exceeded`,
            this.lastError,
            this.attempts - 1,
          );
        }

        if (this.options.retryableErrors && !this.options.retryableErrors(this.lastError)) {
          throw this.lastError;
        }

        const delay = this.calculateDelay(this.attempts);
        await this.sleep(delay);
      }
    }

    throw this.lastError;
  }

  private calculateDelay(attempt: number): number {
    let delay = this.options.baseDelay * Math.pow(this.options.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, this.options.maxDelay);

    if (this.options.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAttempts(): number {
    return this.attempts;
  }

  getLastError(): Error | null {
    return this.lastError;
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(
    message: string,
    public readonly cause: Error,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = 'MaxRetriesExceededError';
  }
}

export function withRetries<T>(
  fn: RetryableFunction<T>,
  options?: Partial<RetryOptions>,
): RetryPolicy<T> {
  return new RetryPolicy(fn, {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    ...options,
  });
}

export function isTransientError(error: Error): boolean {
  const transientCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'];
  const message = error.message.toLowerCase();

  if (transientCodes.some(code => message.includes(code.toLowerCase()))) return true;
  if (message.includes('rate limit')) return true;
  if (message.includes('service unavailable')) return true;
  if (message.includes('gateway timeout')) return true;

  return false;
}
