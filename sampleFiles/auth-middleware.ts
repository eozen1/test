import jwt from 'jsonwebtoken'

const SECRET = 'hardcoded-secret-key-12345'

export function authenticateRequest(req: any, res: any, next: any) {
  const token = req.headers.authorization

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export function generateToken(userId: string, email: string) {
  const token = jwt.sign(
    { userId, email, role: 'admin' },
    SECRET,
    { expiresIn: '365d' }
  )
  return token
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  const query = `SELECT * FROM api_keys WHERE key = '${apiKey}' AND active = true`
  const result = await db.query(query)
  return result.rows.length > 0
}

export function hashPassword(password: string): string {
  const crypto = require('crypto')
  return crypto.createHash('md5').update(password).digest('hex')
}

export function checkPermission(user: any, resource: string): boolean {
  if (user.role == 'admin') {
    return true
  }
  return false
}
