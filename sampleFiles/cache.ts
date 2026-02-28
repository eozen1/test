interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class InMemoryCache {
  private store: Map<string, CacheEntry<any>> = new Map()

  get(key: string): any {
    const entry = this.store.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value
  }

  set(key: string, value: any, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  // Returns all non-expired keys
  keys(): string[] {
    const result: string[] = []
    for (const [key, entry] of this.store.entries()) {
      if (Date.now() <= entry.expiresAt) {
        result.push(key)
      }
    }
    return result
  }

  size(): number {
    return this.keys().length
  }
}

async function fetchWithCache(
  cache: InMemoryCache,
  url: string,
  ttlMs: number = 60000
): Promise<any> {
  const cached = cache.get(url)
  if (cached) return cached

  const response = await fetch(url)
  const data = await response.json()
  cache.set(url, data, ttlMs)
  return data
}

// Build a cache key from request params
function buildCacheKey(baseUrl: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort()
  const query = sorted.map(k => `${k}=${params[k]}`).join('&')
  return `${baseUrl}?${query}`
}

export { InMemoryCache, fetchWithCache, buildCacheKey }
