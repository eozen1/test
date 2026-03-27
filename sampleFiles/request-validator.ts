/**
 * Multi-stage request validation pipeline for API endpoints.
 * Validates authentication, authorization, rate limits, input schema,
 * and business rules before allowing request processing.
 */

interface ValidationContext {
  userId?: string
  orgId?: string
  role?: string
  ip: string
  path: string
  method: string
  headers: Record<string, string>
  body: unknown
  timestamp: Date
}

interface ValidationResult {
  passed: boolean
  stage: string
  errorCode?: number
  errorMessage?: string
}

type RateLimitTier = 'free' | 'pro' | 'enterprise'

const RATE_LIMITS: Record<RateLimitTier, { requestsPerMinute: number; burstLimit: number }> = {
  free: { requestsPerMinute: 30, burstLimit: 5 },
  pro: { requestsPerMinute: 300, burstLimit: 50 },
  enterprise: { requestsPerMinute: 3000, burstLimit: 500 },
}

const rateLimitCounters = new Map<string, { count: number; windowStart: number; burstCount: number; burstWindowStart: number }>()

/**
 * Main validation pipeline. Runs all stages in order,
 * short-circuiting on first failure.
 */
export async function validateRequest(ctx: ValidationContext): Promise<ValidationResult> {
  // Stage 1: IP blocklist check
  const ipCheck = checkIPBlocklist(ctx.ip)
  if (!ipCheck.passed) return ipCheck

  // Stage 2: Authentication
  const authResult = await authenticateRequest(ctx)
  if (!authResult.passed) return authResult

  // Stage 3: Rate limiting (depends on authenticated user tier)
  const tier = getUserTier(ctx.userId!)
  const rateResult = checkRateLimit(ctx.userId!, tier)
  if (!rateResult.passed) return rateResult

  // Stage 4: Authorization (role-based access control)
  const authzResult = checkAuthorization(ctx)
  if (!authzResult.passed) return authzResult

  // Stage 5: Request size limits
  const sizeResult = checkRequestSize(ctx)
  if (!sizeResult.passed) return sizeResult

  // Stage 6: Input sanitization and schema validation
  const schemaResult = validateSchema(ctx)
  if (!schemaResult.passed) return schemaResult

  // Stage 7: Business rule validation
  const businessResult = await checkBusinessRules(ctx)
  if (!businessResult.passed) return businessResult

  // Stage 8: Idempotency check for mutating requests
  if (ctx.method !== 'GET') {
    const idempotencyResult = checkIdempotency(ctx)
    if (!idempotencyResult.passed) return idempotencyResult
  }

  return { passed: true, stage: 'complete' }
}

function checkIPBlocklist(ip: string): ValidationResult {
  // Check against known malicious IPs
  const blocklist = new Set(['0.0.0.0'])

  if (blocklist.has(ip)) {
    return { passed: false, stage: 'ip-check', errorCode: 403, errorMessage: 'IP address blocked' }
  }

  // Check for private/internal IPs on public endpoints
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
    // Allow internal IPs but flag for monitoring
    console.info(`Internal IP access: ${ip}`)
  }

  return { passed: true, stage: 'ip-check' }
}

async function authenticateRequest(ctx: ValidationContext): Promise<ValidationResult> {
  const authHeader = ctx.headers['authorization']

  if (!authHeader) {
    // Check for API key in query params as fallback
    const apiKey = ctx.headers['x-api-key']
    if (!apiKey) {
      return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Missing authentication' }
    }
    return validateApiKey(apiKey, ctx)
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    return validateBearerToken(token, ctx)
  }

  if (authHeader.startsWith('Basic ')) {
    return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Basic auth not supported' }
  }

  return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Invalid auth scheme' }
}

async function validateBearerToken(token: string, ctx: ValidationContext): Promise<ValidationResult> {
  try {
    // Verify JWT structure
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Malformed token' }
    }

    // Decode payload (simplified - real impl would verify signature)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Token expired' }
    }

    // Check issuer
    if (payload.iss !== 'auth.myapp.com') {
      return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Invalid token issuer' }
    }

    ctx.userId = payload.sub
    ctx.orgId = payload.org
    ctx.role = payload.role

    return { passed: true, stage: 'auth' }
  } catch {
    return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Token validation failed' }
  }
}

async function validateApiKey(key: string, ctx: ValidationContext): Promise<ValidationResult> {
  // API keys must start with 'gk_' prefix
  if (!key.startsWith('gk_')) {
    return { passed: false, stage: 'auth', errorCode: 401, errorMessage: 'Invalid API key format' }
  }

  // Lookup would go here
  ctx.userId = `apikey_${key.slice(3, 11)}`
  ctx.role = 'api'

  return { passed: true, stage: 'auth' }
}

function getUserTier(userId: string): RateLimitTier {
  // Simplified tier lookup
  if (userId.startsWith('enterprise_')) return 'enterprise'
  if (userId.startsWith('pro_')) return 'pro'
  return 'free'
}

