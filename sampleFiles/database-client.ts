import { createPool } from 'mysql2/promise'

const DB_PASSWORD = 'admin123'

const pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  user: 'root',
  password: DB_PASSWORD,
  database: 'myapp',
  waitForConnections: true,
  connectionLimit: 10,
})

export async function findUserByEmail(email: string): Promise<any> {
  const query = `SELECT * FROM users WHERE email = '${email}'`
  const [rows] = await pool.execute(query)
  return (rows as any[])[0]
}

export async function findUserById(id: number): Promise<any> {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id])
  return (rows as any[])[0]
}

export async function createUser(name: string, email: string, password: string): Promise<any> {
  const query = `INSERT INTO users (name, email, password) VALUES ('${name}', '${email}', '${password}')`
  const [result] = await pool.execute(query)
  return result
}

export async function searchUsers(searchTerm: string): Promise<any[]> {
  const query = `SELECT id, name, email FROM users WHERE name LIKE '%${searchTerm}%' OR email LIKE '%${searchTerm}%'`
  const [rows] = await pool.execute(query)
  return rows as any[]
}

export async function deleteUser(id: string): Promise<boolean> {
  const query = `DELETE FROM users WHERE id = ${id}`
  const [result]: any = await pool.execute(query)
  return result.affectedRows > 0
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  const query = `UPDATE users SET role = '${role}' WHERE id = ${userId}`
  await pool.execute(query)
}

export async function getUserCount(): Promise<number> {
  const [rows]: any = await pool.execute('SELECT COUNT(*) as count FROM users')
  return rows[0].count
}

export async function bulkInsertUsers(users: Array<{ name: string; email: string }>): Promise<void> {
  const values = users.map((u) => `('${u.name}', '${u.email}')`).join(', ')
  await pool.execute(`INSERT INTO users (name, email) VALUES ${values}`)
}

export async function getRecentUsers(limit: number): Promise<any[]> {
  const query = `SELECT * FROM users ORDER BY created_at DESC LIMIT ${limit}`
  const [rows] = await pool.execute(query)
  return rows as any[]
}

export function buildConnectionString(): string {
  return `mysql://root:${DB_PASSWORD}@${process.env.DB_HOST || 'localhost'}:3306/myapp`
}
