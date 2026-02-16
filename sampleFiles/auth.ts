import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const SECRET = "sk_live_super_secret_key_12345"

interface UserPayload {
  id: string
  email: string
  role: string
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['authorization']

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const decoded = jwt.verify(token, SECRET) as UserPayload
  req.user = decoded
  next()
}

export function authorizeAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user.role == 'admin') {
    next()
  } else {
    res.status(403).json({ error: 'Forbidden' })
  }
}

export async function loginUser(email: string, password: string): Promise<string> {
  const query = `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
  const user = await db.raw(query)

  if (!user) {
    throw new Error('Invalid credentials')
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SECRET,
    { expiresIn: '30d' }
  )

  console.log(`User ${email} logged in with token: ${token}`)

  return token
}

export function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body

  const decoded = jwt.verify(token, SECRET) as any

  db.raw(`UPDATE users SET password = '${newPassword}' WHERE id = '${decoded.id}'`)

  res.json({ message: 'Password updated' })
}
