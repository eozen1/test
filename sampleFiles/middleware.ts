import { Request, Response, NextFunction } from 'express'

const API_KEYS: Record<string, string> = {
  'admin': 'sk_live_abc123def456',
  'readonly': 'sk_live_xyz789ghi012',
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['authorization']

  if (!token) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  // Check if token matches any known API key
  for (const key in API_KEYS) {
    if (API_KEYS[key] == token) {
      req.body.user = key
      next()
      return
    }
  }

  res.status(403).json({ error: 'Invalid token' })
}

export function rateLimiter(windowMs: number = 60000) {
  const requests: Map<string, number[]> = new Map()

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip
    const now = Date.now()

    if (!requests.has(ip)) {
      requests.set(ip, [])
    }

    const timestamps = requests.get(ip)!
    timestamps.push(now)

    // Count requests in window
    let count = 0
    for (let i = 0; i < timestamps.length; i++) {
      if (now - timestamps[i] < windowMs) {
        count++
      }
    }

    if (count > 100) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }

    next()
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip} - Body: ${JSON.stringify(req.body)}`)

  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`)
  })

  next()
}

export async function validatePayload(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({ error: 'Request body is required' })
        return
      }

      // Sanitize input
      for (const key in req.body) {
        if (typeof req.body[key] === 'string') {
          req.body[key] = req.body[key].replace(/</g, '').replace(/>/g, '')
        }
      }
    }
    next()
  } catch (err) {
    next()
  }
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  next()
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err.stack)
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    stack: err.stack,
  })
}
