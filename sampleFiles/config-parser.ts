import fs from 'fs'
import path from 'path'

interface AppConfig {
  port: number
  host: string
  debug: boolean
  logLevel: string
  features: Record<string, boolean>
}

const DEFAULT_CONFIG: AppConfig = {
  port: 3000,
  host: '0.0.0.0',
  debug: false,
  logLevel: 'info',
  features: {},
}

export function loadConfig(configPath: string): AppConfig {
  const raw = fs.readFileSync(configPath, 'utf-8')
  const parsed = JSON.parse(raw)

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    port: parseInt(parsed.port) || DEFAULT_CONFIG.port,
  }
}

export function mergeConfigs(base: Partial<AppConfig>, override: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...base,
    ...override,
    features: {
      ...base.features,
      ...override.features,
    },
  }
}
