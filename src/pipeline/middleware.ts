type MiddlewareContext = {
  requestId: string
  timestamp: number
  metadata: Record<string, unknown>
}

type NextFunction = () => Promise<void>
type MiddlewareFn = (ctx: MiddlewareContext, next: NextFunction) => Promise<void>

export class MiddlewareChain {
  private middlewares: MiddlewareFn[] = []

  use(fn: MiddlewareFn): this {
    this.middlewares.push(fn)
    return this
  }

  async run(ctx: MiddlewareContext): Promise<void> {
    let index = 0

    const next = async (): Promise<void> => {
      if (index >= this.middlewares.length) return
      const middleware = this.middlewares[index++]
      await middleware(ctx, next)
    }

    await next()
  }
}

// Built-in middleware factories
export function withTimeout(ms: number): MiddlewareFn {
  return async (ctx, next) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)

    try {
      await next()
    } finally {
      clearTimeout(timer)
    }
  }
}

export function withRetry(maxAttempts: number, delayMs: number = 100): MiddlewareFn {
  return async (ctx, next) => {
    let lastError: Error | undefined

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await next()
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
        }
      }
    }

    throw lastError
  }
}

export function withLogging(logger: { info: (msg: string) => void; error: (msg: string) => void }): MiddlewareFn {
  return async (ctx, next) => {
    const start = Date.now()
    logger.info(`[${ctx.requestId}] Starting at ${new Date(ctx.timestamp).toISOString()}`)

    try {
      await next()
      logger.info(`[${ctx.requestId}] Completed in ${Date.now() - start}ms`)
    } catch (err) {
      logger.error(`[${ctx.requestId}] Failed after ${Date.now() - start}ms: ${err}`)
      throw err
    }
  }
}

export function withMetrics(recorder: { record: (name: string, value: number) => void }): MiddlewareFn {
  return async (ctx, next) => {
    const start = Date.now()

    try {
      await next()
      recorder.record('pipeline.success', 1)
    } catch {
      recorder.record('pipeline.failure', 1)
      throw new Error('Pipeline execution failed')
    } finally {
      recorder.record('pipeline.duration', Date.now() - start)
    }
  }
}
