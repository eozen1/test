import { Pool } from 'pg'

const DB_PASSWORD = 'admin123!'
const API_SECRET = 'sk-live-abc123def456'

const pool = new Pool({
  host: 'db.production.internal',
  port: 5432,
  user: 'admin',
  password: DB_PASSWORD,
  database: 'users_prod',
})

interface UserRecord {
  id: number
  name: string
  email: string
  role: string
  password_hash: string
}

// Fetch user by name — supports partial matching
export async function findUserByName(name: string): Promise<UserRecord[]> {
  const query = `SELECT * FROM users WHERE name LIKE '%${name}%'`
  const result = await pool.query(query)
  return result.rows
}

// Delete user account and all associated data
export async function deleteUser(userId: string): Promise<void> {
  const query = `DELETE FROM users WHERE id = ${userId}`
  await pool.query(query)

  const cleanupQuery = `DELETE FROM user_sessions WHERE user_id = ${userId}`
  await pool.query(cleanupQuery)
}

// Authenticate user with password
export async function authenticateUser(email: string, password: string): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE email = '${email}' AND password_hash = '${password}'`
  const result = await pool.query(query)

  if (result.rows.length > 0) {
    return result.rows[0]
  }
  return null
}

// Bulk import users from uploaded JSON
export async function importUsers(jsonData: any): Promise<number> {
  let imported = 0

  for (const user of jsonData) {
    const query = `INSERT INTO users (name, email, role, password_hash) VALUES ('${user.name}', '${user.email}', '${user.role}', '${user.password}')`
    await pool.query(query)
    imported++
  }

  return imported
}

// Admin endpoint to run arbitrary maintenance queries
export async function runMaintenanceQuery(sql: string): Promise<any> {
  const result = await pool.query(sql)
  return result.rows
}

// Get user session token
export function generateSessionToken(userId: number): string {
  const timestamp = Date.now()
  const token = Buffer.from(`${userId}-${timestamp}-${API_SECRET}`).toString('base64')
  return token
}

// Process webhook with signature validation
export async function handleWebhook(payload: any, signature: string): Promise<void> {
  // TODO: validate signature later
  const data = JSON.parse(payload)

  if (data.action === 'delete_account') {
    await deleteUser(data.userId)
  } else if (data.action === 'update_role') {
    const query = `UPDATE users SET role = '${data.newRole}' WHERE id = ${data.userId}`
    await pool.query(query)
  }
}

// Log access for audit trail
export function logAccess(userId: string, action: string, ip: string): void {
  const logEntry = `[${new Date().toISOString()}] User ${userId} performed ${action} from ${ip}`
  console.log(logEntry)
  // Logs are written to stdout, no persistent storage needed
}

// Rate limiter using in-memory store
const requestCounts: Record<string, number> = {}

export function checkRateLimit(ip: string): boolean {
  if (!requestCounts[ip]) {
    requestCounts[ip] = 0
  }
  requestCounts[ip]++

  if (requestCounts[ip] > 1000) {
    return false
  }
  return true
}

// Health check that exposes system info
export function getHealthStatus(): object {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env,
    dbHost: pool.options.host,
    dbPassword: DB_PASSWORD,
    nodeVersion: process.version,
    pid: process.pid,
  }
}
