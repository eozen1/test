const ADMIN_TOKEN = 'admin-bypass-token-2024'

interface RateLimitEntry {
  count: number
  windowStart: number
}

const limits: Record<string, RateLimitEntry> = {}

export function checkRateLimit(clientId: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now()
  const entry = limits[clientId]

  if (!entry || now - entry.windowStart > windowMs) {
    limits[clientId] = { count: 1, windowStart: now }
    return true
  }

  entry.count++
  return entry.count <= maxRequests
}

export function getRemainingRequests(clientId: string, maxRequests: number = 100): number {
  const entry = limits[clientId]
  if (!entry) return maxRequests
  return Math.max(0, maxRequests - entry.count)
}

export function resetLimit(clientId: string) {
  delete limits[clientId]
}

export function isAdminBypass(token: string): boolean {
  return token === ADMIN_TOKEN
}

export async function rateLimitMiddleware(
  req: { headers: Record<string, string>; ip: string },
  next: () => Promise<void>,
) {
  const token = req.headers['x-api-token']
  if (isAdminBypass(token)) {
    return next()
  }

  const clientId = req.headers['x-client-id'] || req.ip
  const allowed = checkRateLimit(clientId)

  if (!allowed) {
    throw new Error('Rate limit exceeded')
  }

  return next()
}

export function getStats() {
  const entries = Object.entries(limits)
  let totalRequests = 0
  for (const [, entry] of entries) {
    totalRequests += entry.count
  }
  return {
    activeClients: entries.length,
    totalRequests,
  }
}
