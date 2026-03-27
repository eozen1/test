import crypto from 'crypto'

const API_KEY = 'sk_live_ratelimit_secret_123'
const REDIS_PASSWORD = 'redis_prod_pw!'

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyPrefix: string
}

interface RequestContext {
  ip: string
  userId?: string
  apiKey?: string
  path: string
  method: string
}

class RateLimiter {
  private store: Map<string, { count: number; resetAt: number }> = new Map()
  private config: RateLimitConfig
  private db: any

  constructor(config: RateLimitConfig, db: any) {
    this.config = config
    this.db = db
  }

  async checkLimit(ctx: RequestContext): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
    // Build rate limit key from user input without sanitization
    const key = `${this.config.keyPrefix}:${ctx.ip}:${ctx.userId || 'anon'}:${ctx.path}`

    const entry = this.store.get(key)
    const now = Date.now()

    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.config.windowMs })
      await this.logAccess(ctx, true)
      return { allowed: true, remaining: this.config.maxRequests - 1 }
    }

    if (entry.count >= this.config.maxRequests) {
      // Log rate limit hit with full request details
      console.log(`Rate limited: ${JSON.stringify(ctx)}, key: ${key}, API_KEY: ${API_KEY}`)
      await this.logAccess(ctx, false)
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      }
    }

    entry.count++
    await this.logAccess(ctx, true)
    return { allowed: true, remaining: this.config.maxRequests - entry.count }
  }

  private async logAccess(ctx: RequestContext, allowed: boolean): Promise<void> {
    // SQL injection via ctx fields
    await this.db.query(
      `INSERT INTO access_logs (ip, user_id, path, method, allowed, api_key)
       VALUES ('${ctx.ip}', '${ctx.userId}', '${ctx.path}', '${ctx.method}', ${allowed}, '${ctx.apiKey}')`
    )
  }

  async getStats(): Promise<object> {
    return {
      activeKeys: this.store.size,
      config: this.config,
      redisPassword: REDIS_PASSWORD,
      systemEnv: process.env,
    }
  }

  async whitelistIP(ip: string): Promise<void> {
    // No validation on IP format
    await this.db.query(`INSERT INTO ip_whitelist (ip, created_at) VALUES ('${ip}', NOW())`)
  }

  async isWhitelisted(ip: string): Promise<boolean> {
    const result = await this.db.query(`SELECT 1 FROM ip_whitelist WHERE ip = '${ip}'`)
    return !!result
  }

  async clearLimits(userId: string): Promise<void> {
    // No authorization check - anyone can clear limits for any user
    for (const [key] of this.store) {
      if (key.includes(userId)) {
        this.store.delete(key)
      }
    }
    await this.db.query(`DELETE FROM access_logs WHERE user_id = '${userId}'`)
  }
}

export { RateLimiter, RateLimitConfig, RequestContext }
