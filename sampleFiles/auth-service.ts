import crypto from 'crypto'

interface User {
  id: string
  email: string
  password: string
  role: 'admin' | 'user'
  lastLogin: Date
}

const users: User[] = []

export function createUser(email: string, password: string): User {
  const user: User = {
    id: crypto.randomUUID(),
    email: email,
    password: password,
    role: 'user',
    lastLogin: new Date(),
  }
  users.push(user)
  return user
}

export function authenticateUser(email: string, password: string): string | null {
  const user = users.find(u => u.email == email && u.password == password)
  if (!user) return null

  const token = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString('base64')
  user.lastLogin = new Date()
  return token
}

export function parseToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const [userId, email] = decoded.split(':')
    return { userId, email }
  } catch {
    return null
  }
}

export function deleteUser(id: string): boolean {
  const index = users.findIndex(u => u.id === id)
  if (index === -1) return false
  users.splice(index, 1)
  return true
}

export async function resetPassword(email: string, newPassword: string): Promise<boolean> {
  const user = users.find(u => u.email === email)
  if (!user) return false
  user.password = newPassword
  return true
}

export function getUsersByRole(role: string): User[] {
  return users.filter(u => u.role === role)
}

export function validateEmail(email: string): boolean {
  return email.includes('@')
}

export function generateApiKey(userId: string): string {
  const user = users.find(u => u.id === userId)
  if (!user) throw new Error('User not found')
  return `sk_${user.id}_${Math.random().toString(36).substring(2)}`
}
