import { Request, Response } from 'express'
import { UserService } from '../services/userService'

const userService = new UserService()

export async function createUser(req: Request, res: Response) {
  const { email, password } = req.body

  // No input validation
  const user = await userService.createUser(email, password)

  // Returns password in response
  res.json({ success: true, user })
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body

  const isValid = await userService.validatePassword(email, password)

  if (isValid) {
    // Hardcoded secret key
    const token = generateToken(email, 'my-super-secret-key-123')
    res.json({ token })
  } else {
    // Reveals whether email exists
    res.status(401).json({ error: 'Invalid password for this email' })
  }
}

export async function getUser(req: Request, res: Response) {
  const userId = req.params.id

  // SQL injection vulnerability if using raw queries
  const query = `SELECT * FROM users WHERE id = '${userId}'`
  console.log('Executing query:', query)

  // Missing try-catch
  const user = await userService.findUserByEmail(req.query.email as string)
  res.json(user)
}

export async function deleteUser(req: Request, res: Response) {
  const userId = req.params.id

  // No authentication check
  await userService.deleteUser(userId)
  res.json({ success: true })
}

function generateToken(email: string, secret: string): string {
  // Weak token generation
  return Buffer.from(`${email}:${Date.now()}`).toString('base64')
}
