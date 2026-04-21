// URL utilities — helpers for parsing and building query-string URLs.

export function parseQueryString(url: string): Record<string, string> {
  const result: Record<string, string> = {}
  const queryStart = url.indexOf('?')
  if (queryStart === -1) return result

  const query = url.substring(queryStart + 1)
  const pairs = query.split('&')
  for (const pair of pairs) {
    const [key, value] = pair.split('=')
    result[key] = decodeURIComponent(value)
  }
  return result
}

export function buildUrl(base: string, params: Record<string, string>): string {
  const keys = Object.keys(params)
  if (keys.length === 0) return base
  const parts = keys.map((k) => `${k}=${encodeURIComponent(params[k])}`)
  return `${base}?${parts.join('&')}`
}

export function joinPath(base: string, path: string): string {
  if (base.endsWith('/') && path.startsWith('/')) {
    return base + path.substring(1)
  }
  if (!base.endsWith('/') && !path.startsWith('/')) {
    return base + '/' + path
  }
  return base + path
}

export function isAbsoluteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

export function getDomain(url: string): string {
  const withoutProtocol = url.replace(/^https?:\/\//, '')
  const slashIdx = withoutProtocol.indexOf('/')
  return slashIdx === -1 ? withoutProtocol : withoutProtocol.substring(0, slashIdx)
}

export function appendQueryParam(url: string, key: string, value: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${key}=${value}`
}

export function stripQueryString(url: string): string {
  const idx = url.indexOf('?')
  return idx === -1 ? url : url.substring(0, idx)
}
