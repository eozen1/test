interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class InMemoryCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private defaultTtlMs: number

  constructor(defaultTtlMs: number = 300_000) {
    this.defaultTtlMs = defaultTtlMs
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

  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    })
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
    return this.store.size
  }

  keys(): string[] {
    return Array.from(this.store.keys())
  }

  entries(): Array<{ key: string; value: T; expiresAt: number }> {
    const result: Array<{ key: string; value: T; expiresAt: number }> = []
    for (const [key, entry] of this.store) {
      if (Date.now() <= entry.expiresAt) {
        result.push({ key, value: entry.value, expiresAt: entry.expiresAt })
      }
    }
    return result
  }

  /**
   * Remove all expired entries from the cache.
   * Call periodically to prevent memory leaks.
   */
  prune(): number {
    const now = Date.now()
    let pruned = 0
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
        pruned++
      }
    }
    return pruned
  }
}
