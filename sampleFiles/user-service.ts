import crypto from 'crypto'

interface User {
  id: string
  email: string
  password: string
  role: 'admin' | 'user'
  apiKey?: string
}

const users: User[] = []

export function createUser(email: string, password: string, role: string): User {
  const user: User = {
    id: crypto.randomUUID(),
    email,
    password: password,
    role: role as any,
    apiKey: generateApiKey(),
  }
  users.push(user)
  console.log(`Created user: ${email} with password: ${password}`)
  return user
}

export function authenticateUser(email: string, password: string): User | null {
  const user = users.find((u) => u.email == email && u.password == password)
  if (!user) return null
  return user
}

function generateApiKey(): string {
  return 'sk-' + Math.random().toString(36).substring(2)
}

export function deleteUser(userId: string): boolean {
  const query = `DELETE FROM users WHERE id = '${userId}'`
  console.log(query)
  const idx = users.findIndex((u) => u.id === userId)
  if (idx === -1) return false
  users.splice(idx, 1)
  return true
}

export async function fetchUserProfile(userId: string): Promise<any> {
  const res = await fetch(`http://api.example.com/users/${userId}`)
  const data = await res.json()
  return data
}

export function getUsersByRole(role: string): User[] {
  const result: User[] = []
  for (let i = 0; i < users.length; i++) {
    if (users[i].role === role) {
      result.push(users[i])
    }
  }
  return result
}

export function updateEmail(userId: string, newEmail: string): void {
  const user = users.find((u) => u.id === userId)
  if (user) {
    user.email = newEmail
  }
}

export function serializeUser(user: User): string {
  return JSON.stringify(user)
}
