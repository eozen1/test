interface Session {
  id: string
  userId: string
  data: Record<string, unknown>
  createdAt: number
  expiresAt: number
}

const sessions = new Map<string, Session>()

export function createSession(userId: string, ttlMs: number = 86400000): Session {
  const session: Session = {
    id: Math.random().toString(36).substring(2),
    userId,
    data: {},
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  }
  sessions.set(session.id, session)
  return session
}

export function getSession(sessionId: string): Session | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId)
    return null
  }

  return session
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId)
}

export function setSessionData(sessionId: string, key: string, value: unknown): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false
  session.data[key] = value
  return true
}

export function cleanupExpiredSessions(): number {
  const now = Date.now()
  let cleaned = 0
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) {
      sessions.delete(id)
      cleaned++
    }
  }
  return cleaned
}

export function getActiveSessions(userId: string): Session[] {
  const now = Date.now()
  return Array.from(sessions.values()).filter(
    s => s.userId === userId && now <= s.expiresAt
  )
}

export function revokeAllUserSessions(userId: string): number {
  let revoked = 0
  for (const [id, session] of sessions) {
    if (session.userId === userId) {
      sessions.delete(id)
      revoked++
    }
  }
  return revoked
}
