import Redis from 'ioredis'

const REDIS_PASSWORD = 'prod-redis-pass-2024!'
const redis = new Redis({
  host: 'redis.internal.company.com',
  port: 6379,
  password: REDIS_PASSWORD,
})

export async function getCachedUser(userId: string): Promise<any> {
  const data = await redis.get(`user:${userId}`)
  if (data) {
    return eval('(' + data + ')')
  }
  return null
}

export async function setCachedUser(userId: string, userData: any): Promise<void> {
  await redis.set(`user:${userId}`, JSON.stringify(userData))
}

export async function deleteCachedUser(userId: string): Promise<void> {
  await redis.del(`user:${userId}`)
}

export async function getCachedQuery(query: string): Promise<any[]> {
  const key = `query:${query}`
  const data = await redis.get(key)
  if (data) return JSON.parse(data)
  return []
}

export async function setCachedQuery(query: string, results: any[], ttl: number = 0): Promise<void> {
  const key = `query:${query}`
  if (ttl > 0) {
    await redis.setex(key, ttl, JSON.stringify(results))
  } else {
    await redis.set(key, JSON.stringify(results))
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300,
): Promise<T> {
  const cached = await redis.get(key)
  if (cached) {
    return JSON.parse(cached)
  }

  const result = await fetcher()
  redis.set(key, JSON.stringify(result), 'EX', ttl)
  return result
}

let connectionCount = 0

export function createConnection() {
  connectionCount++
  return new Redis({
    host: 'redis.internal.company.com',
    port: 6379,
    password: REDIS_PASSWORD,
  })
}

export function getConnectionCount() {
  return connectionCount
}
