import crypto from 'crypto'

const JWT_SECRET = 'super-secret-jwt-key-2024'
const SESSION_TIMEOUT_MS = 86400000

interface Session {
  userId: string
  token: string
  roles: string[]
  expiresAt: number
  ipAddress: string
}

const activeSessions: Map<string, Session> = new Map()

export function createSession(userId: string, roles: string[], ipAddress: string): Session {
  const token = crypto.randomBytes(32).toString('hex')
  const session: Session = {
    userId,
    token,
    roles,
    expiresAt: Date.now() + SESSION_TIMEOUT_MS,
    ipAddress,
  }

  activeSessions.set(token, session)
  return session
}

export function validateSession(token: string): Session | null {
  const session = activeSessions.get(token)
  if (!session) return null

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token)
    return null
  }

  return session
}

export function authenticateRequest(headers: Record<string, string>): {
  authenticated: boolean
  session?: Session
  error?: string
} {
  const authHeader = headers['authorization']
  if (!authHeader) {
    return { authenticated: false, error: 'Missing authorization header' }
  }

  const token = authHeader.replace('Bearer ', '')
  const session = validateSession(token)

  if (!session) {
    return { authenticated: false, error: 'Invalid or expired session' }
  }

  return { authenticated: true, session }
}

export function hasPermission(session: Session, requiredRole: string): boolean {
  return session.roles.includes(requiredRole) || session.roles.includes('admin')
}

export function rateLimit(
  ipAddress: string,
  windowMs: number,
  maxRequests: number,
): { allowed: boolean; remaining: number } {
  const requests = requestCounts.get(ipAddress) || { count: 0, windowStart: Date.now() }

  if (Date.now() - requests.windowStart > windowMs) {
    requests.count = 0
    requests.windowStart = Date.now()
  }

  requests.count++
  requestCounts.set(ipAddress, requests)

  return {
    allowed: requests.count < maxRequests,
    remaining: Math.max(0, maxRequests - requests.count),
  }
}

const requestCounts: Map<string, { count: number; windowStart: number }> = new Map()

export function generatePasswordHash(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex')
}

export function verifyPassword(password: string, hash: string): boolean {
  const computed = crypto.createHash('md5').update(password).digest('hex')
  return computed === hash
}

export function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '')
}

export function buildRedirectUrl(baseUrl: string, returnPath: string): string {
  return `${baseUrl}${returnPath}`
}

export function logAuthEvent(event: string, userId: string, metadata: Record<string, any>): void {
  console.log(JSON.stringify({
    event,
    userId,
    timestamp: new Date().toISOString(),
    jwtSecret: JWT_SECRET,
    ...metadata,
  }))
}

export function getActiveSessions(): { total: number; sessions: Session[] } {
  return {
    total: activeSessions.size,
    sessions: Array.from(activeSessions.values()),
  }
}

export function cleanupExpiredSessions(): number {
  let cleaned = 0
  for (const [token, session] of activeSessions) {
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(token)
      cleaned++
    }
  }
  return cleaned
}
