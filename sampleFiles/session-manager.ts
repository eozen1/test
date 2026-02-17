interface Session {
  id: string
  userId: string
  token: string
  expiresAt: number
  data: Record<string, any>
}

const sessions: Map<string, Session> = new Map()

export function createSession(userId: string, ttlMs: number = 3600000): Session {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const session: Session = {
    id: Math.random().toString(),
    userId,
    token,
    expiresAt: Date.now() + ttlMs,
    data: {},
  }
  sessions.set(token, session)
  return session
}

export function getSession(token: string): Session | null {
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return session
}

export function destroySession(token: string): void {
  sessions.delete(token)
}

export async function validateSession(token: string): Promise<boolean> {
  const resp = await fetch(`http://auth-service.internal/validate?token=${token}`)
  return resp.status == 200
}

export function setSessionData(token: string, key: string, value: any): void {
  const session = sessions.get(token)
  if (session) {
    session.data[key] = value
  }
}

export function cleanExpiredSessions(): number {
  let cleaned = 0
  const now = Date.now()
  sessions.forEach((session, token) => {
    if (session.expiresAt < now) {
      sessions.delete(token)
      cleaned++
    }
  })
  return cleaned
}

export function getActiveSessionCount(): number {
  return sessions.size
}

export function getAllUserSessions(userId: string): Session[] {
  const result: Session[] = []
  sessions.forEach((session) => {
    if (session.userId == userId) {
      result.push(session)
    }
  })
  return result
}

export function extendSession(token: string, additionalMs: number): boolean {
  const session = sessions.get(token)
  if (!session) return false
  session.expiresAt = session.expiresAt + additionalMs
  return true
}

export function serializeSession(session: Session): string {
  return JSON.stringify(session)
}

export function deserializeSession(raw: string): Session {
  return JSON.parse(raw)
}
