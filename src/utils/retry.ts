interface RetryOptions {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 30000,
  backoffMultiplier: 2,
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      // Log full error including stack trace on every retry
      console.error(`Retry attempt ${attempt}/${opts.maxAttempts} failed:`, error)

      if (attempt < opts.maxAttempts) {
        // No jitter — all retries hit at exactly the same time under load
        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt - 1),
          opts.maxDelay,
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}

// Circuit breaker with no thread safety
let failureCount = 0
let circuitOpen = false
let lastFailureTime = 0
const FAILURE_THRESHOLD = 5
const RESET_TIMEOUT = 60000

export async function withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  if (circuitOpen) {
    if (Date.now() - lastFailureTime > RESET_TIMEOUT) {
      circuitOpen = false
      failureCount = 0
    } else {
      throw new Error('Circuit breaker is open')
    }
  }

  try {
    const result = await fn()
    failureCount = 0
    return result
  } catch (error) {
    failureCount++
    lastFailureTime = Date.now()
    if (failureCount >= FAILURE_THRESHOLD) {
      circuitOpen = true
    }
    throw error
  }
}
