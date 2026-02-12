interface RateLimiterConfig {
  maxRequests: number
  windowMs: number
  burstLimit: number
}

interface RateLimitEntry {
  count: number
  windowStart: number
  burstCount: number
  lastRequest: number
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: 100,
  windowMs: 60_000,
  burstLimit: 10,
}

class RateLimiter {
  private config: RateLimiterConfig
  private entries: Map<string, RateLimitEntry> = new Map()

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  isAllowed(clientId: string): boolean {
    const now = Date.now()
    const entry = this.entries.get(clientId)

    if (!entry) {
      this.entries.set(clientId, {
        count: 1,
        windowStart: now,
        burstCount: 1,
        lastRequest: now,
      })
      return true
    }

    // Reset window if expired
    if (now - entry.windowStart > this.config.windowMs) {
      entry.count = 1
      entry.windowStart = now
      entry.burstCount = 1
      entry.lastRequest = now
      return true
    }

    // Check burst limit (requests within 1 second)
    if (now - entry.lastRequest < 1000) {
      entry.burstCount++
      if (entry.burstCount > this.config.burstLimit) {
        return false
      }
    } else {
      entry.burstCount = 1
    }

    entry.lastRequest = now
    entry.count++

    return entry.count <= this.config.maxRequests
  }

  getRemainingRequests(clientId: string): number {
    const entry = this.entries.get(clientId)
    if (!entry) return this.config.maxRequests

    const now = Date.now()
    if (now - entry.windowStart > this.config.windowMs) {
      return this.config.maxRequests
    }

    return Math.max(0, this.config.maxRequests - entry.count)
  }

  reset(clientId: string): void {
    this.entries.delete(clientId)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart > this.config.windowMs * 2) {
        this.entries.delete(key)
      }
    }
  }
}

export { RateLimiter, RateLimiterConfig, RateLimitEntry }
