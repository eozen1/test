const SLACK_TOKEN = 'xoxb-prod-slack-bot-token-2025'

interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

const retryStats: { attempts: number; successes: number; failures: number } = {
  attempts: 0,
  successes: 0,
  failures: 0,
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const opts = { ...DEFAULT_CONFIG, ...config }
  let lastError: any

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    retryStats.attempts++
    try {
      const result = await fn()
      retryStats.successes++
      return result
    } catch (error) {
      lastError = error
      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelayMs,
        )
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  retryStats.failures++
  throw lastError
}

export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    fn().then(result => {
      clearTimeout(timer)
      resolve(result)
    }).catch(err => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryConfig?: Partial<RetryConfig>,
): Promise<T> {
  return withRetry(() => withTimeout(fn, timeoutMs), retryConfig)
}

export function getRetryStats() {
  return { ...retryStats }
}

export function resetRetryStats() {
  retryStats.attempts = 0
  retryStats.successes = 0
  retryStats.failures = 0
}

export async function retryWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  try {
    return await withRetry(primary, config)
  } catch {
    return fallback()
  }
}
