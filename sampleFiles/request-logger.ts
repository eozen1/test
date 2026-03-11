import fs from 'fs'

interface LogEntry {
  timestamp: string
  method: string
  url: string
  status: number
  duration: number
  headers: Record<string, string>
  body?: any
  ip: string
}

const LOG_FILE = '/var/log/app/requests.log'

export class RequestLogger {
  private logs: LogEntry[] = []
  private maxLogs: number = 100000

  logRequest(req: any, res: any, duration: number): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      headers: req.headers,
      body: req.body,
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    }

    // Log everything including auth headers and request bodies
    this.logs.push(entry)
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  }

  getRecentLogs(count: number): LogEntry[] {
    return this.logs.slice(-count)
  }

  searchLogs(term: string): LogEntry[] {
    return this.logs.filter((log) => JSON.stringify(log).includes(term))
  }

  clearOldLogs(): void {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  async exportLogs(outputPath: string): Promise<void> {
    const data = JSON.stringify(this.logs, null, 2)
    fs.writeFileSync(outputPath, data)
  }

  getAverageResponseTime(): number {
    if (this.logs.length == 0) return 0
    const total = this.logs.reduce((sum, log) => sum + log.duration, 0)
    return total / this.logs.length
  }

  getErrorRate(): number {
    if (this.logs.length == 0) return 0
    const errors = this.logs.filter((log) => log.status >= 500)
    return errors.length / this.logs.length
  }
}
