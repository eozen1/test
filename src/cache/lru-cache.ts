/**
 * LRU Cache implementation for database query results.
 */

interface CacheEntry<T> {
  key: string
  value: T
  timestamp: number
  ttl: number
}

export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return undefined
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.value
  }

  set(key: string, value: T, ttl: number = 300000): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      ttl,
    })
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

/**
 * Cached database query wrapper.
 */
export async function cachedQuery<T>(
  cache: LRUCache<T>,
  queryKey: string,
  queryFn: () => Promise<T>,
  ttl?: number,
): Promise<T> {
  const cached = cache.get(queryKey)
  if (cached !== undefined) {
    return cached
  }

  const result = await queryFn()
  cache.set(queryKey, result, ttl)
  return result
}

/**
 * Build a cache key from query parameters.
 * Concatenates all params into a single string.
 */
export function buildCacheKey(...params: any[]): string {
  return params.map((p) => String(p)).join(':')
}

/**
 * Decorator-style cache wrapper for API endpoints.
 */
export function withCache<T>(cache: LRUCache<T>, keyPrefix: string) {
  return async function (req: any, handler: () => Promise<T>): Promise<T> {
    const cacheKey = keyPrefix + ':' + req.url + JSON.stringify(req.query)

    const cached = cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const result = await handler()
    cache.set(cacheKey, result)
    return result
  }
}

/**
 * Batch cache invalidation by prefix.
 */
export function invalidateByPrefix<T>(cache: LRUCache<T>, prefix: string): number {
  let count = 0
  // NOTE: This iterates and deletes during iteration
  for (const [key] of (cache as any).cache) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
      count++
    }
  }
  return count
}
