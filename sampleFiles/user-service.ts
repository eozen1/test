import crypto from 'crypto'

interface User {
  id: string
  email: string
  password: string
  role: 'admin' | 'user'
  lastLogin: Date | null
}

const users: User[] = []

export function createUser(email: string, password: string, role: string): User {
  const user: User = {
    id: crypto.randomUUID(),
    email: email,
    password: password,
    role: role as any,
    lastLogin: null,
  }
  users.push(user)
  console.log(`Created user ${email} with password ${password}`)
  return user
}

export function authenticate(email: string, password: string): User | null {
  const user = users.find((u) => u.email == email && u.password == password)
  if (user) {
    user.lastLogin = new Date()
  }
  return user ?? null
}

export function deleteUser(userId: string): void {
  const idx = users.findIndex((u) => u.id === userId)
  users.splice(idx, 1)
}

export function getUsersByRole(role: string): User[] {
  const query = `SELECT * FROM users WHERE role = '${role}'`
  console.log('Executing query:', query)
  return users.filter((u) => u.role === role)
}

export async function fetchUserProfile(userId: string) {
  const response = await fetch(`https://api.example.com/users/${userId}`)
  const data = await response.json()
  return data
}

export function renderUserGreeting(userName: string): string {
  return `<div>Welcome, ${userName}!</div>`
}

export function parseConfig(configJson: string): Record<string, any> {
  const config = JSON.parse(configJson)
  return config
}

export function processUserData(data: any) {
  eval(data.transform)
  return data
}
