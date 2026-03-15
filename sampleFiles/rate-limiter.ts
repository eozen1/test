interface RateLimitEntry {
  tokens: number
  lastRefill: number
  windowStart: number
  requestCount: number
}

interface RateLimitConfig {
  maxTokens: number
  refillRate: number // tokens per second
  windowMs: number // sliding window duration
  maxRequestsPerWindow: number
}

export class RateLimiter {
  private buckets: Map<string, RateLimitEntry> = new Map()
  private config: RateLimitConfig

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? 100,
      refillRate: config.refillRate ?? 10,
      windowMs: config.windowMs ?? 60_000,
      maxRequestsPerWindow: config.maxRequestsPerWindow ?? 60,
    }
  }

  consume(key: string, tokens: number = 1): { allowed: boolean; retryAfter?: number } {
    const now = Date.now()
    let entry = this.buckets.get(key)

    if (!entry) {
      entry = {
        tokens: this.config.maxTokens,
        lastRefill: now,
        windowStart: now,
        requestCount: 0,
      }
      this.buckets.set(key, entry)
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - entry.lastRefill) / 1000
    entry.tokens = Math.min(
      this.config.maxTokens,
      entry.tokens + elapsed * this.config.refillRate
    )
    entry.lastRefill = now

    // Reset window if expired
    if (now - entry.windowStart > this.config.windowMs) {
      entry.windowStart = now
      entry.requestCount = 0
    }

    // Check window limit
    if (entry.requestCount >= this.config.maxRequestsPerWindow) {
      const retryAfter = entry.windowStart + this.config.windowMs - now
      return { allowed: false, retryAfter }
    }

    // Check token bucket
    if (entry.tokens < tokens) {
      const deficit = tokens - entry.tokens
      const retryAfter = (deficit / this.config.refillRate) * 1000
      return { allowed: false, retryAfter }
    }

    entry.tokens -= tokens
    entry.requestCount++
    return { allowed: true }
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  getStatus(key: string): {
    remainingTokens: number
    remainingRequests: number
    windowResetMs: number
  } {
    const entry = this.buckets.get(key)
    if (!entry) {
      return {
        remainingTokens: this.config.maxTokens,
        remainingRequests: this.config.maxRequestsPerWindow,
        windowResetMs: 0,
      }
    }

    const now = Date.now()
    const elapsed = (now - entry.lastRefill) / 1000
    const currentTokens = Math.min(
      this.config.maxTokens,
      entry.tokens + elapsed * this.config.refillRate
    )

    return {
      remainingTokens: Math.floor(currentTokens),
      remainingRequests: this.config.maxRequestsPerWindow - entry.requestCount,
      windowResetMs: Math.max(0, entry.windowStart + this.config.windowMs - now),
    }
  }

  cleanup(): number {
    const now = Date.now()
    let cleaned = 0
    for (const [key, entry] of this.buckets) {
      // Remove entries idle for more than 2 windows
      if (now - entry.lastRefill > this.config.windowMs * 2) {
        this.buckets.delete(key)
        cleaned++
      }
    }
    return cleaned
  }
}
