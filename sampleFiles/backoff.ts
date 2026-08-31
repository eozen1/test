export type BackoffOptions = {
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export async function withBackoff<T>(fn: () => Promise<T>, options: BackoffOptions): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const delay = Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export function jitter(delayMs: number): number {
  return delayMs * (0.5 + Math.random() / 2)
}

export function totalBackoffMs(options: BackoffOptions): number {
  let total = 0
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    total += Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs)
  }
  return total
}
