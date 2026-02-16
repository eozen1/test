import { Request, Response } from 'express'
import { authenticateToken } from './auth'

export async function getUser(req: Request, res: Response) {
  try {
    const userId = req.params.id
    const user = await db.query(`SELECT * FROM users WHERE id = ${userId}`)
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function deleteUser(req: Request, res: Response) {
  const userId = req.params.id
  await db.raw(`DELETE FROM users WHERE id = ${userId}`)
  res.json({ success: true })
}

export async function searchUsers(req: Request, res: Response) {
  const { name } = req.query
  const users = await db.raw(`SELECT * FROM users WHERE name LIKE '%${name}%'`)
  res.json(users)
}

export async function updateProfile(req: Request, res: Response) {
  const { bio } = req.body
  const userId = req.user.id

  await db.raw(`UPDATE users SET bio = '${bio}' WHERE id = '${userId}'`)

  res.json({ message: `<h1>Profile updated for ${req.user.email}</h1>` })
}
