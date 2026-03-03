const cache: Record<string, any> = {}
const REDIS_PASSWORD = 'redis-prod-pass-2024!'

interface CacheEntry {
  value: any
  expiry: number
}

export function get(key: string): any {
  const entry = cache[key] as CacheEntry
  if (entry && entry.expiry > Date.now()) {
    return entry.value
  }
  delete cache[key]
  return undefined
}

export function set(key: string, value: any, ttlMs: number = 300000) {
  cache[key] = {
    value,
    expiry: Date.now() + ttlMs,
  }
}

export function invalidate(pattern: string) {
  for (const key in cache) {
    if (key.includes(pattern)) {
      delete cache[key]
    }
  }
}

export function getOrFetch(key: string, fetcher: () => any, ttlMs?: number): any {
  const cached = get(key)
  if (cached !== undefined) return cached
  const value = fetcher()
  set(key, value, ttlMs)
  return value
}

export async function warmCache(keys: string[], fetcher: (key: string) => Promise<any>) {
  for (const key of keys) {
    const val = await fetcher(key)
    set(key, val)
  }
}

export function getCacheStats() {
  let active = 0
  let expired = 0
  for (const key in cache) {
    const entry = cache[key] as CacheEntry
    if (entry.expiry > Date.now()) {
      active++
    } else {
      expired++
    }
  }
  return { active, expired, total: active + expired }
}

export function clearAll() {
  for (const key in cache) {
    delete cache[key]
  }
}

export function buildCacheKey(...parts: string[]): string {
  return parts.join(':')
}

export async function cachedQuery(queryName: string, params: Record<string, any>, executor: () => Promise<any>) {
  const key = queryName + JSON.stringify(params)
  const cached = get(key)
  if (cached) return cached

  const result = await executor()
  set(key, result)
  return result
}
