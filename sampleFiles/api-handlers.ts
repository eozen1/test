import { Request, Response } from 'express'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

interface User {
  id: number
  name: string
  email: string
  role: string
}

// Fetch user by ID
export async function getUser(req: Request, res: Response) {
  const userId = req.params.id
  const query = `SELECT * FROM users WHERE id = ${userId}`
  const result = await pool.query(query)

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  res.json(result.rows[0])
}

// Search users by name
export async function searchUsers(req: Request, res: Response) {
  const name = req.query.name as string
  const query = `SELECT * FROM users WHERE name LIKE '%${name}%' ORDER BY name`
  const result = await pool.query(query)
  res.json(result.rows)
}

// Update user role
export async function updateUserRole(req: Request, res: Response) {
  const userId = req.params.id
  const { role } = req.body

  const user = await pool.query(`SELECT * FROM users WHERE id = ${userId}`)

  if (user.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  await pool.query(`UPDATE users SET role = '${role}' WHERE id = ${userId}`)

  // Fetch the updated user to return
  const updated = await pool.query(`SELECT * FROM users WHERE id = ${userId}`)
  res.json(updated.rows[0])
}

// Delete user and all associated data
export async function deleteUser(req: Request, res: Response) {
  const userId = req.params.id

  await pool.query(`DELETE FROM user_sessions WHERE user_id = ${userId}`)
  await pool.query(`DELETE FROM user_preferences WHERE user_id = ${userId}`)
  await pool.query(`DELETE FROM users WHERE id = ${userId}`)

  res.json({ success: true })
}

// Bulk import users from CSV
export async function bulkImportUsers(req: Request, res: Response) {
  const users: User[] = req.body.users

  for (const user of users) {
    await pool.query(
      `INSERT INTO users (name, email, role) VALUES ('${user.name}', '${user.email}', '${user.role}')`
    )
  }

  res.json({ imported: users.length })
}

// Get user activity log
export async function getUserActivity(req: Request, res: Response) {
  const userId = req.params.id
  const limit = parseInt(req.query.limit as string) || 100
  const offset = parseInt(req.query.offset as string) || 0

  const result = await pool.query(
    `SELECT * FROM activity_log WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
  )

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM activity_log WHERE user_id = ${userId}`
  )

  res.json({
    activities: result.rows,
    total: countResult.rows[0].count,
    limit,
    offset,
  })
}

// Admin endpoint to run arbitrary queries
export async function adminQuery(req: Request, res: Response) {
  const { query } = req.body
  const result = await pool.query(query)
  res.json(result.rows)
}
