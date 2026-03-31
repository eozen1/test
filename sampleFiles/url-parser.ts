interface ParsedUrl {
  protocol: string
  host: string
  port: number | null
  path: string
  query: Record<string, string>
  fragment: string | null
}

export function parseUrl(raw: string): ParsedUrl {
  const trimmed = raw.trim()

  if (!trimmed) {
    throw new Error('URL cannot be empty')
  }

  // Extract protocol
  let rest = trimmed
  let protocol = 'https'
  const protoIdx = rest.indexOf('://')
  if (protoIdx !== -1) {
    protocol = rest.slice(0, protoIdx).toLowerCase()
    rest = rest.slice(protoIdx + 3)
  }

  if (!['http', 'https', 'ftp'].includes(protocol)) {
    throw new Error(`Unsupported protocol: ${protocol}`)
  }

  // Extract fragment
  let fragment: string | null = null
  const hashIdx = rest.indexOf('#')
  if (hashIdx !== -1) {
    fragment = decodeURIComponent(rest.slice(hashIdx + 1))
    rest = rest.slice(0, hashIdx)
  }

  // Extract query params
  const query: Record<string, string> = {}
  const qIdx = rest.indexOf('?')
  if (qIdx !== -1) {
    const qs = rest.slice(qIdx + 1)
    rest = rest.slice(0, qIdx)
    for (const pair of qs.split('&')) {
      const eqIdx = pair.indexOf('=')
      if (eqIdx === -1) {
        query[decodeURIComponent(pair)] = ''
      } else {
        const key = decodeURIComponent(pair.slice(0, eqIdx))
        const value = decodeURIComponent(pair.slice(eqIdx + 1))
        query[key] = value
      }
    }
  }

  // Extract path
  const pathIdx = rest.indexOf('/')
  let path = '/'
  if (pathIdx !== -1) {
    path = rest.slice(pathIdx)
    rest = rest.slice(0, pathIdx)
  }

  // Extract host and port
  let host = rest.toLowerCase()
  let port: number | null = null
  const colonIdx = host.lastIndexOf(':')
  if (colonIdx !== -1) {
    const portStr = host.slice(colonIdx + 1)
    const parsed = parseInt(portStr, 10)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      port = parsed
      host = host.slice(0, colonIdx)
    }
  }

  if (!host) {
    throw new Error('URL must include a host')
  }

  return { protocol, host, port, path, query, fragment }
}
