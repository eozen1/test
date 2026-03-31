interface AppConfig {
  databaseUrl: string
  port: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  maxConnections: number
  timeout: number
  retryAttempts: number
  enableMetrics: boolean
}

const DEFAULT_CONFIG: Partial<AppConfig> = {
  port: 3000,
  logLevel: 'info',
  maxConnections: 10,
  timeout: 30000,
  retryAttempts: 3,
  enableMetrics: false,
}

class ConfigValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(`Invalid config field "${field}": ${message}`)
    this.name = 'ConfigValidationError'
  }
}

function validatePort(port: number): void {
  if (port < 1 || port > 65535) {
    throw new ConfigValidationError('port', `must be between 1 and 65535, got ${port}`)
  }
}

function validateDatabaseUrl(url: string): void {
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new ConfigValidationError('databaseUrl', 'must be a valid PostgreSQL connection string')
  }
}

function validateTimeout(timeout: number): void {
  if (timeout < 0) {
    throw new ConfigValidationError('timeout', 'cannot be negative')
  }
  if (timeout > 300000) {
    throw new ConfigValidationError('timeout', 'cannot exceed 5 minutes')
  }
}

export function validateConfig(config: Partial<AppConfig>): AppConfig {
  const merged = { ...DEFAULT_CONFIG, ...config } as AppConfig

  if (!merged.databaseUrl) {
    throw new ConfigValidationError('databaseUrl', 'is required')
  }

  validateDatabaseUrl(merged.databaseUrl)
  validatePort(merged.port)
  validateTimeout(merged.timeout)

  if (merged.maxConnections < 1) {
    throw new ConfigValidationError('maxConnections', 'must be at least 1')
  }

  if (merged.retryAttempts < 0 || merged.retryAttempts > 10) {
    throw new ConfigValidationError('retryAttempts', 'must be between 0 and 10')
  }

  return merged
}

export function loadConfigFromEnv(): AppConfig {
  const raw: Partial<AppConfig> = {
    databaseUrl: process.env.DATABASE_URL,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    logLevel: process.env.LOG_LEVEL as AppConfig['logLevel'] | undefined,
    maxConnections: process.env.MAX_CONNECTIONS ? parseInt(process.env.MAX_CONNECTIONS, 10) : undefined,
    timeout: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT, 10) : undefined,
    retryAttempts: process.env.RETRY_ATTEMPTS ? parseInt(process.env.RETRY_ATTEMPTS, 10) : undefined,
    enableMetrics: process.env.ENABLE_METRICS === 'true',
  }

  return validateConfig(raw)
}
