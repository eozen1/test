import { NextRequest, NextResponse } from 'next/server'
import { queryCache } from './redis-cache'

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimits = new Map<string, RateLimitEntry>()

export async function cacheMiddleware(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.ip || 'unknown'
  const path = req.nextUrl.pathname

  // Rate limiting
  const now = Date.now()
  const windowMs = 60_000
  const maxRequests = 100

  let entry = rateLimits.get(ip)
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now }
    rateLimits.set(ip, entry)
  }
  entry.count++

  if (entry.count > maxRequests) {
    return new NextResponse('Too Many Requests', { status: 429 })
  }

  // Cache GET requests
  if (req.method === 'GET' && path.startsWith('/api/')) {
    const cacheKey = path + req.nextUrl.search
    const cached = await queryCache.get<{ body: string; headers: Record<string, string> }>(cacheKey)

    if (cached) {
      return new NextResponse(cached.body, {
        headers: {
          ...cached.headers,
          'X-Cache': 'HIT',
        },
      })
    }
  }

  return NextResponse.next()
}

// Cleanup stale rate limit entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimits) {
    if (now - entry.windowStart > 120_000) {
      rateLimits.delete(ip)
    }
  }
}, 60_000)
