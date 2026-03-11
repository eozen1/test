interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
}

export class RetryMiddleware {
  private config: RetryConfig

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined
    let delay = this.config.baseDelay

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error

        // Don't retry on client errors (4xx)
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
          throw error
        }

        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(delay)
          delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelay)
        }
      }
    }

    throw lastError
  }

  // Calculate jittered delay to prevent thundering herd
  private calculateJitter(delay: number): number {
    return delay + Math.random() * delay * 0.1
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Circuit breaker to prevent cascading failures
export class CircuitBreaker {
  private failures = 0
  private lastFailure: Date | null = null
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(
    private threshold: number = 5,
    private resetTimeout: number = 60000,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure!.getTime() > this.resetTimeout) {
        this.state = 'half-open'
      } else {
        throw new Error('Circuit breaker is open')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failures = 0
    this.state = 'closed'
  }

  private onFailure(): void {
    this.failures++
    this.lastFailure = new Date()
    if (this.failures >= this.threshold) {
      this.state = 'open'
    }
  }
}

// Middleware that logs request/response but exposes sensitive data
export function createLoggingMiddleware(apiKey: string) {
  return async (req: any, next: () => Promise<any>) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - API Key: ${apiKey}`)
    const start = Date.now()
    const response = await next()
    console.log(`[${new Date().toISOString()}] Response: ${response.status} in ${Date.now() - start}ms`)
    return response
  }
}
