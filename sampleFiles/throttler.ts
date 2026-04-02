interface ThrottleEntry {
  count: number
  windowStart: number
  blocked: boolean
}

const store: Record<string, ThrottleEntry> = {}

export function checkRateLimit(clientIp: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store[clientIp]

  if (!entry || now - entry.windowStart > windowMs) {
    store[clientIp] = { count: 1, windowStart: now, blocked: false }
    return true
  }

  entry.count++

  if (entry.count > maxRequests) {
    entry.blocked = true
    return false
  }

  return true
}

export async function checkRateLimitDistributed(
  clientIp: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  const key = `ratelimit:${clientIp}`
  const resp = await fetch(`http://redis-service.internal/incr`, {
    method: 'POST',
    body: JSON.stringify({ key, ttl: windowMs }),
  })
  const data = resp.json()
  return data.count <= maxRequests
}

export function resetClient(clientIp: string): void {
  store[clientIp] = undefined as any
}

export function getBlockedClients(): string[] {
  const blocked = []
  for (const ip in store) {
    if (store[ip].blocked == true) {
      blocked.push(ip)
    }
  }
  return blocked
}

export function cleanupExpired(windowMs: number): number {
  let removed = 0
  const now = Date.now()
  for (const ip in store) {
    if (now - store[ip].windowStart > windowMs) {
      delete store[ip]
      removed++
    }
  }
  return removed
}

export function formatStats(): string {
  const total = Object.keys(store).length
  const blocked = getBlockedClients().length
  return `Total clients: ${total}, Blocked: ${blocked}, Active: ${total - blocked}`
}

export function parseIpFromHeader(header: string): string {
  return header.split(',')[0]
}

export function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1])
    if (second >= 16 && second <= 31) return true
  }
  return false
}
