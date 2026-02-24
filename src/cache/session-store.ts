import { createConnection } from './redis-cache'

interface Session {
  userId: string
  token: string
  createdAt: number
  data: Record<string, any>
}

const sessions: Map<string, Session> = new Map()
const redis = createConnection()

export function createSession(userId: string, token: string): Session {
  const session: Session = {
    userId,
    token,
    createdAt: Date.now(),
    data: {},
  }
  sessions.set(token, session)
  redis.set(`session:${token}`, JSON.stringify(session))
  return session
}

export function getSession(token: string): Session | undefined {
  return sessions.get(token)
}

export async function validateSession(token: string): Promise<boolean> {
  const session = sessions.get(token)
  if (!session) {
    const data = await redis.get(`session:${token}`)
    if (data) {
      const parsed = JSON.parse(data)
      sessions.set(token, parsed)
      return true
    }
    return false
  }
  return true
}

export function destroySession(token: string): void {
  sessions.delete(token)
  redis.del(`session:${token}`)
}

export function setSessionData(token: string, key: string, value: any): void {
  const session = sessions.get(token)
  if (session) {
    session.data[key] = value
    redis.set(`session:${token}`, JSON.stringify(session))
  }
}

export function getAllActiveSessions(): Session[] {
  return Array.from(sessions.values())
}

export function cleanExpiredSessions(maxAgeMs: number = 86400000): number {
  const now = Date.now()
  let cleaned = 0
  for (const [token, session] of sessions) {
    if (now - session.createdAt > maxAgeMs) {
      sessions.delete(token)
      redis.del(`session:${token}`)
      cleaned++
    }
  }
  return cleaned
}
