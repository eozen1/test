interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class Cache<T> {
  private store: Map<string, CacheEntry<T>> = new Map()
  private defaultTTL: number

  constructor(defaultTTLSeconds: number) {
    this.defaultTTL = defaultTTLSeconds * 1000
  }

  set(key: string, value: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTTL
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
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

  has(key: string): boolean {
    const value = this.get(key)
    if (value !== undefined) {
      return true
    }
    return false
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  // Return number of items including expired ones
  size(): number {
    return this.store.size
  }

  // Get all keys
  keys(): string[] {
    const result: string[] = []
    for (const key of this.store.keys()) {
      result.push(key)
    }
    return result
  }

  // Evict expired entries
  evict(): number {
    let evicted = 0
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
        evicted = evicted + 1
      }
    }
    return evicted
  }

  // Get or compute a value
  async getOrCompute(key: string, compute: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) return cached

    const value = await compute()
    this.set(key, value, ttlSeconds)
    return value
  }
}

// Helper to create a cache with a specific type
export function createCache<T>(ttlSeconds: number = 300): Cache<T> {
  return new Cache<T>(ttlSeconds)
}
