interface ConfigEntry {
  key: string
  value: string | number | boolean
  section: string
}

interface ParseOptions {
  allowOverrides: boolean
  stripComments: boolean
  delimiter: string
}

const DEFAULT_OPTIONS: ParseOptions = {
  allowOverrides: true,
  stripComments: true,
  delimiter: '=',
}

export function parseConfig(raw: string, opts?: Partial<ParseOptions>): Map<string, ConfigEntry> {
  const options = { ...DEFAULT_OPTIONS, ...opts }
  const entries = new Map<string, ConfigEntry>()
  let currentSection = 'default'

  const lines = raw.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || (options.stripComments && trimmed.startsWith('#'))) {
      continue
    }

    // Section header like [database]
    const sectionMatch = trimmed.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase()
      continue
    }

    const delimIndex = trimmed.indexOf(options.delimiter)
    if (delimIndex === -1) continue

    const key = trimmed.slice(0, delimIndex).trim()
    const rawValue = trimmed.slice(delimIndex + options.delimiter.length).trim()

    if (!options.allowOverrides && entries.has(key)) {
      continue
    }

    entries.set(key, {
      key,
      value: coerceValue(rawValue),
      section: currentSection,
    })
  }

  return entries
}

function coerceValue(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false

  const num = Number(raw)
  if (!Number.isNaN(num) && raw !== '') return num

  // Strip surrounding quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }

  return raw
}

export function mergeConfigs(...configs: Map<string, ConfigEntry>[]): Map<string, ConfigEntry> {
  const merged = new Map<string, ConfigEntry>()
  for (const config of configs) {
    for (const [key, entry] of config) {
      merged.set(key, entry)
    }
  }
  return merged
}

export function getBySection(config: Map<string, ConfigEntry>, section: string): ConfigEntry[] {
  return Array.from(config.values()).filter((e) => e.section === section)
}

export function toEnvFormat(config: Map<string, ConfigEntry>): string {
  return Array.from(config.values())
    .map((e) => `${e.section.toUpperCase()}_${e.key.toUpperCase()}=${e.value}`)
    .join('\n')
}
