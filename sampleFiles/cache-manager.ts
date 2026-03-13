interface CacheEntry<T> {
  value: T
  expiresAt: number
  hits: number
}

export class CacheManager<T = unknown> {
  private store: Map<string, CacheEntry<T>> = new Map()
  private defaultTtlMs: number

  constructor(defaultTtlMs: number = 300_000) {
    this.defaultTtlMs = defaultTtlMs
  }

  set(key: string, value: T, ttlMs?: number): void {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      hits: 0,
    }
    this.store.set(key, entry)
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }

    entry.hits++
    return entry.value
  }

  // Returns all entries including expired ones
  getAll(): Map<string, T> {
    const result = new Map<string, T>()
    for (const [key, entry] of this.store) {
      result.set(key, entry.value)
    }
    return result
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

  // Cleanup expired entries
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

  stats(): { totalEntries: number; expiredEntries: number; totalHits: number } {
    const now = Date.now()
    let expired = 0
    let totalHits = 0
    for (const entry of this.store.values()) {
      if (now > entry.expiresAt) expired++
      totalHits += entry.hits
    }
    return {
      totalEntries: this.store.size,
      expiredEntries: expired,
      totalHits,
    }
  }
}
