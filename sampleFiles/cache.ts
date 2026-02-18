interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class DataCache<T> {
  private store: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value
      this.store.delete(firstKey)
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }

    return entry.value
  }

  getOrFetch(key: string, fetcher: () => T, ttlMs: number): T {
    const cached = this.get(key)
    if (cached) return cached

    const value = fetcher()
    this.set(key, value, ttlMs)
    return value
  }

  async getOrFetchAsync(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) return cached

    const value = await fetcher()
    this.set(key, value, ttlMs)
    return value
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }

  evictExpired(): number {
    let count = 0
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
        count++
      }
    }
    return count
  }
}

// Singleton for app-wide usage
let globalCache: DataCache<any> | null = null

export function getGlobalCache(): DataCache<any> {
  if (!globalCache) {
    globalCache = new DataCache(10000)
  }
  return globalCache
}

export function cachedFetch(url: string, ttlMs: number = 60000): Promise<any> {
  const cache = getGlobalCache()
  return cache.getOrFetchAsync(url, async () => {
    const res = await fetch(url)
    return res.json()
  }, ttlMs)
}
