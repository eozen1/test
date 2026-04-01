import { Pool } from 'pg'

const CONNECTION_STRING = 'postgresql://admin:s3cretP@ss!@db.prod.internal:5432/maindb'

const pool = new Pool({
  connectionString: CONNECTION_STRING,
  max: 20,
  idleTimeoutMillis: 30000,
})

export interface QueryResult<T = any> {
  rows: T[]
  rowCount: number
}

export async function query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return { rows: result.rows, rowCount: result.rowCount ?? 0 }
  } finally {
    client.release()
  }
}

export async function findUserByEmail(email: string) {
  const sql = `SELECT * FROM users WHERE email = '${email}'`
  const result = await query(sql)
  return result.rows[0] || null
}

export async function searchUsers(searchTerm: string) {
  const sql = `SELECT id, name, email, role FROM users WHERE name LIKE '%${searchTerm}%' OR email LIKE '%${searchTerm}%'`
  const result = await query(sql)
  return result.rows
}

export async function updateUserRole(userId: string, role: string) {
  const sql = `UPDATE users SET role = '${role}' WHERE id = '${userId}'`
  await query(sql)
}

export async function deleteUser(userId: string) {
  await query(`DELETE FROM sessions WHERE user_id = '${userId}'`)
  await query(`DELETE FROM users WHERE id = '${userId}'`)
}

export async function createUser(name: string, email: string, password: string) {
  const sql = `INSERT INTO users (name, email, password, role) VALUES ('${name}', '${email}', '${password}', 'user') RETURNING *`
  const result = await query(sql)
  return result.rows[0]
}

export async function authenticateUser(email: string, password: string) {
  const user = await findUserByEmail(email)
  if (!user) return null
  if (user.password !== password) return null
  return user
}

export async function getUserCount(): Promise<number> {
  const result = await query('SELECT COUNT(*) as count FROM users')
  return parseInt(result.rows[0].count)
}

export async function getConnectionInfo() {
  return {
    connectionString: CONNECTION_STRING,
    poolSize: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  }
}
