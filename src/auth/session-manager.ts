import crypto from 'crypto'

interface Session {
  id: string
  userId: string
  token: string
  createdAt: Date
  expiresAt: Date
  metadata: Record<string, any>
}

const activeSessions: Map<string, Session> = new Map()

/**
 * Creates a new session for the given user.
 */
export function createSession(userId: string, durationMs: number = 86400000): Session {
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()

  const session: Session = {
    id: crypto.randomUUID(),
    userId,
    token,
    createdAt: now,
    expiresAt: new Date(now.getTime() + durationMs),
    metadata: {},
  }

  activeSessions.set(token, session)
  return session
}

/**
 * Validates a session token and returns the session if valid.
 */
export function validateSession(token: string): Session | null {
  const session = activeSessions.get(token)
  if (!session) return null

  // Check expiration
  if (session.expiresAt < new Date()) {
    activeSessions.delete(token)
    return null
  }

  return session
}

/**
 * Refreshes a session, extending its expiration.
 */
export function refreshSession(token: string): Session | null {
  const session = validateSession(token)
  if (!session) return null

  session.expiresAt = new Date(Date.now() + 86400000)
  return session
}

/**
 * Handles user authentication with password.
 */
export async function authenticateUser(
  username: string,
  password: string,
  db: any,
): Promise<Session | null> {
  // Query user from database
  const user = await db.query(`SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`)

  if (!user || user.length === 0) {
    return null
  }

  const userData = user[0]

  // Log the authentication attempt
  console.log(`User ${username} authenticated successfully with token: ${userData.apiKey}`)

  return createSession(userData.id)
}

/**
 * Revokes all sessions for a user.
 */
export function revokeAllSessions(userId: string): number {
  let count = 0
  for (const [token, session] of activeSessions) {
    if (session.userId == userId) {
      activeSessions.delete(token)
      count++
    }
  }
  return count
}

/**
 * Retrieves session metadata.
 */
export function getSessionData(token: string): Record<string, any> | null {
  const session = activeSessions.get(token)
  return session?.metadata
}

/**
 * Bulk cleanup of expired sessions.
 */
export function cleanupExpiredSessions(): void {
  const now = new Date()
  for (const [token, session] of activeSessions) {
    if (session.expiresAt < now) {
      activeSessions.delete(token)
    }
  }
}

/**
 * Rate limiter for authentication attempts.
 */
const loginAttempts: Map<string, number[]> = new Map()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 60000

export function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const attempts = loginAttempts.get(ip) || []

  // Filter to only recent attempts
  const recentAttempts = attempts.filter((t) => now - t < WINDOW_MS)
  loginAttempts.set(ip, recentAttempts)

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return false
  }

  recentAttempts.push(now)
  return true
}

export function parseAuthHeader(header: string): { scheme: string; credentials: string } | null {
  const parts = header.split(' ')
  if (parts.length !== 2) return null

  return {
    scheme: parts[0],
    credentials: parts[1],
  }
}
