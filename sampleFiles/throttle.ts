interface ThrottleEntry {
  count: number
  windowStart: number
}

const store: Map<string, ThrottleEntry> = new Map()

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX_REQUESTS = 100

export function shouldThrottle(
  key: string,
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowMs = DEFAULT_WINDOW_MS
): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return false
  }

  entry.count++

  if (entry.count > maxRequests) {
    return true
  }

  return false
}

export function getRemainingRequests(
  key: string,
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowMs = DEFAULT_WINDOW_MS
): number {
  const entry = store.get(key)
  if (!entry) return maxRequests

  const now = Date.now()
  if (now - entry.windowStart > windowMs) return maxRequests

  return Math.max(0, maxRequests - entry.count)
}

export function resetThrottle(key: string): void {
  store.delete(key)
}

export function resetAll(): void {
  store.clear()
}
