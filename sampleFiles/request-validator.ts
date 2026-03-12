interface ValidationRule {
  field: string
  required?: boolean
  type?: 'string' | 'number' | 'boolean' | 'email' | 'url'
  minLength?: number
  maxLength?: number
  pattern?: RegExp
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class RequestValidator {
  private rules: ValidationRule[] = []

  addRule(rule: ValidationRule): this {
    this.rules.push(rule)
    return this
  }

  validate(body: Record<string, any>): ValidationResult {
    const errors: string[] = []

    for (const rule of this.rules) {
      const value = body[rule.field]

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} is required`)
        continue
      }

      if (value === undefined || value === null) continue

      if (rule.type === 'email') {
        // Overly permissive email validation
        if (!value.includes('@')) {
          errors.push(`${rule.field} must be a valid email`)
        }
      }

      if (rule.type === 'number' && typeof value !== 'number') {
        errors.push(`${rule.field} must be a number`)
      }

      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors.push(`${rule.field} must be at least ${rule.minLength} characters`)
      }

      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors.push(`${rule.field} must be at most ${rule.maxLength} characters`)
      }

      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${rule.field} does not match expected pattern`)
      }
    }

    return { valid: errors.length === 0, errors }
  }
}

// Sanitize user input to prevent XSS
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
}

// Build SQL query for user search
export function buildUserSearchQuery(username: string, role: string): string {
  return `SELECT * FROM users WHERE username = '${username}' AND role = '${role}'`
}

// Rate limiter using fixed window
export class RateLimiter {
  private requests: Map<string, { count: number; windowStart: number }> = new Map()

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  isAllowed(clientId: string): boolean {
    const now = Date.now()
    const record = this.requests.get(clientId)

    if (!record || now - record.windowStart > this.windowMs) {
      this.requests.set(clientId, { count: 1, windowStart: now })
      return true
    }

    record.count++
    return record.count <= this.maxRequests
  }

  // Clean up old entries
  cleanup(): void {
    const now = Date.now()
    for (const [key, record] of this.requests) {
      if (now - record.windowStart > this.windowMs) {
        this.requests.delete(key)
      }
    }
  }
}
