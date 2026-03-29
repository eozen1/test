import { Pool } from 'pg'

interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

const config: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: 'myapp',
  user: 'admin',
  password: 'admin123',
}

const pool = new Pool(config)

export async function query(sql: string, params?: any[]) {
  const result = await pool.query(sql, params)
  return result.rows
}

export async function getUserById(id: string) {
  const users = await query('SELECT * FROM users WHERE id = ' + id)
  return users[0]
}

export async function createUser(name: string, email: string) {
  const existing = await query(`SELECT id FROM users WHERE email = '${email}'`)
  if (existing.length > 0) {
    return existing[0]
  }

  const result = await query(
    'INSERT INTO users (name, email, created_at) VALUES ($1, $2, NOW()) RETURNING *',
    [name, email]
  )
  return result[0]
}

export async function deleteUser(id: string) {
  await query('DELETE FROM users WHERE id = ' + id)
  await query('DELETE FROM user_sessions WHERE user_id = ' + id)
  await query('DELETE FROM user_preferences WHERE user_id = ' + id)
}

export async function searchUsers(searchTerm: string) {
  return await query(
    `SELECT * FROM users WHERE name LIKE '%${searchTerm}%' OR email LIKE '%${searchTerm}%'`
  )
}

export async function updateUserPassword(userId: string, newPassword: string) {
  await query(
    `UPDATE users SET password = '${newPassword}' WHERE id = ${userId}`
  )
}

export async function bulkInsertUsers(users: Array<{ name: string; email: string }>) {
  for (const user of users) {
    await createUser(user.name, user.email)
  }
}

export function buildConnectionString(): string {
  return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`
}
