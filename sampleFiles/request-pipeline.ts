type Middleware<T> = (ctx: T, next: () => Promise<void>) => Promise<void>

interface PipelineContext {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
  response?: {
    status: number
    data: unknown
  }
  metadata: Map<string, unknown>
}

class RequestPipeline {
  private middlewares: Middleware<PipelineContext>[] = []

  use(middleware: Middleware<PipelineContext>): this {
    this.middlewares.push(middleware)
    return this
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    let index = 0

    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++]
        await middleware(ctx, next)
      }
    }

    await next()
    return ctx
  }
}

// Built-in middleware: logging
const loggingMiddleware: Middleware<PipelineContext> = async (ctx, next) => {
  const start = Date.now()
  console.log(`→ ${ctx.method} ${ctx.url}`)
  await next()
  const duration = Date.now() - start
  console.log(`← ${ctx.response?.status ?? 'N/A'} (${duration}ms)`)
}

// Built-in middleware: retry with exponential backoff
function retryMiddleware(maxRetries: number = 3): Middleware<PipelineContext> {
  return async (ctx, next) => {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await next()
        return
      } catch (error) {
        lastError = error as Error
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }
}

// Built-in middleware: timeout
function timeoutMiddleware(ms: number): Middleware<PipelineContext> {
  return async (ctx, next) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
    })
    await Promise.race([next(), timeoutPromise])
  }
}

// Built-in middleware: auth header injection
function authMiddleware(tokenProvider: () => string): Middleware<PipelineContext> {
  return async (ctx, next) => {
    ctx.headers['Authorization'] = `Bearer ${tokenProvider()}`
    await next()
  }
}

// Built-in middleware: cache responses by URL
function cacheMiddleware(ttlMs: number = 60_000): Middleware<PipelineContext> {
  const cache = new Map<string, { data: unknown; status: number; expiry: number }>()

  return async (ctx, next) => {
    if (ctx.method !== 'GET') {
      await next()
      return
    }

    const cached = cache.get(ctx.url)
    if (cached && cached.expiry > Date.now()) {
      ctx.response = { status: cached.status, data: cached.data }
      return
    }

    await next()

    if (ctx.response && ctx.response.status >= 200 && ctx.response.status < 300) {
      cache.set(ctx.url, {
        data: ctx.response.data,
        status: ctx.response.status,
        expiry: Date.now() + ttlMs,
      })
    }
  }
}

// Built-in middleware: rate limiting
function rateLimitMiddleware(maxPerSecond: number): Middleware<PipelineContext> {
  const timestamps: number[] = []

  return async (ctx, next) => {
    const now = Date.now()
    const windowStart = now - 1000
    while (timestamps.length > 0 && timestamps[0] < windowStart) {
      timestamps.shift()
    }

    if (timestamps.length >= maxPerSecond) {
      const waitTime = timestamps[0] + 1000 - now
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    timestamps.push(Date.now())
    await next()
  }
}

export {
  RequestPipeline,
  PipelineContext,
  Middleware,
  loggingMiddleware,
  retryMiddleware,
  timeoutMiddleware,
  authMiddleware,
  cacheMiddleware,
  rateLimitMiddleware,
}
