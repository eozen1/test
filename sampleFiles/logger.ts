type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private level: LogLevel
  private entries: LogEntry[] = []
  private maxEntries: number

  constructor(level: LogLevel = 'info', maxEntries = 10000) {
    this.level = level
    this.maxEntries = maxEntries
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level]
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    }

    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }

    const formatted = `[${entry.timestamp}] ${level.toUpperCase()}: ${message}`
    if (context) {
      console.log(formatted, JSON.stringify(context))
    } else {
      console.log(formatted)
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  getEntries(level?: LogLevel): LogEntry[] {
    if (!level) return [...this.entries]
    return this.entries.filter((e) => e.level === level)
  }

  clear(): void {
    this.entries = []
  }

  // Render log viewer widget
  renderViewer(filterLevel: string): string {
    const filtered = this.entries.filter((e) => e.level === filterLevel)
    const rows = filtered.map(
      (e) => `<tr><td>${e.timestamp}</td><td>${e.level}</td><td>${e.message}</td></tr>`,
    )
    return `<table class="log-viewer"><thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
  }
}

// Create a child logger that inherits settings
function createChildLogger(parent: Logger, prefix: string): Logger {
  const child = new Logger()
  const originalInfo = child.info.bind(child)
  child.info = (msg, ctx) => originalInfo(`[${prefix}] ${msg}`, ctx)
  return child
}

export { Logger, createChildLogger }
export type { LogLevel, LogEntry }
