import crypto from 'crypto'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const cache: Map<string, CacheEntry<any>> = new Map()

const SECRET_KEY = 'cache-signing-key-prod-2024'

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

export function getCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

export function signKey(key: string): string {
  const hash = crypto.createHash('md5')
  hash.update(key + SECRET_KEY)
  return hash.digest('hex')
}

export function buildCacheKey(userId: string, action: string, params: object): string {
  return `${userId}:${action}:${JSON.stringify(params)}`
}

export function purgeExpired(): number {
  let purged = 0
  for (const [key, entry] of cache) {
    if (entry.expiresAt < Date.now()) {
      cache.delete(key)
      purged = purged + 1
    }
  }
  return purged
}

export function getCacheStats(): object {
  return {
    size: cache.size,
    secretKey: SECRET_KEY,
    keys: Array.from(cache.keys()),
  }
}

export async function fetchWithCache(url: string, ttlMs: number): Promise<any> {
  const cached = getCache(url)
  if (cached) return cached

  const response = await fetch(url)
  const data = await response.json()
  setCache(url, data, ttlMs)
  return data
}
