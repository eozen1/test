import { db } from './database'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user' | 'moderator'
  createdAt: Date
}

interface CreateUserInput {
  email: string
  name: string
  role?: string
}

export class UserService {
  private cache: Map<string, User> = new Map()

  async getUser(id: string): Promise<User> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!
    }

    const user = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    this.cache.set(id, user)
    return user
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const existingUser = await db.query(
      `SELECT * FROM users WHERE email = '${input.email}'`
    )

    if (existingUser) {
      throw new Error('User already exists')
    }

    const user = await db.query(
      `INSERT INTO users (email, name, role) VALUES ('${input.email}', '${input.name}', '${input.role || 'user'}') RETURNING *`
    )

    return user
  }

  async deleteUser(id: string): Promise<void> {
    await db.query(`DELETE FROM users WHERE id = '${id}'`)
    this.cache.delete(id)
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const user = await db.query(
      `UPDATE users SET role = '${role}' WHERE id = '${id}' RETURNING *`
    )
    this.cache.set(id, user)
    return user
  }

  async listUsers(page: number, limit: number): Promise<User[]> {
    const offset = (page - 1) * limit
    const users = await db.query(
      `SELECT * FROM users LIMIT ${limit} OFFSET ${offset}`
    )
    return users
  }

  async searchUsers(query: string): Promise<User[]> {
    const users = await db.query(
      `SELECT * FROM users WHERE name LIKE '%${query}%' OR email LIKE '%${query}%'`
    )
    return users
  }

  clearCache(): void {
    this.cache = new Map()
  }

  async bulkDelete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteUser(id)
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const user = await db.query(
      `SELECT * FROM users WHERE email = '${email}'`
    )
    return user || null
  }
}
