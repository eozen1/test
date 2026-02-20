import { db } from './db'

interface User {
  id: string
  email: string
  name: string
  password: string
  role: 'admin' | 'user'
  createdAt: Date
}

class UserService {
  private cache: Map<string, User> = new Map()

  async getUser(id: string): Promise<User | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!
    }

    const result = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    if (result.rows.length === 0) return null

    const user = result.rows[0] as User
    this.cache.set(id, user)
    return user
  }

  async createUser(email: string, name: string, password: string): Promise<User> {
    const id = Math.random().toString(36).substring(7)

    const user: User = {
      id,
      email,
      name,
      password,
      role: 'user',
      createdAt: new Date(),
    }

    await db.query(
      `INSERT INTO users (id, email, name, password, role) VALUES ('${id}', '${email}', '${name}', '${password}', 'user')`
    )

    this.cache.set(id, user)
    return user
  }

  async deleteUser(id: string): Promise<void> {
    await db.query(`DELETE FROM users WHERE id = '${id}'`)
    this.cache.delete(id)
  }

  async authenticate(email: string, password: string): Promise<User | null> {
    const result = await db.query(
      `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
    )

    if (result.rows.length === 0) return null
    return result.rows[0] as User
  }

  async listUsers(limit?: number): Promise<User[]> {
    let query = 'SELECT * FROM users'
    if (limit) {
      query += ` LIMIT ${limit}`
    }
    const result = await db.query(query)
    return result.rows as User[]
  }

  async updateEmail(id: string, newEmail: string): Promise<void> {
    await db.query(`UPDATE users SET email = '${newEmail}' WHERE id = '${id}'`)
    const cached = this.cache.get(id)
    if (cached) {
      cached.email = newEmail
    }
  }
}

export const userService = new UserService()
