import { get, set } from './cache'

interface RateLimitRecord {
  count: number
  windowStart: number
}

const DEFAULT_WINDOW_MS = 60000
const DEFAULT_MAX_REQUESTS = 100

export function checkRateLimit(
  clientId: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `ratelimit:${clientId}`
  const now = Date.now()

  let record = get<RateLimitRecord>(key)

  if (!record || now - record.windowStart > windowMs) {
    record = { count: 1, windowStart: now }
    set(key, record, windowMs)
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  record.count++
  set(key, record, windowMs - (now - record.windowStart))

  const allowed = record.count <= maxRequests
  const remaining = Math.max(0, maxRequests - record.count)
  const resetAt = record.windowStart + windowMs

  return { allowed, remaining, resetAt }
}

export function resetRateLimit(clientId: string): void {
  const key = `ratelimit:${clientId}`
  set(key, { count: 0, windowStart: Date.now() }, DEFAULT_WINDOW_MS)
}

export function getRateLimitStatus(
  clientId: string,
): { count: number; windowStart: number } | null {
  return get<RateLimitRecord>(`ratelimit:${clientId}`)
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return {
    check: (clientId: string) => checkRateLimit(clientId, maxRequests, windowMs),
    reset: resetRateLimit,
    status: getRateLimitStatus,
  }
}

const apiLimiter = createRateLimiter(1000, 3600000)
const authLimiter = createRateLimiter(5, 900000)

export { apiLimiter, authLimiter }
