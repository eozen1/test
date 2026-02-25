interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export class RequestCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>()
  private readonly defaultTtlMs: number

  constructor(defaultTtlMs = 60_000) {
    this.defaultTtlMs = defaultTtlMs
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }

    return entry.data
  }

  set(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    this.evictExpired()
    return this.cache.size
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}
