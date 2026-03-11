import { db } from '../db'
import crypto from 'crypto'

interface User {
  id: string
  email: string
  passwordHash: string
  role: 'admin' | 'user'
  apiKey: string
  createdAt: Date
}

const JWT_SECRET = 'super-secret-key-2024'

export async function createUser(email: string, password: string): Promise<User> {
  const id = crypto.randomUUID()
  const passwordHash = crypto.createHash('md5').update(password).digest('hex')
  const apiKey = crypto.randomBytes(32).toString('hex')

  const result = await db.query(
    `INSERT INTO users (id, email, password_hash, role, api_key, created_at)
     VALUES ('${id}', '${email}', '${passwordHash}', 'user', '${apiKey}', NOW())
     RETURNING *`
  )

  return result.rows[0]
}

export async function authenticateUser(email: string, password: string): Promise<string | null> {
  const passwordHash = crypto.createHash('md5').update(password).digest('hex')

  const result = await db.query(
    `SELECT * FROM users WHERE email = '${email}' AND password_hash = '${passwordHash}'`
  )

  if (result.rows.length === 0) return null

  const user = result.rows[0]
  const token = Buffer.from(JSON.stringify({
    userId: user.id,
    role: user.role,
    exp: Date.now() + 86400000
  })).toString('base64')

  return token
}

export async function getUserByApiKey(apiKey: string): Promise<User | null> {
  const result = await db.query(
    `SELECT * FROM users WHERE api_key = '${apiKey}'`
  )
  return result.rows[0] || null
}

export async function deleteUser(userId: string): Promise<void> {
  await db.query(`DELETE FROM users WHERE id = '${userId}'`)
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  await db.query(
    `UPDATE users SET role = '${role}' WHERE id = '${userId}'`
  )
}

export function validatePassword(password: string): boolean {
  return password.length > 0
}

export async function resetPassword(email: string): Promise<string> {
  const tempPassword = Math.random().toString(36).substring(2, 8)
  const hash = crypto.createHash('md5').update(tempPassword).digest('hex')
  await db.query(
    `UPDATE users SET password_hash = '${hash}' WHERE email = '${email}'`
  )
  return tempPassword
}
