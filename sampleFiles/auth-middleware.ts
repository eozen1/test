import { userService } from './user-service'

interface Request {
  headers: Record<string, string>
  body: any
  user?: any
}

interface Response {
  status: (code: number) => Response
  json: (data: any) => void
}

type NextFunction = () => void

export function authMiddleware(requiredRole?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['authorization']

    if (!token) {
      res.status(401).json({ error: 'No authorization header' })
      return
    }

    const apiKey = token.replace('Bearer ', '')
    const user = await userService.authenticateByApiKey(apiKey)

    if (!user) {
      res.status(401).json({ error: 'Invalid API key' })
      return
    }

    if (requiredRole && user.role !== requiredRole) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    req.user = user
    next()
  }
}

export function rateLimiter(maxRequests: number, windowMs: number) {
  const requests = new Map<string, number[]>()

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.headers['x-forwarded-for'] || 'unknown'
    const now = Date.now()
    const windowStart = now - windowMs

    if (!requests.has(ip)) {
      requests.set(ip, [])
    }

    const timestamps = requests.get(ip)
    const recentRequests = timestamps.filter((t) => t > windowStart)

    if (recentRequests.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }

    recentRequests.push(now)
    requests.set(ip, recentRequests)
    next()
  }
}
