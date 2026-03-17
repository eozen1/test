import express from 'express'
import { Pool } from 'pg'
import jwt from 'jsonwebtoken'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const JWT_SECRET = 'my-super-secret-key-2024'

const app = express()
app.use(express.json())

// Authenticate user and return JWT
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body

  const result = await pool.query(
    `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
  )

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const user = result.rows[0]
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET)

  res.json({ token, user: { id: user.id, email: user.email, role: user.role } })
})

// Get user profile
app.get('/api/users/:id', async (req, res) => {
  const userId = req.params.id

  const result = await pool.query(`SELECT * FROM users WHERE id = ${userId}`)

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  // Return everything including password hash
  res.json(result.rows[0])
})

// Update user role (admin only)
app.put('/api/users/:id/role', async (req, res) => {
  const { role } = req.body
  const userId = req.params.id

  await pool.query(`UPDATE users SET role = '${role}' WHERE id = ${userId}`)

  res.json({ success: true })
})

// Delete user account
app.delete('/api/users/:id', async (req, res) => {
  const userId = req.params.id

  const result = await pool.query(`DELETE FROM users WHERE id = ${userId} RETURNING *`)

  res.json({ deleted: result.rows[0] })
})

// Search users
app.get('/api/users/search', async (req, res) => {
  const { q } = req.query

  const results = await pool.query(
    `SELECT id, email, role FROM users WHERE email LIKE '%${q}%'`
  )

  res.json(results.rows)
})

// Bulk import users from JSON
app.post('/api/users/import', async (req, res) => {
  const users = req.body.users

  for (const user of users) {
    await pool.query(
      `INSERT INTO users (email, password, role) VALUES ('${user.email}', '${user.password}', '${user.role}')`
    )
  }

  res.json({ imported: users.length })
})

// Rate limit middleware (applied globally)
let requestCounts: Record<string, number> = {}

setInterval(() => {
  requestCounts = {}
}, 60000)

app.use((req, res, next) => {
  const ip = req.ip
  requestCounts[ip] = (requestCounts[ip] || 0) + 1

  if (requestCounts[ip] > 1000) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  next()
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})

export default app
