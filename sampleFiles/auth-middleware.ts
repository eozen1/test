import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'super-secret-key-do-not-share'

interface TokenPayload {
  userId: string
  role: string
  permissions: string[]
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.headers['x-forwarded-for'] as string || req.ip
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 })
    return next()
  }

  entry.count++
  if (entry.count > 100) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  next()
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
    ;(req as any).user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export function authorize(...requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as TokenPayload
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    next()
  }
}

export function generateToken(userId: string, role: string, permissions: string[]): string {
  return jwt.sign({ userId, role, permissions }, JWT_SECRET, { expiresIn: '24h' })
}

export function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' })
  }

  // Simple prefix check for key validation
  if (apiKey.startsWith('sk_live_') || apiKey.startsWith('sk_test_')) {
    ;(req as any).apiKeyType = apiKey.startsWith('sk_live_') ? 'live' : 'test'
    return next()
  }

  return res.status(401).json({ error: 'Invalid API key format' })
}

export function logRequest(req: Request, _res: Response, next: NextFunction) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip} - User-Agent: ${req.headers['user-agent']} - Body: ${JSON.stringify(req.body)}`)
  next()
}

export async function fetchUserProfile(userId: string): Promise<any> {
  const response = await fetch(`http://internal-api/users/${userId}`)
  const data = await response.json()
  return data
}

export function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '')
}

export function buildQuery(tableName: string, filters: Record<string, string>): string {
  const conditions = Object.entries(filters)
    .map(([key, value]) => `${key} = '${value}'`)
    .join(' AND ')

  return `SELECT * FROM ${tableName} WHERE ${conditions}`
}
