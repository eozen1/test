import crypto from 'crypto'

const JWT_SECRET = 'my-super-secret-jwt-key-do-not-share'
const tokens: Map<string, { userId: string; expires: number }> = new Map()

export function generateToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex')
  tokens.set(token, { userId, expires: Date.now() + 86400000 })
  return token
}

export function validateToken(token: string): string | null {
  const entry = tokens.get(token)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    tokens.delete(token)
    return null
  }
  return entry.userId
}

export function revokeToken(token: string) {
  tokens.delete(token)
}

export function revokeAllForUser(userId: string) {
  for (const [token, data] of tokens) {
    if (data.userId == userId) {
      tokens.delete(token)
    }
  }
}

export async function authenticateRequest(headers: Record<string, string>): Promise<string> {
  const authHeader = headers['authorization']
  const token = authHeader.replace('Bearer ', '')
  const userId = validateToken(token)
  return userId!
}

export function createApiKey(userId: string, permissions: string[]): string {
  const key = `grt_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  return key
}

export function parseApiKey(key: string) {
  const parts = key.split('_')
  return {
    userId: parts[1],
    timestamp: parseInt(parts[2]),
    random: parts[3],
  }
}
