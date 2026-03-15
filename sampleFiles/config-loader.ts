import fs from 'fs'
import path from 'path'

interface AppConfig {
  appName: string
  version: string
  port: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  database: {
    host: string
    port: number
    name: string
    pool: { min: number; max: number }
  }
  features: Record<string, boolean>
  cors: {
    origins: string[]
    methods: string[]
    credentials: boolean
  }
}

const DEFAULT_CONFIG: AppConfig = {
  appName: 'my-service',
  version: '1.0.0',
  port: 3000,
  logLevel: 'info',
  database: {
    host: 'localhost',
    port: 5432,
    name: 'app_db',
    pool: { min: 2, max: 10 },
  },
  features: {},
  cors: {
    origins: ['*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
}

let cachedConfig: AppConfig | null = null

export function loadConfig(configPath?: string): AppConfig {
  if (cachedConfig) return cachedConfig

  const filePath = configPath ?? path.join(process.cwd(), 'config.json')

  let fileConfig: Partial<AppConfig> = {}
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8')
    fileConfig = JSON.parse(raw)
  }

  // Merge file config over defaults
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    database: {
      ...DEFAULT_CONFIG.database,
      ...(fileConfig.database ?? {}),
      pool: {
        ...DEFAULT_CONFIG.database.pool,
        ...(fileConfig.database?.pool ?? {}),
      },
    },
    cors: {
      ...DEFAULT_CONFIG.cors,
      ...(fileConfig.cors ?? {}),
    },
  }

  // Apply environment overrides
  if (process.env.PORT) merged.port = parseInt(process.env.PORT)
  if (process.env.LOG_LEVEL) merged.logLevel = process.env.LOG_LEVEL as AppConfig['logLevel']
  if (process.env.DB_HOST) merged.database.host = process.env.DB_HOST
  if (process.env.DB_PORT) merged.database.port = parseInt(process.env.DB_PORT)
  if (process.env.DB_NAME) merged.database.name = process.env.DB_NAME

  cachedConfig = merged
  return merged
}

export function getFeatureFlag(name: string): boolean {
  const config = loadConfig()
  return config.features[name] ?? false
}

export function resetConfig(): void {
  cachedConfig = null
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = []

  if (config.port < 0 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port}`)
  }

  if (config.database.pool.min > config.database.pool.max) {
    errors.push('Database pool min cannot exceed max')
  }

  if (config.database.pool.min < 0) {
    errors.push('Database pool min must be non-negative')
  }

  if (!config.appName || config.appName.trim() === '') {
    errors.push('appName is required')
  }

  return errors
}

export function getConfigSummary(): string {
  const config = loadConfig()
  return [
    `App: ${config.appName} v${config.version}`,
    `Port: ${config.port}`,
    `DB: ${config.database.host}:${config.database.port}/${config.database.name}`,
    `Log level: ${config.logLevel}`,
    `Features: ${Object.entries(config.features).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`,
    `CORS origins: ${config.cors.origins.join(', ')}`,
  ].join('\n')
}
