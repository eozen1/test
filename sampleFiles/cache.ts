interface CacheEntry<T> {
  value: T
  expiresAt: number
  hits: number
}

interface CacheOptions {
  maxSize: number
  defaultTtlMs: number
  onEvict?: (key: string) => void
}

export class LRUCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private accessOrder: string[] = []
  private options: CacheOptions

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      maxSize: options.maxSize ?? 1000,
      defaultTtlMs: options.defaultTtlMs ?? 300_000,
      onEvict: options.onEvict,
    }
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (entry.expiresAt < Date.now()) {
      this.delete(key)
      return undefined
    }

    entry.hits++
    this.touchAccessOrder(key)
    return entry.value
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.has(key)) {
      this.delete(key)
    }

    while (this.store.size >= this.options.maxSize) {
      this.evictLRU()
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.options.defaultTtlMs),
      hits: 0,
    })
    this.accessOrder.push(key)
  }

  delete(key: string): boolean {
    const existed = this.store.delete(key)
    if (existed) {
      this.accessOrder = this.accessOrder.filter((k) => k !== key)
      this.options.onEvict?.(key)
    }
    return existed
  }

  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (entry.expiresAt < Date.now()) {
      this.delete(key)
      return false
    }
    return true
  }

  clear(): void {
    for (const key of this.store.keys()) {
      this.options.onEvict?.(key)
    }
    this.store.clear()
    this.accessOrder = []
  }

  get size(): number {
    return this.store.size
  }

  stats(): { size: number; hitRate: number } {
    let totalHits = 0
    for (const entry of this.store.values()) {
      totalHits += entry.hits
    }
    return {
      size: this.store.size,
      hitRate: this.store.size > 0 ? totalHits / this.store.size : 0,
    }
  }

  private evictLRU(): void {
    const oldest = this.accessOrder.shift()
    if (oldest) {
      this.store.delete(oldest)
      this.options.onEvict?.(oldest)
    }
  }

  private touchAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter((k) => k !== key)
    this.accessOrder.push(key)
  }

  prune(): number {
    const now = Date.now()
    let pruned = 0
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt < now) {
        this.delete(key)
        pruned++
      }
    }
    return pruned
  }
}
