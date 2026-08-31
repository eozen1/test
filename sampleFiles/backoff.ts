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
