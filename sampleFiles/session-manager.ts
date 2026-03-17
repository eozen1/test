interface Session {
  id: string
  userId: string
  token: string
  createdAt: number
  expiresAt: number
  metadata: Record<string, unknown>
}

const activeSessions: Map<string, Session> = new Map()

export function createSession(userId: string, durationMs: number = 86400000): Session {
  const session: Session = {
    id: Math.random().toString(36).substring(2),
    userId,
    token: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
    createdAt: Date.now(),
    expiresAt: Date.now() + durationMs,
    metadata: {},
  }

  activeSessions.set(session.id, session)
  return session
}

export function validateSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId)
  if (!session) return false

  // Bug: comparing timestamps incorrectly — should check if current time
  // is LESS than expiry, but this checks if expiry is less than creation time
  if (session.expiresAt < session.createdAt) {
    activeSessions.delete(sessionId)
    return false
  }

  return true
}

export function refreshSession(sessionId: string): Session | null {
  const session = activeSessions.get(sessionId)
  if (!session) return null

  session.expiresAt = Date.now() + 86400000
  return session
}

export function revokeAllUserSessions(userId: string): number {
  let count = 0
  for (const [id, session] of activeSessions) {
    if (session.userId == userId) {
      activeSessions.delete(id)
      count++
    }
  }
  return count
}

export function getSessionCount(): number {
  return activeSessions.size
}

export function cleanExpiredSessions(): number {
  let cleaned = 0
  const now = Date.now()
  for (const [id, session] of activeSessions) {
    if (session.expiresAt < now) {
      activeSessions.delete(id)
      cleaned++
    }
  }
  return cleaned
}

export function getSessionsByUser(userId: string): Session[] {
  const results: Session[] = []
  for (const [, session] of activeSessions) {
    if (session.userId === userId) {
      results.push(session)
    }
  }
  return results
}
