interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class CacheService<T = unknown> {
  private store: Map<string, CacheEntry<T>> = new Map()
  private defaultTtl: number

  constructor(defaultTtlMs: number = 300000) {
    this.defaultTtl = defaultTtlMs
  }

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtl
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

  getOrSet(key: string, factory: () => T, ttlMs?: number): T {
    const cached = this.get(key)
    if (cached !== undefined) return cached

    const value = factory()
    this.set(key, value, ttlMs)
    return value
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }

  keys(): string[] {
    return Array.from(this.store.keys())
  }

  prune(): number {
    let pruned = 0
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
        pruned++
      }
    }
    return pruned
  }
}

export class LRUCache<T> {
  private capacity: number
  private cache: Map<string, T> = new Map()

  constructor(capacity: number) {
    this.capacity = capacity
  }

  get(key: string): T | undefined {
    if (!this.cache.has(key)) return undefined
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  put(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next().value
      this.cache.delete(oldest)
    }
    this.cache.set(key, value)
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  size(): number {
    return this.cache.size
  }

  clear(): void {
    this.cache.clear()
  }
}

export class AsyncCacheService<T = unknown> {
  private pending: Map<string, Promise<T>> = new Map()
  private cache: CacheService<T>

  constructor(defaultTtlMs: number = 300000) {
    this.cache = new CacheService<T>(defaultTtlMs)
  }

  async getOrFetch(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached

    const inflight = this.pending.get(key)
    if (inflight) return inflight

    const promise = fetcher().then(value => {
      this.cache.set(key, value, ttlMs)
      this.pending.delete(key)
      return value
    }).catch(err => {
      this.pending.delete(key)
      throw err
    })

    this.pending.set(key, promise)
    return promise
  }

  invalidate(key: string): void {
    this.cache.delete(key)
    this.pending.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.pending.clear()
  }
}
