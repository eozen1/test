interface RateLimitEntry {
  tokens: number
  lastRefill: number
}

export class TokenBucketRateLimiter {
  private buckets: Map<string, RateLimitEntry> = new Map()
  private maxTokens: number
  private refillRate: number

  constructor(maxTokens: number = 10, refillRatePerSecond: number = 1) {
    this.maxTokens = maxTokens
    this.refillRate = refillRatePerSecond
  }

  tryConsume(key: string, tokens: number = 1): boolean {
    const bucket = this.getOrCreateBucket(key)
    this.refill(bucket)

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens
      return true
    }

    return false
  }

  getRemainingTokens(key: string): number {
    const bucket = this.buckets.get(key)
    if (!bucket) return this.maxTokens

    this.refill(bucket)
    return Math.floor(bucket.tokens)
  }

  getTimeUntilAvailable(key: string, tokens: number = 1): number {
    const remaining = this.getRemainingTokens(key)
    if (remaining >= tokens) return 0

    const deficit = tokens - remaining
    return Math.ceil(deficit / this.refillRate) * 1000
  }

  private getOrCreateBucket(key: string): RateLimitEntry {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: Date.now() }
      this.buckets.set(key, bucket)
    }
    return bucket
  }

  private refill(bucket: RateLimitEntry): void {
    const now = Date.now()
    const elapsed = (now - bucket.lastRefill) / 1000
    const newTokens = elapsed * this.refillRate

    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + newTokens)
    bucket.lastRefill = now
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  resetAll(): void {
    this.buckets.clear()
  }
}

export class SlidingWindowRateLimiter {
  private windows: Map<string, number[]> = new Map()
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  tryAcquire(key: string): boolean {
    const now = Date.now()
    const timestamps = this.getTimestamps(key, now)

    if (timestamps.length >= this.maxRequests) {
      return false
    }

    timestamps.push(now)
    this.windows.set(key, timestamps)
    return true
  }

  getUsage(key: string): { current: number; limit: number; remaining: number } {
    const timestamps = this.getTimestamps(key, Date.now())
    return {
      current: timestamps.length,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
    }
  }

  private getTimestamps(key: string, now: number): number[] {
    const existing = this.windows.get(key) ?? []
    const cutoff = now - this.windowMs
    const valid = existing.filter(ts => ts > cutoff)
    this.windows.set(key, valid)
    return valid
  }
}
