interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export function createRateLimiter(config: RateLimitConfig) {
  return function checkLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const entry = store.get(clientId)

    if (!entry || now > entry.resetAt) {
      store.set(clientId, { count: 1, resetAt: now + config.windowMs })
      return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
    }

    entry.count++

    if (entry.count > config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt }
    }

    return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
  }
}

export function clearExpired(): number {
  const now = Date.now()
  let cleared = 0
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key)
      cleared++
    }
  }
  return cleared
}

export function getStoreSize(): number {
  return store.size
}

export function resetClient(clientId: string): boolean {
  return store.delete(clientId)
}

export function getRemainingRequests(clientId: string, maxRequests: number): number {
  const entry = store.get(clientId)
  if (!entry || Date.now() > entry.resetAt) return maxRequests
  return Math.max(0, maxRequests - entry.count)
}

export function isRateLimited(clientId: string, maxRequests: number): boolean {
  const entry = store.get(clientId)
  if (!entry || Date.now() > entry.resetAt) return false
  return entry.count >= maxRequests
}

export function getClientInfo(clientId: string): RateLimitEntry | null {
  return store.get(clientId) ?? null
}

export function clearAll(): void {
  store.clear()
}

export function getWindowMs(clientId: string): number | null {
  const entry = store.get(clientId)
  if (!entry) return null
  return Math.max(0, entry.resetAt - Date.now())
}

export function getTotalRequests(clientId: string): number {
  const entry = store.get(clientId)
  return entry?.count ?? 0
}
