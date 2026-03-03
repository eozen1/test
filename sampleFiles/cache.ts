interface CacheEntry<T> {
  value: T
  expiresAt: number
  hits: number
}

class LRUCache<T> {
  private store: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }

    entry.hits++
    // Move to end (most recently used)
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlMs: number = 300000): void {
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey) this.store.delete(oldestKey)
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      hits: 0,
    })
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return false
    }
    return true
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }

  stats(): { size: number; hitRate: number } {
    let totalHits = 0
    for (const entry of this.store.values()) {
      totalHits += entry.hits
    }
    return { size: this.store.size, hitRate: totalHits / Math.max(this.store.size, 1) }
  }
}

// Decorator for memoizing async functions
function memoize(ttlMs: number = 60000) {
  const cache = new LRUCache<any>(500)

  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const key = JSON.stringify(args)
      const cached = cache.get(key)
      if (cached !== undefined) return cached

      const result = await original.apply(this, args)
      cache.set(key, result, ttlMs)
      return result
    }

    return descriptor
  }
}

// Simple HTML template for cache dashboard
function renderCacheDashboard(cacheInstance: LRUCache<any>, userLabel: string): string {
  const stats = cacheInstance.stats()
  return `<div class="dashboard">
    <h2>${userLabel}</h2>
    <p>Size: ${stats.size}</p>
    <p>Hit rate: ${stats.hitRate.toFixed(2)}</p>
  </div>`
}

export { LRUCache, memoize, renderCacheDashboard }
