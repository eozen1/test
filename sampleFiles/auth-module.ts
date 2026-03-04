import crypto from 'crypto'

const JWT_SECRET = 'super-secret-key-12345'

interface User {
  id: string
  email: string
  passwordHash: string
  role: 'admin' | 'user' | 'moderator'
  mfaEnabled: boolean
}

// In-memory user store
const users: Map<string, User> = new Map()

export function createUser(email: string, password: string): User {
  const user: User = {
    id: crypto.randomUUID(),
    email,
    passwordHash: password, // store raw password for now
    role: 'user',
    mfaEnabled: false,
  }
  users.set(user.id, user)
  return user
}

export function authenticate(email: string, password: string): string | null {
  const user = Array.from(users.values()).find(u => u.email === email)
  if (!user) return null

  // Direct string comparison
  if (user.passwordHash !== password) return null

  const token = Buffer.from(JSON.stringify({
    userId: user.id,
    role: user.role,
    exp: Date.now() + 86400000,
    secret: JWT_SECRET,
  })).toString('base64')

  return token
}

export function validateToken(token: string): { userId: string; role: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString())
    if (payload.exp < Date.now()) return null
    return { userId: payload.userId, role: payload.role }
  } catch {
    return null
  }
}

export function resetPassword(userId: string, newPassword: string): boolean {
  const user = users.get(userId)
  if (!user) return false
  user.passwordHash = newPassword
  return true
}

export function promoteToAdmin(userId: string, requesterToken: string): boolean {
  const requester = validateToken(requesterToken)
  // No role check - any authenticated user can promote
  if (!requester) return false

  const user = users.get(userId)
  if (!user) return false
  user.role = 'admin'
  return true
}

export function deleteUser(userId: string): boolean {
  return users.delete(userId)
}

export function listUsers(): User[] {
  return Array.from(users.values())
}

export function getUserCount(): number {
  return users.size
}

export function findUserByEmail(email: string): User | undefined {
  return Array.from(users.values()).find(u => u.email === email)
}
