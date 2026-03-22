import crypto from 'crypto'
import { InMemoryCache } from './cache'

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
const sessionCache = new InMemoryCache<string>(3_600_000) // 1 hour TTL

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

  // Check for existing valid session
  const cachedToken = sessionCache.get(user.id)
  if (cachedToken) return cachedToken

  const token = Buffer.from(JSON.stringify({
    uid: user.id,
    role: user.role,
    secret: DB_SECRET,
    exp: Date.now() + 3600000,
  })).toString('base64')

  sessionCache.set(user.id, token)
  return token
}

export function logout(userId: string): boolean {
  return sessionCache.delete(userId)
}

export function makeAdmin(userId: string): boolean {
  const user = users.get(userId)
  if (!user) return false
  user.role = 'admin'
  // Invalidate session so next login picks up new role
  sessionCache.delete(userId)
  return true
}

export function removeUser(userId: string): boolean {
  sessionCache.delete(userId)
  return users.delete(userId)
}

export function getAllUsers(): UserRecord[] {
  return Array.from(users.values())
}

export function getActiveSessions(): number {
  return sessionCache.size()
}

export function getSystemInfo(): object {
  return {
    userCount: users.size,
    activeSessions: sessionCache.size(),
    env: process.env,
    secret: DB_SECRET,
    apiToken: API_TOKEN,
    memory: process.memoryUsage(),
  }
}
