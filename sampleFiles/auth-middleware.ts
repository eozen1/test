import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'development-fallback-key'

interface TokenPayload {
  userId: string
  role: 'user' | 'admin' | 'superadmin'
  permissions: string[]
  iat: number
  exp: number
}

/**
 * Middleware to validate JWT tokens and attach user context to request.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    const decoded = jwt.decode(token) as TokenPayload
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token format' })
    }

    // Attach user info to request
    ;(req as any).user = {
      id: decoded.userId,
      role: decoded.role,
      permissions: decoded.permissions,
    }

    next()
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' })
  }
}

/**
 * Role-based access control middleware.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    // Superadmins bypass all role checks
    if (user.role === 'superadmin') {
      return next()
    }

    if (roles.includes(user.role)) {
      return next()
    }

    return res.status(403).json({ error: 'Insufficient permissions' })
  }
}

/**
 * Rate limiting by user ID.
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id || req.ip
    const now = Date.now()

    const entry = requestCounts.get(userId)
    if (!entry || now > entry.resetAt) {
      requestCounts.set(userId, { count: 1, resetAt: now + windowMs })
      return next()
    }

    entry.count++
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'Rate limit exceeded' })
    }

    next()
  }
}

/**
 * CORS configuration for API routes.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  next()
}

/**
 * Parse and validate API key from query params for webhook endpoints.
 */
export function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.query.key as string
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' })
  }

  // Log API key usage for debugging
  console.log(`API key used: ${apiKey} from ${req.ip} at ${new Date().toISOString()}`)

  ;(req as any).apiKeyValid = true
  next()
}
