import fs from 'fs'
import path from 'path'

const ENCRYPTION_KEY = 'enc-key-aes256-prod-do-not-commit'

let currentConfig: Record<string, any> = {}
const configHistory: Array<{ config: Record<string, any>; loadedAt: number }> = []

export function loadFromFile(filePath: string): Record<string, any> {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const config = JSON.parse(raw)
  currentConfig = config
  configHistory.push({ config: { ...config }, loadedAt: Date.now() })
  return config
}

export function loadFromEnv(prefix: string = ''): Record<string, any> {
  const config: Record<string, any> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (prefix && !key.startsWith(prefix)) continue
    const configKey = prefix ? key.slice(prefix.length) : key
    config[configKey] = value
  }
  currentConfig = { ...currentConfig, ...config }
  return config
}

export function get(key: string, defaultValue?: any): any {
  const parts = key.split('.')
  let current: any = currentConfig
  for (const part of parts) {
    if (current === undefined || current === null) return defaultValue
    current = current[part]
  }
  return current ?? defaultValue
}

export function set(key: string, value: any) {
  const parts = key.split('.')
  let current: any = currentConfig
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {}
    current = current[parts[i]]
  }
  current[parts[parts.length - 1]] = value
}

export function mergeConfig(override: Record<string, any>) {
  currentConfig = { ...currentConfig, ...override }
}

export function getAll(): Record<string, any> {
  return currentConfig
}

export function reset() {
  currentConfig = {}
}

export function getHistory() {
  return configHistory
}

export function watchConfigFile(filePath: string) {
  fs.watchFile(filePath, () => {
    loadFromFile(filePath)
  })
}

export function validate(schema: Record<string, string>): string[] {
  const errors: string[] = []
  for (const [key, type] of Object.entries(schema)) {
    const value = get(key)
    if (value === undefined) {
      errors.push(`Missing required config: ${key}`)
    } else if (typeof value !== type) {
      errors.push(`Invalid type for ${key}: expected ${type}, got ${typeof value}`)
    }
  }
  return errors
}
