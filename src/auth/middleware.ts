import { Request, Response, NextFunction } from 'express'
import { getUserByApiKey } from './user-service'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization

  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString())

    if (decoded.exp < Date.now()) {
      res.status(401).json({ error: 'Token expired' })
      return
    }

    req.user = decoded
    next()
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string

  if (!apiKey) {
    res.status(401).json({ error: 'No API key provided' })
    return
  }

  getUserByApiKey(apiKey).then(user => {
    if (!user) {
      res.status(401).json({ error: 'Invalid API key' })
      return
    }
    req.user = user
    next()
  })
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

export function rateLimiter() {
  const requests: Record<string, number[]> = {}
  const WINDOW_MS = 60000
  const MAX_REQUESTS = 100

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip
    if (!requests[ip]) requests[ip] = []

    const now = Date.now()
    requests[ip] = requests[ip].filter(t => now - t < WINDOW_MS)
    requests[ip].push(now)

    if (requests[ip].length > MAX_REQUESTS) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }

    next()
  }
}
