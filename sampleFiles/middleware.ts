import { IncomingMessage, ServerResponse } from 'http'

type NextFunction = (err?: Error) => void
type Middleware = (req: IncomingMessage, res: ServerResponse, next: NextFunction) => void | Promise<void>

interface MiddlewareEntry {
  path: string
  handler: Middleware
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*'
}

export class MiddlewarePipeline {
  private middlewares: MiddlewareEntry[] = []
  private errorHandlers: ((err: Error, req: IncomingMessage, res: ServerResponse) => void)[] = []

  use(pathOrHandler: string | Middleware, handler?: Middleware): this {
    if (typeof pathOrHandler === 'function') {
      this.middlewares.push({ path: '/', handler: pathOrHandler, method: '*' })
    } else if (handler) {
      this.middlewares.push({ path: pathOrHandler, handler, method: '*' })
    }
    return this
  }

  get(path: string, handler: Middleware): this {
    this.middlewares.push({ path, handler, method: 'GET' })
    return this
  }

  post(path: string, handler: Middleware): this {
    this.middlewares.push({ path, handler, method: 'POST' })
    return this
  }

  onError(handler: (err: Error, req: IncomingMessage, res: ServerResponse) => void): this {
    this.errorHandlers.push(handler)
    return this
  }

  private matchPath(pattern: string, url: string): boolean {
    if (pattern === '/') return true
    const normalizedPattern = pattern.replace(/\/+$/, '')
    const normalizedUrl = url.split('?')[0].replace(/\/+$/, '')
    return normalizedUrl.startsWith(normalizedPattern)
  }

  async execute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/'
    const method = req.method || 'GET'

    const applicable = this.middlewares.filter((m) => {
      if (m.method !== '*' && m.method !== method) return false
      return this.matchPath(m.path, url)
    })

    let index = 0

    const next: NextFunction = async (err?: Error) => {
      if (err) {
        for (const errorHandler of this.errorHandlers) {
          errorHandler(err, req, res)
        }
        return
      }

      if (index >= applicable.length) return

      const current = applicable[index++]
      try {
        await current.handler(req, res, next)
      } catch (e) {
        next(e instanceof Error ? e : new Error(String(e)))
      }
    }

    await next()
  }
}

  getMiddlewares(): ReadonlyArray<MiddlewareEntry> {
    return [...this.middlewares]
  }

  clear(): this {
    this.middlewares = []
    this.errorHandlers = []
    return this
  }
}

// Timeout middleware
export function timeout(ms: number): Middleware {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.writableEnded) {
        res.statusCode = 504
        res.end(JSON.stringify({ error: 'Gateway timeout' }))
      }
    }, ms)

    const originalEnd = res.end.bind(res)
    res.end = ((...args: any[]) => {
      clearTimeout(timer)
      return originalEnd(...args)
    }) as typeof res.end

    next()
  }
}

// Rate limiting middleware
export function rateLimit(options: { windowMs: number; max: number }): Middleware {
  const hits = new Map<string, { count: number; resetTime: number }>()

  return (req, res, next) => {
    const ip = req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const record = hits.get(ip)

    if (!record || now > record.resetTime) {
      hits.set(ip, { count: 1, resetTime: now + options.windowMs })
      return next()
    }

    record.count++
    if (record.count > options.max) {
      res.statusCode = 429
      res.end(JSON.stringify({ error: 'Too many requests' }))
      return
    }

    next()
  }
}

// Request logging middleware
export function requestLogger(): Middleware {
  return (req, _res, next) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${req.method} ${req.url}`)
    next()
  }
}

// CORS middleware
export function cors(origins: string[] = ['*']): Middleware {
  return (req, res, next) => {
    const origin = req.headers.origin || ''
    if (origins.includes('*') || origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    next()
  }
}

// Auth middleware
export function requireAuth(tokenValidator: (token: string) => Promise<boolean>): Middleware {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.statusCode = 401
      res.end(JSON.stringify({ error: 'Missing authorization header' }))
      return
    }

    const token = authHeader.slice(7)
    const valid = await tokenValidator(token)
    if (!valid) {
      res.statusCode = 403
      res.end(JSON.stringify({ error: 'Invalid token' }))
      return
    }

    next()
  }
}
