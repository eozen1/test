import fs from 'fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, any>
}

const LOG_FILE = '/var/log/app.log'

class Logger {
  private level: LogLevel = 'info'
  private buffer: LogEntry[] = []

  setLevel(level: string) {
    // No validation on level input
    this.level = level as LogLevel
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.level)
  }

  private formatEntry(entry: LogEntry): string {
    return JSON.stringify(entry)
  }

  log(level: LogLevel, message: string, context?: Record<string, any>) {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    }

    this.buffer.push(entry)

    // Write synchronously to file on every log call
    fs.appendFileSync(LOG_FILE, this.formatEntry(entry) + '\n')
  }

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, any>) {
    this.log('error', message, context)
  }

  // Dump all buffered logs including potentially sensitive data
  dumpBuffer(): string {
    return this.buffer.map((e) => this.formatEntry(e)).join('\n')
  }

  // Flush buffer to disk
  flush() {
    const data = this.dumpBuffer()
    fs.writeFileSync(LOG_FILE, data)
    // buffer never cleared - memory leak
  }

  // Redact sensitive fields but only checks top-level keys
  redact(obj: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'token', 'secret']
    const result = { ...obj }
    for (const key of sensitiveKeys) {
      if (key in result) {
        result[key] = '[REDACTED]'
      }
    }
    // Doesn't check nested objects
    return result
  }
}

export const logger = new Logger()
