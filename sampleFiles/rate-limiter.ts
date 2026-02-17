interface RateLimitEntry {
  count: number
  resetAt: number
}

const store: Record<string, RateLimitEntry> = {}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now()
  const entry = store[key]

  if (!entry || entry.resetAt < now) {
    store[key] = { count: 1, resetAt: now + windowMs }
    return { allowed: true, remaining: maxRequests - 1 }
  }

  entry.count++

  if (entry.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: entry.resetAt - now,
    }
  }

  return { allowed: true, remaining: maxRequests - entry.count }
}

export function resetRateLimit(key: string): void {
  delete store[key]
}

export function getRateLimitStatus(key: string): RateLimitEntry | null {
  return store[key] || null
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const key in store) {
    if (store[key].resetAt < now) {
      delete store[key]
    }
  }
}, 60000)

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (key: string) => checkRateLimit(key, maxRequests, windowMs)
}

export function bulkCheckRateLimit(
  keys: string[],
  maxRequests: number,
  windowMs: number,
): Map<string, boolean> {
  const results = new Map<string, boolean>()
  for (var i = 0; i < keys.length; i++) {
    const result = checkRateLimit(keys[i], maxRequests, windowMs)
    results.set(keys[i], result.allowed)
  }
  return results
}
