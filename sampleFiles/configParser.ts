import * as fs from 'fs'
import * as path from 'path'

interface AppConfig {
  port: number
  host: string
  database: {
    url: string
    maxConnections: number
    ssl: boolean
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    format: 'json' | 'text'
  }
  features: Record<string, boolean>
}

const DEFAULT_CONFIG: AppConfig = {
  port: 3000,
  host: '0.0.0.0',
  database: {
    url: 'postgresql://localhost:5432/app',
    maxConnections: 10,
    ssl: false,
  },
  logging: {
    level: 'info',
    format: 'json',
  },
  features: {},
}

export function loadConfig(configPath?: string): AppConfig {
  const resolvedPath = configPath || path.resolve(process.cwd(), 'config.json')

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`Config file not found at ${resolvedPath}, using defaults`)
    return { ...DEFAULT_CONFIG }
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8')
  const parsed = JSON.parse(raw)

  return mergeConfig(DEFAULT_CONFIG, parsed)
}

function mergeConfig(defaults: AppConfig, overrides: Partial<AppConfig>): AppConfig {
  return {
    port: overrides.port ?? defaults.port,
    host: overrides.host ?? defaults.host,
    database: {
      ...defaults.database,
      ...overrides.database,
    },
    logging: {
      ...defaults.logging,
      ...overrides.logging,
    },
    features: {
      ...defaults.features,
      ...overrides.features,
    },
  }
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = []

  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port}. Must be between 1 and 65535.`)
  }

  if (!config.database.url) {
    errors.push('Database URL is required.')
  }

  if (config.database.maxConnections < 1) {
    errors.push('Database maxConnections must be at least 1.')
  }

  return errors
}

export function getFeatureFlag(config: AppConfig, flag: string): boolean {
  return config.features[flag] ?? false
}
