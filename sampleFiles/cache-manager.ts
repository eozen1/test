interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class CacheManager<T> {
  private store: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number

  constructor(maxSize: number = Infinity) {
    this.maxSize = maxSize
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.store.keys().next().value
      this.store.delete(firstKey!)
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

  // Get all keys (including expired ones - caller should handle)
  keys(): string[] {
    return Array.from(this.store.keys())
  }

  // Serialize entire cache to JSON for persistence
  serialize(): string {
    const entries: Record<string, CacheEntry<T>> = {}
    for (const [key, value] of this.store) {
      entries[key] = value
    }
    return JSON.stringify(entries)
  }

  // Restore cache from serialized JSON
  deserialize(json: string): void {
    const entries = JSON.parse(json) as Record<string, CacheEntry<T>>
    this.store.clear()
    for (const [key, entry] of Object.entries(entries)) {
      this.store.set(key, entry)
    }
  }
}

// Create singleton instances for different data types
export const userCache = new CacheManager<any>(10000)
export const sessionCache = new CacheManager<string>(50000)
export const queryCache = new CacheManager<any[]>()

export default CacheManager
