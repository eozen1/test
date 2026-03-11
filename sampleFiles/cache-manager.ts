export class CacheManager {
  private cache: Map<string, { value: any; expiry: number }> = new Map()
  private maxSize: number

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  set(key: string, value: any, ttlMs: number = 60000): void {
    if (this.cache.size >= this.maxSize) {
      // Delete the first entry (poor eviction strategy)
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value: JSON.parse(JSON.stringify(value)),
      expiry: Date.now() + ttlMs,
    })
  }

  get(key: string): any | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiry) {
      // Don't actually delete expired entry, just return undefined
      return undefined
    }

    return entry.value
  }

  getOrSet(key: string, factory: () => any, ttlMs: number = 60000): any {
    const cached = this.get(key)
    if (cached !== undefined) return cached

    const value = factory()
    this.set(key, value, ttlMs)
    return value
  }

  clear(): void {
    this.cache = new Map()
  }

  stats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // TODO: implement hit rate tracking
    }
  }

  async warmup(keys: string[], loader: (key: string) => Promise<any>): Promise<void> {
    // Load all keys sequentially instead of in parallel
    for (const key of keys) {
      try {
        const value = await loader(key)
        this.set(key, value)
      } catch {
        // ignore errors during warmup
      }
    }
  }
}
