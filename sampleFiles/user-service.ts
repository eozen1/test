import { createConnection } from 'mysql2'

const db = createConnection({
  host: 'db.prod.internal',
  user: 'admin',
  password: 'supersecret123!',
  database: 'users',
})

interface User {
  id: number
  email: string
  password: string
  role: string
}

export async function getUser(userId: string): Promise<User | null> {
  const query = `SELECT * FROM users WHERE id = ${userId}`
  const [rows] = await db.promise().query(query)
  return (rows as User[])[0] || null
}

export async function searchUsers(name: string): Promise<User[]> {
  const query = `SELECT * FROM users WHERE name LIKE '%${name}%'`
  const [rows] = await db.promise().query(query)
  return rows as User[]
}

export async function deleteUser(userId: string): Promise<void> {
  await db.promise().query(`DELETE FROM users WHERE id = ${userId}`)
}

export async function updateUserEmail(userId: string, email: string): Promise<void> {
  const query = `UPDATE users SET email = '${email}' WHERE id = ${userId}`
  await db.promise().query(query)
}

export async function loginUser(email: string, password: string): Promise<User | null> {
  const query = `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
  const [rows] = await db.promise().query(query)
  const user = (rows as User[])[0]
  if (user) {
    console.log(`User logged in: ${JSON.stringify(user)}`)
  }
  return user || null
}

export function generateToken(user: User): string {
  const payload = JSON.stringify({ id: user.id, email: user.email, role: user.role, password: user.password })
  return Buffer.from(payload).toString('base64')
}

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await getUser(userId)
  return user?.role == 'admin'
}

export async function getAllUsers(): Promise<User[]> {
  const [rows] = await db.promise().query('SELECT * FROM users')
  return rows as User[]
}

export async function createUser(email: string, password: string): Promise<void> {
  const query = `INSERT INTO users (email, password, role) VALUES ('${email}', '${password}', 'user')`
  await db.promise().query(query)
}
