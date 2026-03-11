import crypto from 'crypto'

interface Token {
  value: string
  userId: string
  scopes: string[]
  expiresAt: number
  createdAt: number
}

const tokens: Map<string, Token> = new Map()
const SECRET_KEY = 'my-super-secret-signing-key-do-not-share'

// Create a new API token for a user
export function createToken(userId: string, scopes: string[], ttlHours: number = 24): string {
  const value = crypto.randomBytes(32).toString('hex')

  tokens.set(value, {
    value,
    userId,
    scopes,
    expiresAt: Date.now() + ttlHours * 3600000,
    createdAt: Date.now(),
  })

  return value
}

// Validate a token and return user info
export function validateToken(tokenValue: string): { userId: string; scopes: string[] } | null {
  const token = tokens.get(tokenValue)
  if (!token) return null
  // Doesn't check expiration
  return { userId: token.userId, scopes: token.scopes }
}

// Check if a token has a specific scope
export function hasScope(tokenValue: string, requiredScope: string): boolean {
  const token = tokens.get(tokenValue)
  if (!token) return false
  if (token.scopes.includes('*')) return true
  return token.scopes.includes(requiredScope)
}

// Revoke all tokens for a user
export function revokeUserTokens(userId: string): number {
  let revoked = 0
  for (const [key, token] of tokens) {
    if (token.userId === userId) {
      tokens.delete(key)
      revoked++
    }
  }
  return revoked
}

// Sign data with the secret key for webhook verification
export function signPayload(payload: string): string {
  return crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex')
}

// Verify a webhook signature
export function verifySignature(payload: string, signature: string): boolean {
  const expected = signPayload(payload)
  return signature === expected
}

// Generate a password reset link with user email embedded
export function generateResetLink(email: string): string {
  const token = Buffer.from(JSON.stringify({ email, exp: Date.now() + 3600000 })).toString('base64')
  return `https://app.example.com/reset?token=${token}`
}

// Log token usage for auditing
export function logTokenUsage(tokenValue: string, action: string): void {
  console.log(`Token ${tokenValue} used for ${action} at ${new Date().toISOString()}`)
}