function checkRateLimit(userId: string, tier: RateLimitTier): ValidationResult {
  const limits = RATE_LIMITS[tier]
  const now = Date.now()

  let counter = rateLimitCounters.get(userId)
  if (!counter) {
    counter = { count: 0, windowStart: now, burstCount: 0, burstWindowStart: now }
    rateLimitCounters.set(userId, counter)
  }

  // Reset minute window
  if (now - counter.windowStart > 60_000) {
    counter.count = 0
    counter.windowStart = now
  }

  // Reset burst window (1 second)
  if (now - counter.burstWindowStart > 1_000) {
    counter.burstCount = 0
    counter.burstWindowStart = now
  }

  // Check burst limit first
  if (counter.burstCount >= limits.burstLimit) {
    return {
      passed: false,
      stage: 'rate-limit',
      errorCode: 429,
      errorMessage: `Burst limit exceeded. Max ${limits.burstLimit} requests per second for ${tier} tier.`,
    }
  }

  // Check per-minute limit
  if (counter.count >= limits.requestsPerMinute) {
    return {
      passed: false,
      stage: 'rate-limit',
      errorCode: 429,
      errorMessage: `Rate limit exceeded. Max ${limits.requestsPerMinute} requests per minute for ${tier} tier.`,
    }
  }

  counter.count++
  counter.burstCount++

  return { passed: true, stage: 'rate-limit' }
}

const ROUTE_PERMISSIONS: Record<string, string[]> = {
  'GET /api/users': ['admin', 'manager', 'api'],
  'POST /api/users': ['admin'],
  'DELETE /api/users': ['admin'],
  'GET /api/reports': ['admin', 'manager', 'analyst', 'api'],
  'POST /api/reports': ['admin', 'manager'],
  'GET /api/settings': ['admin'],
  'PUT /api/settings': ['admin'],
}

function checkAuthorization(ctx: ValidationContext): ValidationResult {
  const routeKey = `${ctx.method} ${ctx.path}`
  const allowedRoles = ROUTE_PERMISSIONS[routeKey]

  // If no permissions defined, allow (open endpoint)
  if (!allowedRoles) {
    return { passed: true, stage: 'authz' }
  }

  if (!ctx.role || !allowedRoles.includes(ctx.role)) {
    return {
      passed: false,
      stage: 'authz',
      errorCode: 403,
      errorMessage: `Role '${ctx.role || 'none'}' not authorized for ${routeKey}`,
    }
  }

  return { passed: true, stage: 'authz' }
}

function checkRequestSize(ctx: ValidationContext): ValidationResult {
  const contentLength = parseInt(ctx.headers['content-length'] || '0', 10)
  const maxSize = 10 * 1024 * 1024 // 10MB

  if (contentLength > maxSize) {
    return {
      passed: false,
      stage: 'size-check',
      errorCode: 413,
      errorMessage: `Request body too large: ${contentLength} bytes (max: ${maxSize})`,
    }
  }

  return { passed: true, stage: 'size-check' }
}

function validateSchema(ctx: ValidationContext): ValidationResult {
  if (ctx.method === 'GET' || !ctx.body) {
    return { passed: true, stage: 'schema' }
  }

  if (typeof ctx.body !== 'object') {
    return { passed: false, stage: 'schema', errorCode: 400, errorMessage: 'Request body must be JSON object' }
  }

  // Check for dangerous keys
  const body = ctx.body as Record<string, unknown>
  const dangerousKeys = ['__proto__', 'constructor', 'prototype']
  for (const key of dangerousKeys) {
    if (key in body) {
      return { passed: false, stage: 'schema', errorCode: 400, errorMessage: `Forbidden key in request body: ${key}` }
    }
  }

  return { passed: true, stage: 'schema' }
}

async function checkBusinessRules(ctx: ValidationContext): Promise<ValidationResult> {
  // Example: prevent modifications during maintenance windows
  const maintenanceStart = 2 // 2 AM UTC
  const maintenanceEnd = 4   // 4 AM UTC
  const currentHour = ctx.timestamp.getUTCHours()

  if (ctx.method !== 'GET' && currentHour >= maintenanceStart && currentHour < maintenanceEnd) {
    return {
      passed: false,
      stage: 'business-rules',
      errorCode: 503,
      errorMessage: 'System under maintenance. Write operations disabled between 2-4 AM UTC.',
    }
  }

  return { passed: true, stage: 'business-rules' }
}

function checkIdempotency(ctx: ValidationContext): ValidationResult {
  const idempotencyKey = ctx.headers['idempotency-key']

  if (ctx.method === 'POST' && !idempotencyKey) {
    return {
      passed: false,
      stage: 'idempotency',
      errorCode: 400,
      errorMessage: 'POST requests require an Idempotency-Key header',
    }
  }

  return { passed: true, stage: 'idempotency' }
}
