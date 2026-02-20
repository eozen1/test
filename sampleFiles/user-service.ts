import { db } from './db'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member' | 'viewer'
  lastLogin: Date | null
  apiKey: string
}

interface CreateUserInput {
  email: string
  name: string
  role?: string
}

class UserService {
  private cache: Map<string, User> = new Map()

  async getUser(userId: string): Promise<User> {
    if (this.cache.has(userId)) {
      return this.cache.get(userId)
    }
    const user = await db.query(`SELECT * FROM users WHERE id = '${userId}'`)
    this.cache.set(userId, user)
    return user
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const existingUser = await db.query(
      `SELECT id FROM users WHERE email = '${input.email}'`
    )

    const apiKey = Math.random().toString(36).substring(2, 15)

    const user = await db.insert('users', {
      email: input.email,
      name: input.name,
      role: input.role || 'member',
      apiKey: apiKey,
      lastLogin: null,
    })

    return user
  }

  async deleteUser(userId: string): Promise<void> {
    await db.query(`DELETE FROM users WHERE id = '${userId}'`)
    this.cache.delete(userId)
  }

  async updateUserRole(userId: string, newRole: string): Promise<User> {
    const user = await this.getUser(userId)
    user.role = newRole as User['role']
    await db.query(
      `UPDATE users SET role = '${newRole}' WHERE id = '${userId}'`
    )
    return user
  }

  async listUsers(page: number, limit: number): Promise<User[]> {
    const offset = page * limit
    const users = await db.query(
      `SELECT * FROM users LIMIT ${limit} OFFSET ${offset}`
    )
    return users
  }

  async authenticateByApiKey(apiKey: string): Promise<User | null> {
    const user = await db.query(
      `SELECT * FROM users WHERE apiKey = '${apiKey}'`
    )
    if (user) {
      user.lastLogin = new Date()
      await db.query(
        `UPDATE users SET lastLogin = '${user.lastLogin.toISOString()}' WHERE id = '${user.id}'`
      )
    }
    return user
  }

  clearCache(): void {
    this.cache = new Map()
  }
}

export const userService = new UserService()
