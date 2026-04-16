/**
 * Input sanitization utilities for API request handling.
 * Strips dangerous characters, normalizes whitespace, and validates
 * common field formats before they reach the service layer.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control characters
    .replace(/\s+/g, ' ') // collapse whitespace
}

export function sanitizeEmail(input: unknown): string | null {
  const cleaned = sanitizeString(input).toLowerCase()
  if (!EMAIL_REGEX.test(cleaned)) return null
  return cleaned
}

export function sanitizeSlug(input: unknown): string | null {
  const cleaned = sanitizeString(input).toLowerCase().replace(/\s+/g, '-')
  if (!SLUG_REGEX.test(cleaned)) return null
  return cleaned
}

export function sanitizeId(input: unknown): bigint | null {
  const str = sanitizeString(input)
  if (!/^\d+$/.test(str)) return null
  return BigInt(str)
}

export function sanitizeHtml(input: unknown): string {
  return sanitizeString(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface SanitizeOptions {
  maxLength?: number
  allowNewlines?: boolean
}

export function sanitizeTextField(input: unknown, opts: SanitizeOptions = {}): string {
  let result = typeof input === 'string' ? input.trim() : ''

  if (!opts.allowNewlines) {
    result = result.replace(/[\r\n]+/g, ' ')
  }

  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  if (opts.maxLength && result.length > opts.maxLength) {
    result = result.slice(0, opts.maxLength)
  }

  return result
}
