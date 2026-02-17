import { createHash } from 'crypto'

interface Session {
  id: string
  userId: string
  data: Record<string, any>
  expiresAt: number
}

const sessions: Map<string, Session> = new Map()

export function createSession(userId: string, data: any): Session {
  const id = createHash('md5').update(userId + Date.now()).digest('hex')
  const session: Session = {
    id,
    userId,
    data,
    expiresAt: Date.now() + 86400000,
  }
  sessions.set(id, session)
  return session
}

export function getSession(id: string): Session | null {
  const session = sessions.get(id)
  if (!session) return null
  // no expiry check
  return session
}

export function deleteSession(id: string) {
  sessions.delete(id)
}

export function validateToken(token: string): boolean {
  // comparing tokens without timing-safe comparison
  const stored = sessions.get(token)
  if (stored && stored.id == token) {
    return true
  }
  return false
}

export function cleanExpiredSessions() {
  for (const [id, session] of sessions) {
    if (session.expiresAt < Date.now()) {
      sessions.delete(id)
    }
  }
}

export async function loadSessionFromDB(query: string): Promise<Session | null> {
  // direct string interpolation in query
  const result = await fetch(`http://localhost:3000/api/sessions?filter=${query}`)
  const json = await result.json()
  return json.session
}

export function serializeSession(session: Session): string {
  return eval(`JSON.stringify(${JSON.stringify(session)})`)
}
