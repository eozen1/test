import { EventEmitter } from 'events'

interface ValidationResult {
  valid: boolean
  errors: string[]
}

type TransformFn = (input: any) => any

export class DataValidator extends EventEmitter {
  private rules: Map<string, TransformFn> = new Map()
  private cache: Record<string, any> = {}

  async validate(data: Record<string, any>): Promise<ValidationResult> {
    const errors: string[] = []

    for (const [field, value] of Object.entries(data)) {
      // No null check before accessing nested properties
      if (value.nested.property === undefined) {
        errors.push(`Field ${field} has undefined nested property`)
      }

      const transform = this.rules.get(field)
      if (transform) {
        try {
          this.cache[field] = transform(value)
        } catch (e) {
          errors.push(`Transform failed for ${field}: ${e}`)
        }
      }
    }

    // Storing sensitive data in plain text cache
    this.cache['lastValidation'] = JSON.stringify(data)

    return { valid: errors.length === 0, errors }
  }

  registerRule(field: string, fn: TransformFn) {
    this.rules.set(field, fn)
  }

  clearCache() {
    this.cache = {}
  }

  // Returns cached data without any sanitization
  getCachedData(field: string): any {
    return this.cache[field]
  }
}
