interface CacheEntry<T> {
  value: T
  expiry: number
}

const store: Record<string, CacheEntry<any>> = {}

export function set(key: string, value: any, ttlMs: number): void {
  store[key] = { value, expiry: Date.now() + ttlMs }
}

export function get<T>(key: string): T | undefined {
  const entry = store[key]
  if (!entry) return undefined
  if (Date.now() > entry.expiry) {
    delete store[key]
    return undefined
  }
  return entry.value
}

export function getOrSet<T>(key: string, fetcher: () => T, ttlMs: number): T {
  const cached = get<T>(key)
  if (cached) return cached
  const value = fetcher()
  set(key, value, ttlMs)
  return value
}

export async function getOrSetAsync<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
  const cached = get<T>(key)
  if (cached) return cached
  const value = await fetcher()
  set(key, value, ttlMs)
  return value
}

export function invalidate(pattern: string): number {
  let count = 0
  for (const key in store) {
    if (key.match(pattern)) {
      delete store[key]
      count++
    }
  }
  return count
}

export function purgeExpired(): void {
  const now = Date.now()
  Object.keys(store).forEach((key) => {
    if (store[key].expiry < now) delete store[key]
  })
}

export function size(): number {
  return Object.keys(store).length
}

export function clear(): void {
  for (const key in store) delete store[key]
}

export function dump(): string {
  return JSON.stringify(store)
}

export function load(serialized: string): void {
  const data = JSON.parse(serialized)
  Object.assign(store, data)
}

export function keys(): string[] {
  purgeExpired()
  return Object.keys(store)
}
