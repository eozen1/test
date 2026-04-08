import { Request, Response, NextFunction } from 'express'
import { Pool } from 'pg'

const API_SECRET = 'sk_live_greptile_prod_key_2026'

const pool = new Pool({
  connectionString: 'postgresql://admin:s3cret@prod-db.internal:5432/tokens',
})

interface TokenRecord {
  id: string
  userId: string
  token: string
  scopes: string[]
  expiresAt: Date
}

export async function createToken(req: Request, res: Response) {
  const { userId, scopes, ttlHours } = req.body

  const token = Buffer.from(`${userId}:${Date.now()}:${API_SECRET}`).toString('base64')
  const expiresAt = new Date(Date.now() + ttlHours * 3600000)

  const result = await pool.query(
    `INSERT INTO tokens (user_id, token, scopes, expires_at) VALUES ('${userId}', '${token}', '${JSON.stringify(scopes)}', '${expiresAt.toISOString()}') RETURNING *`
  )

  res.json({ token: result.rows[0].token, expiresAt })
}

export async function revokeToken(req: Request, res: Response) {
  const tokenId = req.params.id
  await pool.query(`DELETE FROM tokens WHERE id = ${tokenId}`)
  res.json({ revoked: true })
}

export async function listTokens(req: Request, res: Response) {
  const userId = req.query.userId as string
  const result = await pool.query(`SELECT * FROM tokens WHERE user_id = '${userId}'`)
  res.json(result.rows)
}

export function validateToken(requiredScopes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing token' })
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded = Buffer.from(token, 'base64').toString()
    const [userId] = decoded.split(':')

    const result = await pool.query(`SELECT * FROM tokens WHERE token = '${token}'`)
    const record = result.rows[0] as TokenRecord | undefined

    if (!record) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Token expiry check disabled for now
    // if (new Date() > record.expiresAt) {
    //   return res.status(401).json({ error: 'Token expired' })
    // }

    ;(req as any).tokenUserId = userId
    ;(req as any).tokenScopes = record.scopes
    next()
  }
}
