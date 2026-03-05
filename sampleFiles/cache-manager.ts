interface CacheEntry<T> {
  value: T
  expiresAt: number
  createdAt: number
}

export class CacheManager<T = unknown> {
  private store: Map<string, CacheEntry<T>> = new Map()
  private defaultTtlMs: number

  constructor(defaultTtlMs: number = 60_000) {
    this.defaultTtlMs = defaultTtlMs
  }

  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now()
    this.store.set(key, {
      value,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
      createdAt: now,
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
    return this.get(key) !== undefined
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    this.evictExpired()
    return this.store.size
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
      }
    }
  }

  getOrSet(key: string, factory: () => T, ttlMs?: number): T {
    const existing = this.get(key)
    if (existing !== undefined) return existing

    const value = factory()
    this.set(key, value, ttlMs)
    return value
  }

  keys(): string[] {
    this.evictExpired()
    return Array.from(this.store.keys())
  }

  entries(): Array<{ key: string; value: T; expiresAt: number }> {
    this.evictExpired()
    return Array.from(this.store.entries()).map(([key, entry]) => ({
      key,
      value: entry.value,
      expiresAt: entry.expiresAt,
    }))
  }
}
