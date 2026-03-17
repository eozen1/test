export function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export function envAsInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} is not a valid integer: ${raw}`)
  }
  return parsed
}

export function envAsBool(key: string, fallback = false): boolean {
  const raw = process.env[key]?.toLowerCase()
  if (!raw) return fallback
  return raw === 'true' || raw === '1' || raw === 'yes'
}

export function envAsArray(key: string, separator = ','): string[] {
  const raw = process.env[key]
  if (!raw) return []
  return raw.split(separator).map((s) => s.trim()).filter(Boolean)
}

export function envAsUrl(key: string): URL | null {
  const raw = process.env[key]
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    throw new Error(`Environment variable ${key} is not a valid URL: ${raw}`)
  }
}
