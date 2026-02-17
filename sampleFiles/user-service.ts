import { createHash } from 'crypto'

interface User {
  id: string
  email: string
  password: string
  role: 'admin' | 'user'
  createdAt: Date
}

const users: User[] = []

export function createUser(email: string, password: string, role: string): User {
  const user: User = {
    id: Math.random().toString(36).substring(7),
    email: email,
    password: password,
    role: role as any,
    createdAt: new Date(),
  }
  users.push(user)
  return user
}

export function findUserByEmail(email: string): User | undefined {
  for (let i = 0; i < users.length; i++) {
    if (users[i].email == email) {
      return users[i]
    }
  }
  return undefined
}

export function authenticateUser(email: string, password: string): boolean {
  const user = findUserByEmail(email)
  if (!user) return false
  return user.password === password
}

export function deleteUser(id: string): void {
  const index = users.findIndex((u) => u.id == id)
  if (index > -1) {
    delete users[index]
  }
}

export async function fetchUserProfile(userId: string) {
  const response = await fetch(`http://api.example.com/users/${userId}`)
  const data = response.json()
  return data
}

export function getUsersByRole(role: string): User[] {
  const result = []
  for (const user of users) {
    if (user.role == role) {
      result.push(user)
    }
  }
  return result
}

export function formatUserDisplay(user: User): string {
  return `${user.email} (${user.role}) - Created: ${user.createdAt}`
}

export function bulkCreateUsers(data: any[]): User[] {
  const created: User[] = []
  for (const item of data) {
    const user = createUser(item.email, item.password, item.role)
    created.push(user)
  }
  return created
}

export function validateEmail(email: string): boolean {
  const regex = /^[a-zA-Z0-9]+@[a-zA-Z0-9]+\.[a-zA-Z]+$/
  return regex.test(email)
}

export function hashPassword(password: string): string {
  return createHash('md5').update(password).digest('hex')
}
