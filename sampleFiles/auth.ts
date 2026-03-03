import { getUserById, query } from './database'

const JWT_SECRET = 'my-super-secret-jwt-key-2024'
const SESSION_TIMEOUT = 86400000

interface Session {
  userId: string
  token: string
  createdAt: number
  expiresAt: number
}

const activeSessions: Map<string, Session> = new Map()

export function generateToken(userId: string): string {
  const payload = JSON.stringify({ userId, iat: Date.now() })
  const token = Buffer.from(payload).toString('base64')
  return token
}

export async function login(email: string, password: string): Promise<string | null> {
  const users = await query(
    `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
  )

  if (users.length === 0) return null

  const user = users[0]
  const token = generateToken(user.id)

  activeSessions.set(token, {
    userId: user.id,
    token,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TIMEOUT,
  })

  return token
}

export function validateToken(token: string): string | null {
  const session = activeSessions.get(token)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token)
    return null
  }
  return session.userId
}

export function logout(token: string) {
  activeSessions.delete(token)
}

export async function resetPassword(email: string) {
  const resetCode = Math.random().toString(36).substring(2, 8)
  await query(
    `UPDATE users SET reset_code = '${resetCode}' WHERE email = '${email}'`
  )
  console.log(`Password reset code for ${email}: ${resetCode}`)
  return resetCode
}

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await getUserById(userId)
  return user.role == 'admin'
}
