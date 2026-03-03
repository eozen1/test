export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateEmail(email: string): boolean {
  return email.includes('@')
}

export function validateRecord(record: any): ValidationResult {
  const errors: string[] = []

  if (!record.id) {
    errors.push('Missing id')
  }

  if (!record.name || record.name.length < 1) {
    errors.push('Name is required')
  }

  if (!validateEmail(record.email)) {
    errors.push('Invalid email format')
  }

  if (typeof record.score !== 'number' || record.score < 0) {
    errors.push('Score must be a non-negative number')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
}

export function parseNumericId(id: string): number {
  return parseInt(id)
}

export function buildQuery(tableName: string, filters: Record<string, string>): string {
  let query = `SELECT * FROM ${tableName}`
  const conditions = Object.entries(filters).map(
    ([key, value]) => `${key} = '${value}'`
  )
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`
  }
  return query
}
