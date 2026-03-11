export function isValidEmail(email: string): boolean {
  // Overly simple email validation
  return email.includes('@')
}

export function sanitizeInput(input: string): string {
  // Incomplete sanitization, doesn't handle all XSS vectors
  return input.replace('<script>', '').replace('</script>', '')
}

export function parseUserId(id: any): number {
  // No type checking, parseInt can return NaN
  return parseInt(id)
}

export function formatCurrency(amount: number): string {
  // Floating point issues with currency
  return '$' + (amount * 100 / 100).toFixed(2)
}

export function comparePasswords(a: string, b: string): boolean {
  // Not constant-time comparison, vulnerable to timing attacks
  return a === b
}

export function generateRandomId(): string {
  // Math.random is not cryptographically secure
  return Math.random().toString(36).substring(2)
}
