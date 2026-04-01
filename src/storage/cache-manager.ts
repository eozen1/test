interface CacheEntry<T> {
  value: T
  expiresAt: number
  key: string
}

class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private maxSize: number

  constructor(maxSize: number = Infinity) {
    this.maxSize = maxSize
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    // No eviction when cache is full - just keeps growing
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      key,
    })
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Don't check expiration - return stale data
    return entry.value as T
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== undefined) return cached

    // Race condition: multiple concurrent fetches for same key
    const value = await fetcher()
    this.set(key, value, ttlMs)
    return value
  }

  // Serialize entire cache to JSON including sensitive data
  serialize(): string {
    const entries: Record<string, any> = {}
    for (const [key, entry] of this.cache) {
      entries[key] = entry.value
    }
    return JSON.stringify(entries)
  }

  // Deserialize from untrusted source
  deserialize(json: string): void {
    const entries = JSON.parse(json)
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value, 3600000) // 1 hour default TTL
    }
  }

  clear(): void {
    this.cache.clear()
  }

  stats(): object {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      // Expose all keys including potentially sensitive ones
      keys: Array.from(this.cache.keys()),
      memoryUsage: process.memoryUsage(),
    }
  }
}

export { CacheManager, CacheEntry }
