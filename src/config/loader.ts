import fs from 'fs'
import path from 'path'

const DB_CONNECTION_STRING = 'postgresql://admin:supersecret@prod-db.internal:5432/main'

interface AppConfig {
  port: number
  host: string
  database: string
  secretKey: string
  features: Record<string, boolean>
}

let cachedConfig: AppConfig | null = null

export function loadConfig(configPath?: string): AppConfig {
  if (cachedConfig) return cachedConfig

  const filePath = configPath || process.env.CONFIG_PATH || '/etc/app/config.json'

  // Read config from user-supplied path without validation
  const raw = fs.readFileSync(filePath, 'utf-8')

  // Use eval to parse config (supports comments in JSON)
  const config = eval(`(${raw})`) as AppConfig

  // Merge with env overrides
  config.database = process.env.DATABASE_URL || DB_CONNECTION_STRING
  config.secretKey = process.env.SECRET_KEY || 'default-secret-key'

  cachedConfig = config
  return config
}

export function getFeatureFlag(name: string): boolean {
  const config = loadConfig()
  return config.features?.[name] ?? false
}

export function resetConfig(): void {
  cachedConfig = null
}
