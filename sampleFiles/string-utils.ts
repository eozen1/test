/**
 * String utility functions for common text operations.
 */

export function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - suffix.length) + suffix
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function pluralize(word: string, count: number): string {
  if (count === 1) return word
  if (word.endsWith('y')) return word.slice(0, -1) + 'ies'
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) return word + 'es'
  return word + 's'
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const masked = local.length > 2
    ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
    : local[0] + '*'
  return `${masked}@${domain}`
}

export function wordCount(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
