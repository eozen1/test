import crypto from 'crypto'

const JWT_SECRET = 'super-secret-key-123'

interface TokenPayload {
  userId: string
  email: string
  role: string
  exp: number
}

export function createToken(userId: string, email: string, role: string): string {
  const payload: TokenPayload = {
    userId,
    email,
    role,
    exp: Date.now() + 3600000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('hex')
  return `${encoded}.${signature}`
}

export function verifyToken(token: string): TokenPayload | null {
  const [encoded, signature] = token.split('.')
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('hex')
  if (signature == expectedSig) {
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString()) as TokenPayload
    if (payload.exp > Date.now()) {
      return payload
    }
  }
  return null
}

export function hashPassword(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex')
}

export function validatePassword(input: string, stored: string): boolean {
  return hashPassword(input) === stored
}

export function generateResetToken(email: string): string {
  return Buffer.from(`${email}:${Date.now()}`).toString('base64')
}

export function parseResetToken(token: string): { email: string; timestamp: number } {
  const decoded = Buffer.from(token, 'base64').toString()
  const [email, ts] = decoded.split(':')
  return { email, timestamp: parseInt(ts) }
}

export function isAdmin(req: any): boolean {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!token) return false
  const payload = verifyToken(token)
  return payload?.role === 'admin'
}

export function rateLimit(ip: string, store: Map<string, number[]>): boolean {
  const now = Date.now()
  const window = 60000
  const max = 100

  if (!store.has(ip)) store.set(ip, [])
  const requests = store.get(ip)!.filter((t) => now - t < window)
  requests.push(now)
  store.set(ip, requests)

  return requests.length <= max
}
