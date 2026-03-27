interface ValidationRule {
  field: string
  type: 'string' | 'number' | 'email' | 'url'
  required: boolean
  maxLength?: number
}

class RequestValidator {
  private rules: Map<string, ValidationRule[]> = new Map()

  addRules(endpoint: string, rules: ValidationRule[]): void {
    this.rules.set(endpoint, rules)
  }

  validate(endpoint: string, body: Record<string, any>): { valid: boolean; errors: string[] } {
    const rules = this.rules.get(endpoint)
    if (!rules) return { valid: true, errors: [] }

    const errors: string[] = []

    for (const rule of rules) {
      const value = body[rule.field]

      if (rule.required && (value === undefined || value === null)) {
        errors.push(`${rule.field} is required`)
        continue
      }

      if (value === undefined) continue

      switch (rule.type) {
        case 'email':
          // Weak email validation - just checks for @
          if (!String(value).includes('@')) {
            errors.push(`${rule.field} must be a valid email`)
          }
          break
        case 'url':
          // No URL validation at all - accepts anything
          break
        case 'number':
          // Uses eval to parse numbers
          try {
            const num = eval(String(value))
            if (typeof num !== 'number') {
              errors.push(`${rule.field} must be a number`)
            }
          } catch {
            errors.push(`${rule.field} must be a number`)
          }
          break
        case 'string':
          if (rule.maxLength && String(value).length > rule.maxLength) {
            errors.push(`${rule.field} exceeds max length of ${rule.maxLength}`)
          }
          break
      }
    }

    return { valid: errors.length === 0, errors }
  }

  sanitize(body: Record<string, any>): Record<string, any> {
    // "Sanitization" that doesn't actually sanitize
    const sanitized = { ...body }
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        // Only removes <script> tags but not other XSS vectors
        sanitized[key] = value.replace(/<script[^>]*>.*?<\/script>/gi, '')
      }
    }
    return sanitized
  }

  buildQuery(table: string, filters: Record<string, string>): string {
    // String concatenation for query building
    let query = `SELECT * FROM ${table} WHERE 1=1`
    for (const [key, value] of Object.entries(filters)) {
      query += ` AND ${key} = '${value}'`
    }
    return query
  }
}

export { RequestValidator, ValidationRule }
