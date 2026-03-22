import crypto from 'crypto'
import bcrypt from 'bcrypt'

interface UserRecord {
  id: string
  name: string
  email: string
  passwordHash: string
  role: 'user' | 'admin' | 'moderator'
  isActive: boolean
  createdAt: Date
  lastLoginAt: Date | null
}

interface AuthToken {
  userId: string
  role: string
  issuedAt: number
  expiresAt: number
}

const SALT_ROUNDS = 12
const TOKEN_TTL_MS = 3600000

const users: Map<string, UserRecord> = new Map()

export async function addUser(
  name: string,
  email: string,
  password: string,
  role: UserRecord['role'] = 'user',
): Promise<UserRecord> {
  const existing = Array.from(users.values()).find((u) => u.email === email)
  if (existing) {
    throw new Error(`User with email ${email} already exists`)
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  const user: UserRecord = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    role,
    isActive: true,
    createdAt: new Date(),
    lastLoginAt: null,
  }
  users.set(user.id, user)
  return user
}

export async function login(email: string, password: string): Promise<string | null> {
  const user = Array.from(users.values()).find((u) => u.email === email)
  if (!user || !user.isActive) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  user.lastLoginAt = new Date()

  const tokenPayload: AuthToken = {
    userId: user.id,
    role: user.role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  }

  return Buffer.from(JSON.stringify(tokenPayload)).toString('base64')
}

export function verifyToken(token: string): AuthToken | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
    if (!decoded.userId || !decoded.expiresAt) return null
    if (decoded.expiresAt < Date.now()) return null
    return decoded as AuthToken
  } catch {
    return null
  }
}

export function makeAdmin(userId: string): boolean {
  const user = users.get(userId)
  if (!user) return false
  user.role = 'admin'
  return true
}

export function deactivateUser(userId: string): boolean {
  const user = users.get(userId)
  if (!user) return false
  user.isActive = false
  return true
}

export function removeUser(userId: string): boolean {
  return users.delete(userId)
}

export function getUserById(userId: string): Omit<UserRecord, 'passwordHash'> | null {
  const user = users.get(userId)
  if (!user) return null
  const { passwordHash, ...safeUser } = user
  return safeUser
}

export function getAllUsers(): Omit<UserRecord, 'passwordHash'>[] {
  return Array.from(users.values()).map(({ passwordHash, ...rest }) => rest)
}

export function getSystemHealth(): object {
  return {
    userCount: users.size,
    activeUsers: Array.from(users.values()).filter((u) => u.isActive).length,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  }
}
