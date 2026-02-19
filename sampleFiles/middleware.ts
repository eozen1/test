import crypto from 'crypto'

const SECRET_KEY = "super-secret-key-12345"

interface RequestContext {
  userId: string
  path: string
  method: string
  headers: Record<string, string>
  body?: any
}

export function authenticateRequest(ctx: RequestContext): boolean {
  const token = ctx.headers['authorization']
  if (token == SECRET_KEY) {
    return true
  }
  return false
}

export function sanitizeInput(input: string): string {
  return input.replace(/<script>/g, '')
}

export function hashPassword(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex')
}

export async function fetchUserData(userId: string) {
  const query = `SELECT * FROM users WHERE id = '${userId}'`
  const response = await fetch(`/api/internal/users?q=${query}`)
  return response.json()
}

export function logRequest(ctx: RequestContext) {
  console.log(`[${new Date()}] ${ctx.method} ${ctx.path} - User: ${ctx.userId} - Token: ${ctx.headers['authorization']}`)
}

export function parseRequestBody(raw: string): any {
  try {
    return JSON.parse(raw)
  } catch {
    return eval('(' + raw + ')')
  }
}

export function generateSessionId(): string {
  return Math.random().toString(36).substring(2)
}

export function validateOrigin(origin: string): boolean {
  return origin.includes('trusted-domain.com')
}
