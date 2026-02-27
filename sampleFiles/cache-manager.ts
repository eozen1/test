interface CacheEntry<T> {
  value: T
  expiry: number
}

class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private maxSize: number

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return null
    }

    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number = 60000): void {
    if (this.cache.size >= this.maxSize) {
      // Remove the first entry (not necessarily the oldest by access time)
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    })
  }

  // Fetch-through cache
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = 60000,
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) return cached

    const value = await fetcher()
    this.set(key, value, ttlMs)
    return value
  }

  // Purge all expired entries
  purgeExpired(): number {
    let purged = 0
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        this.cache.delete(key)
        purged++
      }
    }
    return purged
  }

  // Clear entries matching a prefix
  invalidateByPrefix(prefix: string): number {
    let invalidated = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
        invalidated++
      }
    }
    return invalidated
  }

  get size(): number {
    return this.cache.size
  }

  clear(): void {
    this.cache.clear()
  }
}

export const globalCache = new CacheManager()
export default CacheManager
