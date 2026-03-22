interface TokenBucketConfig {
  capacity: number
  refillRate: number
  refillIntervalMs: number
}

class TokenBucket {
  private tokens: number
  private lastRefill: number
  private config: TokenBucketConfig

  constructor(config: TokenBucketConfig) {
    this.config = config
    this.tokens = config.capacity
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const intervalsElapsed = Math.floor(elapsed / this.config.refillIntervalMs)

    if (intervalsElapsed > 0) {
      this.tokens = Math.min(this.config.capacity, this.tokens + intervalsElapsed * this.config.refillRate)
      this.lastRefill = now
    }
  }

  tryConsume(count = 1): boolean {
    this.refill()

    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }

    return false
  }

  getAvailableTokens(): number {
    this.refill()
    return this.tokens
  }

  getWaitTimeMs(count = 1): number {
    this.refill()

    if (this.tokens >= count) {
      return 0
    }

    const deficit = count - this.tokens
    const intervalsNeeded = Math.ceil(deficit / this.config.refillRate)
    return intervalsNeeded * this.config.refillIntervalMs
  }

  reset(): void {
    this.tokens = this.config.capacity
    this.lastRefill = Date.now()
  }
}

export function createRateLimiter(requestsPerSecond: number): TokenBucket {
  return new TokenBucket({
    capacity: requestsPerSecond * 2,
    refillRate: requestsPerSecond,
    refillIntervalMs: 1000,
  })
}

export default TokenBucket
