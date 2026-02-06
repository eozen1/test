/**
 * Multi-tier caching layer with pluggable backends and eviction policies.
 */

export interface CacheEntry<T> {
  key: string
  value: T
  createdAt: number
  ttlMs: number
  accessCount: number
  lastAccessedAt: number
  sizeBytes: number
}

export interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
  maxSize: number
}

/**
 * Abstract base for all cache backends.
 * Provides common interface and metrics tracking.
 */
export abstract class CacheBackend<T = unknown> {
  protected name: string
  protected maxSize: number
  protected stats: CacheStats

  constructor(name: string, maxSize: number) {
    this.name = name
    this.maxSize = maxSize
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0, maxSize }
  }

  abstract get(key: string): Promise<T | undefined>
  abstract set(key: string, value: T, ttlMs?: number): Promise<void>
  abstract delete(key: string): Promise<boolean>
  abstract clear(): Promise<void>
  abstract has(key: string): Promise<boolean>

  getName(): string {
    return this.name
  }

  getStats(): CacheStats {
    return { ...this.stats }
  }
}

/**
 * In-memory LRU cache using a Map for O(1) operations.
 */
export class MemoryCache<T> extends CacheBackend<T> {
  private store: Map<string, CacheEntry<T>> = new Map()

  constructor(maxSize: number = 1000) {
    super('memory', maxSize)
  }

  async get(key: string): Promise<T | undefined> {
    const entry = this.store.get(key)
    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check TTL expiry
    if (entry.ttlMs > 0 && Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key)
      this.stats.size--
      this.stats.misses++
      return undefined
    }

    entry.accessCount++
    entry.lastAccessedAt = Date.now()
    this.stats.hits++

    // Move to end for LRU ordering (Map preserves insertion order)
    this.store.delete(key)
    this.store.set(key, entry)

    return entry.value
  }

  async set(key: string, value: T, ttlMs: number = 0): Promise<void> {
    // Evict if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLRU()
    }

    const sizeBytes = JSON.stringify(value).length * 2 // rough estimate
    this.store.set(key, {
      key,
      value,
      createdAt: Date.now(),
      ttlMs,
      accessCount: 0,
      lastAccessedAt: Date.now(),
      sizeBytes,
    })
    this.stats.size = this.store.size
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.store.delete(key)
    if (deleted) this.stats.size = this.store.size
    return deleted
  }

  async clear(): Promise<void> {
    this.store.clear()
    this.stats.size = 0
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key)
  }

  private evictLRU(): void {
    // Map iterator gives oldest entry first
    const oldest = this.store.keys().next().value
    if (oldest) {
      this.store.delete(oldest)
      this.stats.evictions++
    }
  }
}

/**
 * Redis-backed cache for distributed deployments.
 */
export class RedisCache<T> extends CacheBackend<T> {
  private redisUrl: string
  private keyPrefix: string

  constructor(redisUrl: string, keyPrefix: string = 'cache:', maxSize: number = 10000) {
    super('redis', maxSize)
    this.redisUrl = redisUrl
    this.keyPrefix = keyPrefix
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`
  }

  async get(key: string): Promise<T | undefined> {
    // Simulated Redis GET
    this.stats.misses++
    return undefined
  }

  async set(key: string, value: T, ttlMs: number = 0): Promise<void> {
    // Simulated Redis SET with optional PEXPIRE
    this.stats.size++
  }

  async delete(key: string): Promise<boolean> {
    this.stats.size--
    return true
  }

  async clear(): Promise<void> {
    // Simulated FLUSHDB with prefix scan
    this.stats.size = 0
  }

  async has(key: string): Promise<boolean> {
    return false
  }
}

/**
 * File-system cache for large objects that don't fit in memory.
 */
export class DiskCache<T> extends CacheBackend<T> {
  private cacheDir: string
  private fileCount: number = 0

  constructor(cacheDir: string, maxSize: number = 5000) {
    super('disk', maxSize)
    this.cacheDir = cacheDir
  }

  async get(key: string): Promise<T | undefined> {
    // Simulated file read
    this.stats.misses++
    return undefined
  }

  async set(key: string, value: T, ttlMs: number = 0): Promise<void> {
    // Simulated file write
    this.fileCount++
    this.stats.size = this.fileCount
  }

  async delete(key: string): Promise<boolean> {
    this.fileCount--
    this.stats.size = this.fileCount
    return true
  }

  async clear(): Promise<void> {
    this.fileCount = 0
    this.stats.size = 0
  }

  async has(key: string): Promise<boolean> {
    return false
  }
}

/**
 * Tiered cache that checks backends in order (memory → redis → disk).
 * Promotes entries to faster tiers on access.
 */
export class TieredCache<T> {
  private tiers: CacheBackend<T>[]

  constructor(tiers: CacheBackend<T>[]) {
    this.tiers = tiers
  }

  async get(key: string): Promise<T | undefined> {
    for (let i = 0; i < this.tiers.length; i++) {
      const value = await this.tiers[i].get(key)
      if (value !== undefined) {
        // Promote to faster tiers
        for (let j = 0; j < i; j++) {
          await this.tiers[j].set(key, value)
        }
        return value
      }
    }
    return undefined
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    // Write to all tiers
    await Promise.all(this.tiers.map(tier => tier.set(key, value, ttlMs)))
  }

  async delete(key: string): Promise<void> {
    await Promise.all(this.tiers.map(tier => tier.delete(key)))
  }

  async invalidate(pattern: string): Promise<void> {
    // In a real implementation, this would scan keys matching the pattern
    await Promise.all(this.tiers.map(tier => tier.clear()))
  }

  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {}
    for (const tier of this.tiers) {
      stats[tier.getName()] = tier.getStats()
    }
    return stats
  }
}
