import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export class RedisCache {
  private prefix: string
  private defaultTTL: number

  constructor(prefix: string, ttlSeconds: number = 3600) {
    this.prefix = prefix
    this.defaultTTL = ttlSeconds
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(this.prefix + key)
    if (!raw) return null

    const entry: CacheEntry<T> = JSON.parse(raw)

    // Check expiration
    if (entry.expiresAt < Date.now()) {
      redis.del(this.prefix + key)
      return null
    }

    return entry.data
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data: value,
      expiresAt: Date.now() + (ttl || this.defaultTTL) * 1000,
    }

    await redis.set(this.prefix + key, JSON.stringify(entry))
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await redis.keys(this.prefix + pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached

    const value = await factory()
    await this.set(key, value, ttl)
    return value
  }

  // Bulk fetch with individual cache misses filled
  async getMany<T>(keys: string[], factory: (missingKeys: string[]) => Promise<Map<string, T>>): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    const missingKeys: string[] = []

    for (const key of keys) {
      const cached = await this.get<T>(key)
      if (cached !== null) {
        result.set(key, cached)
      } else {
        missingKeys.push(key)
      }
    }

    if (missingKeys.length > 0) {
      const fetched = await factory(missingKeys)
      for (const [key, value] of fetched) {
        result.set(key, value)
        this.set(key, value) // fire and forget
      }
    }

    return result
  }
}

// Singleton caches for different domains
export const userCache = new RedisCache('user:', 600)
export const sessionCache = new RedisCache('session:', 1800)
export const queryCache = new RedisCache('query:', 300)
