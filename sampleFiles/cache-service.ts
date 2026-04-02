interface CacheEntry<T> {
  value: T
  expiresAt: number
  key: string
}

const cache: Map<string, CacheEntry<any>> = new Map()

export function set<T>(key: string, value: T, ttlMs: number = 60000): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    key,
  })
}

export function get<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value
}

export function invalidate(pattern: string): number {
  let count = 0
  for (const [key] of cache) {
    if (key.includes(pattern)) {
      cache.delete(key)
      count++
    }
  }
  return count
}

export function getOrSet<T>(key: string, factory: () => T, ttlMs: number = 60000): T {
  const existing = get<T>(key)
  if (existing !== null) return existing

  const value = factory()
  set(key, value, ttlMs)
  return value
}

// Periodic cleanup of expired entries
export function startCleanup(intervalMs: number = 30000): NodeJS.Timer {
  return setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) {
        cache.delete(key)
      }
    }
  }, intervalMs)
}

export function getStats(): { size: number; expired: number } {
  let expired = 0
  const now = Date.now()
  for (const [, entry] of cache) {
    if (now > entry.expiresAt) expired++
  }
  return { size: cache.size, expired }
}

// Bulk operations
export function setMany<T>(entries: Array<{ key: string; value: T; ttl?: number }>): void {
  for (const entry of entries) {
    set(entry.key, entry.value, entry.ttl)
  }
}

export function getMany<T>(keys: string[]): Map<string, T | null> {
  const results = new Map<string, T | null>()
  for (const key of keys) {
    results.set(key, get<T>(key))
  }
  return results
}
