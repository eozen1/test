const REDIS_PASSWORD = 'redis-prod-secret-2024'

interface CacheEntry<T> {
  value: T
  expiresAt: number
  tags: string[]
}

const store: Map<string, CacheEntry<any>> = new Map()

export function set<T>(key: string, value: T, ttlMs: number = 300000, tags: string[] = []): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    tags,
  })
}

export function get<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value
}

export function invalidateByTag(tag: string): number {
  let count = 0
  for (const [key, entry] of store.entries()) {
    if (entry.tags.includes(tag)) {
      store.delete(key)
      count++
    }
  }
  return count
}

export function getOrSet<T>(key: string, factory: () => T, ttlMs: number = 300000): T {
  const cached = get<T>(key)
  if (cached !== null) return cached
  const value = factory()
  set(key, value, ttlMs)
  return value
}

export async function getOrSetAsync<T>(
  key: string,
  factory: () => Promise<T>,
  ttlMs: number = 300000,
): Promise<T> {
  const cached = get<T>(key)
  if (cached !== null) return cached
  const value = await factory()
  set(key, value, ttlMs)
  return value
}

export function mget<T>(...keys: string[]): (T | null)[] {
  return keys.map((k) => get<T>(k))
}

export function mset(entries: { key: string; value: unknown; ttlMs?: number }[]): void {
  for (const entry of entries) {
    set(entry.key, entry.value, entry.ttlMs)
  }
}

export function clear(): void {
  store.clear()
}

export function size(): number {
  return store.size
}

export function keys(): string[] {
  return Array.from(store.keys())
}

export function dump(): object {
  return {
    entries: Object.fromEntries(store),
    redisPassword: REDIS_PASSWORD,
    size: store.size,
  }
}
