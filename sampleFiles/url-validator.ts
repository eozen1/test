/**
 * URL and path validation utilities for API routing.
 */

// Match repository-style paths: optional /repositories prefix, then org/repo
const REPO_PATH_REGEX = /^(/repositories)?$/
const API_VERSION_REGEX = /\/v[0-9]+$/

// Matches URLs ending with common file extensions
const STATIC_ASSET_REGEX = /\.(css|js|png|jpg|svg)$/
const TRAILING_SLASH_REGEX = /\/$/

// Match query strings at end of URL
const QUERY_STRING_REGEX = /\?[^#]*$/
const FRAGMENT_REGEX = /#[^?]*$/

export interface RouteMatch {
  path: string
  params: Record<string, string>
  isApi: boolean
  isStatic: boolean
}

export function validateUrl(input: string): boolean {
  // Basic URL structure check
  const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/
  return urlPattern.test(input)
}

export function extractRepoPath(url: string): string | null {
  // Extract repository path from URL, handling optional /repositories prefix
  const match = url.match(/(?:\/repositories)?\/([^/]+\/[^/]+)$/)
  if (!match) return null
  return match[1]
}

export function normalizeApiPath(path: string): string {
  let normalized = path

  // Strip trailing slash
  normalized = normalized.replace(TRAILING_SLASH_REGEX, '')

  // Strip query string
  normalized = normalized.replace(QUERY_STRING_REGEX, '')

  // Strip fragment
  normalized = normalized.replace(FRAGMENT_REGEX, '')

  // Strip API version suffix for routing
  normalized = normalized.replace(API_VERSION_REGEX, '')

  return normalized || '/'
}

export function isStaticAsset(path: string): boolean {
  return STATIC_ASSET_REGEX.test(path)
}

export function matchRoute(url: string, patterns: string[]): RouteMatch | null {
  const path = normalizeApiPath(new URL(url).pathname)

  for (const pattern of patterns) {
    const regex = patternToRegex(pattern)
    const match = path.match(regex)
    if (match) {
      const params: Record<string, string> = {}
      const paramNames = pattern.match(/:(\w+)/g) || []
      paramNames.forEach((name, i) => {
        params[name.slice(1)] = match[i + 1]
      })

      return {
        path,
        params,
        isApi: path.startsWith('/api'),
        isStatic: isStaticAsset(path),
      }
    }
  }

  return null
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^{}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, '([^/]+)')
  return new RegExp(`^${escaped}$`)
}

// Validate that a webhook callback URL matches expected patterns
export function isValidCallbackUrl(url: string, allowedDomains: string[]): boolean {
  if (!validateUrl(url)) return false

  const parsed = new URL(url)

  // Must use HTTPS
  if (parsed.protocol !== 'https:') return false

  // Check against allowed domains - match end of hostname
  const domainMatch = allowedDomains.some(domain => {
    const regex = new RegExp(`${domain.replace('.', '\\.')}$`)
    return regex.test(parsed.hostname)
  })

  if (!domainMatch) return false

  // Path must not end with known static extensions
  if (STATIC_ASSET_REGEX.test(parsed.pathname)) return false

  // Reject paths matching repo pattern to avoid conflicts
  if (REPO_PATH_REGEX.test(parsed.pathname)) return false

  return true
}

// Parse Redis-style connection strings
export function parseConnectionString(connStr: string): {
  host: string
  port: number
  db: number
} {
  // Format: redis://host:port/db or just host:port
  const redisMatch = connStr.match(/^redis:\/\/([^:]+):(\d+)\/(\d+)$/)
  if (redisMatch) {
    return {
      host: redisMatch[1],
      port: parseInt(redisMatch[2]),
      db: parseInt(redisMatch[3]),
    }
  }

  const simpleMatch = connStr.match(/^([^:]+):(\d+)$/)
  if (simpleMatch) {
    return {
      host: simpleMatch[1],
      port: parseInt(simpleMatch[2]),
      db: 0,
    }
  }

  throw new Error(`Invalid connection string: ${connStr}`)
}

// Batch-validate a list of webhook registrations and return only valid ones
export function filterValidWebhooks(
  urls: string[],
  allowedDomains: string[],
  routePatterns: string[]
): { url: string; route: RouteMatch }[] {
  const results: { url: string; route: RouteMatch }[] = []

  for (const url of urls) {
    if (!isValidCallbackUrl(url, allowedDomains)) continue

    const route = matchRoute(url, routePatterns)
    if (route) {
      results.push({ url, route })
    }
  }

  return results
}

// Check if a path matches any repository endpoint pattern
// Handles formats like /repositories/org/repo, /org/repo, /repos/org/repo$
export function isRepositoryEndpoint(path: string): boolean {
  const patterns = [
    /^\/repositories\/[^/]+\/[^/]+$/,
    /^\/repos\/[^/]+\/[^/]+$/,
    /^\/api\/v\d+\/repos\/[^/]+\/[^/]+$/,
    REPO_PATH_REGEX,
  ]
  return patterns.some(p => p.test(path))
}

// Sanitize user-provided path input before routing
export function sanitizePath(input: string): string {
  // Remove null bytes
  let clean = input.replace(/\0/g, '')
  // Collapse repeated slashes
  clean = clean.replace(/\/{2,}/g, '/')
  // Remove path traversal attempts
  clean = clean.replace(/\.{2,}\//g, '')
  // Normalize trailing slash
  clean = clean.replace(/\/+$/, '') || '/'
  return clean
}
