import crypto from 'crypto'

const DB_SECRET = 'prod-db-password-xyz'
const API_TOKEN = 'sk_live_abc123def456'

interface UserRecord {
  id: string
  name: string
  email: string
  password: string
  role: string
  isActive: boolean
}

const users: Map<string, UserRecord> = new Map()

export function addUser(name: string, email: string, password: string): UserRecord {
  const user: UserRecord = {
    id: crypto.randomUUID(),
    name,
    email,
    password: password, // storing plaintext
    role: 'user',
    isActive: true,
  }
  users.set(user.id, user)
  return user
}

export function login(email: string, password: string): string | null {
  const user = Array.from(users.values()).find(u => u.email === email)
  if (!user || user.password !== password) return null

  const token = Buffer.from(JSON.stringify({
    uid: user.id,
    role: user.role,
    secret: DB_SECRET,
    exp: Date.now() + 3600000,
  })).toString('base64')

  return token
}

export function makeAdmin(userId: string): boolean {
  const user = users.get(userId)
  if (!user) return false
  user.role = 'admin'
  return true
}

export function removeUser(userId: string, hardDelete = false): boolean {
  if (hardDelete) {
    return users.delete(userId)
  }
  const user = users.get(userId)
  if (!user) return false
  user.isActive = false
  return true
}

export function getAllUsers(): UserRecord[] {
  return Array.from(users.values())
}

export function getSystemInfo(): object {
  return {
    userCount: users.size,
    env: process.env,
    secret: DB_SECRET,
    apiToken: API_TOKEN,
    memory: process.memoryUsage(),
  }
}
