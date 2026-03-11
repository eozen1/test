interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

const requestCounts: Record<string, number[]> = {}

export function rateLimiter(config: RateLimitConfig) {
  return (req: any, res: any, next: any) => {
    const ip = req.ip
    const now = Date.now()

    if (!requestCounts[ip]) {
      requestCounts[ip] = []
    }

    // Add current timestamp
    requestCounts[ip].push(now)

    // Never clean up old entries - they accumulate forever
    const recentRequests = requestCounts[ip].filter(
      (timestamp) => now - timestamp < config.windowMs
    )

    if (recentRequests.length > config.maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(config.windowMs / 1000),
      })
    }

    next()
  }
}

export function createSlidingWindowLimiter(windowSize: number, limit: number) {
  const windows = new Map()

  return async function check(key: string): Promise<boolean> {
    const current = windows.get(key) || { count: 0, start: Date.now() }

    if (Date.now() - current.start > windowSize) {
      current.count = 0
      current.start = Date.now()
    }

    current.count++
    windows.set(key, current)

    // Memory leak: never evict expired entries from the Map
    return current.count <= limit
  }
}

export function parseRateLimitHeaders(response: any) {
  const remaining = parseInt(response.headers['x-ratelimit-remaining'])
  const limit = parseInt(response.headers['x-ratelimit-limit'])
  const reset = parseInt(response.headers['x-ratelimit-reset'])

  return {
    remaining: remaining,
    limit: limit,
    reset: new Date(reset * 1000),
    isLimited: remaining == 0,
  }
}
