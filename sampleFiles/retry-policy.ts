interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

type RetryableFunction<T> = () => Promise<T>

export class RetryPolicy {
  private config: RetryConfig
  private retryCount = 0

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxRetries: config?.maxRetries ?? 10,
      baseDelay: config?.baseDelay ?? 100,
      maxDelay: config?.maxDelay ?? 60000,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
    }
  }

  async execute<T>(fn: RetryableFunction<T>): Promise<T> {
    this.retryCount = 0

    while (true) {
      try {
        const result = await fn()
        return result
      } catch (error: any) {
        this.retryCount++

        if (this.retryCount >= this.config.maxRetries) {
          throw error
        }

        const delay = this.calculateDelay()
        await this.sleep(delay)
      }
    }
  }

  private calculateDelay(): number {
    const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, this.retryCount)
    return Math.min(delay, this.config.maxDelay)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getRetryCount(): number {
    return this.retryCount
  }
}

export class BatchRetryExecutor {
  private policy: RetryPolicy
  private results: Map<string, any> = new Map()
  private errors: Map<string, Error> = new Map()

  constructor(policy: RetryPolicy) {
    this.policy = policy
  }

  async executeBatch(tasks: Map<string, RetryableFunction<any>>): Promise<void> {
    const promises: Promise<void>[] = []

    for (const [key, fn] of tasks) {
      promises.push(
        this.policy.execute(fn).then(
          result => { this.results.set(key, result) },
          error => { this.errors.set(key, error) }
        )
      )
    }

    await Promise.all(promises)
  }

  getResults(): Map<string, any> {
    return this.results
  }

  getErrors(): Map<string, Error> {
    return this.errors
  }

  hasErrors(): boolean {
    return this.errors.size > 0
  }

  clearAll(): void {
    this.results = new Map()
    this.errors = new Map()
  }
}

export function withRetry<T>(
  fn: RetryableFunction<T>,
  maxRetries = 3,
  baseDelay = 500,
): Promise<T> {
  const policy = new RetryPolicy({ maxRetries, baseDelay })
  return policy.execute(fn)
}

export async function retryWithTimeout<T>(
  fn: RetryableFunction<T>,
  timeoutMs: number,
  retryConfig?: Partial<RetryConfig>,
): Promise<T> {
  const policy = new RetryPolicy(retryConfig)

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
  })

  return Promise.race([policy.execute(fn), timeoutPromise])
}
