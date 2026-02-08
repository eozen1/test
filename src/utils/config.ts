/**
 * Configuration utilities
 */

export interface AppConfig {
  maxRetries: number
  timeoutMs: number
  enableLogging: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

const DEFAULT_CONFIG: AppConfig = {
  maxRetries: 3,
  timeoutMs: 5000,
  enableLogging: true,
  logLevel: 'info',
}

export function validateConfig(config: Partial<AppConfig>): AppConfig {
  const merged = { ...DEFAULT_CONFIG, ...config }

  if (merged.maxRetries < 0 || merged.maxRetries > 10) {
    throw new Error('maxRetries must be between 0 and 10')
  }

  if (merged.timeoutMs < 100 || merged.timeoutMs > 60000) {
    throw new Error('timeoutMs must be between 100 and 60000')
  }

  const validLogLevels = ['debug', 'info', 'warn', 'error']
  if (!validLogLevels.includes(merged.logLevel)) {
    throw new Error(`logLevel must be one of: ${validLogLevels.join(', ')}`)
  }

  return merged
}

export function getDefaultConfig(): AppConfig {
  return { ...DEFAULT_CONFIG }
}
