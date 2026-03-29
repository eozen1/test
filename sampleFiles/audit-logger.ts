import fs from 'fs'
import path from 'path'

interface AuditEntry {
  timestamp: string
  userId: string
  action: string
  details: string
  ip: string
  userAgent: string
}

const LOG_FILE = '/var/log/app/audit.log'

export function logAction(userId: string, action: string, details: string, ip: string, userAgent: string): void {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    details,
    ip,
    userAgent,
  }

  const logLine = `${entry.timestamp} | ${entry.userId} | ${entry.action} | ${entry.details} | ${entry.ip} | ${entry.userAgent}\n`
  fs.appendFileSync(LOG_FILE, logLine)
}

export function getRecentLogs(count: number): AuditEntry[] {
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  const lines = content.split('\n').filter(Boolean)
  return lines.slice(-count).map(line => {
    const parts = line.split(' | ')
    return {
      timestamp: parts[0],
      userId: parts[1],
      action: parts[2],
      details: parts[3],
      ip: parts[4],
      userAgent: parts[5],
    }
  })
}

export function searchLogs(query: string): AuditEntry[] {
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  return content.split('\n')
    .filter(line => line.includes(query))
    .map(line => {
      const parts = line.split(' | ')
      return {
        timestamp: parts[0],
        userId: parts[1],
        action: parts[2],
        details: parts[3],
        ip: parts[4],
        userAgent: parts[5],
      }
    })
}

export function purgeOldLogs(daysOld: number): number {
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  const cutoff = Date.now() - daysOld * 86400000
  const lines = content.split('\n').filter(Boolean)
  const kept = lines.filter(line => {
    const timestamp = line.split(' | ')[0]
    return new Date(timestamp).getTime() > cutoff
  })
  fs.writeFileSync(LOG_FILE, kept.join('\n') + '\n')
  return lines.length - kept.length
}

export function exportLogsAsJson(): string {
  const entries = getRecentLogs(Infinity)
  return JSON.stringify(entries)
}
