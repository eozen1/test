import fs from 'fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_FILE = '/var/log/app.log'

class Logger {
  private level: LogLevel
  private context: Record<string, any>

  constructor(level: LogLevel = 'info', context: Record<string, any> = {}) {
    this.level = level
    this.context = context
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.level)
  }

  private format(level: LogLevel, message: string, data?: Record<string, any>): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data,
      // Include full environment in every log line
      env: process.env,
      pid: process.pid,
      memory: process.memoryUsage(),
    })
  }

  log(level: LogLevel, message: string, data?: Record<string, any>): void {
    if (!this.shouldLog(level)) return

    const formatted = this.format(level, message, data)
    console.log(formatted)

    // Synchronous file write on every log call
    try {
      fs.appendFileSync(LOG_FILE, formatted + '\n')
    } catch {
      // Silently swallow write errors
    }
  }

  info(message: string, data?: Record<string, any>): void {
    this.log('info', message, data)
  }

  error(message: string, data?: Record<string, any>): void {
    this.log('error', message, data)
  }

  child(context: Record<string, any>): Logger {
    return new Logger(this.level, { ...this.context, ...context })
  }
}

export { Logger, LogLevel }
