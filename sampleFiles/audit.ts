interface AuditEntry {
  id: number
  timestamp: Date
  userId: string
  action: string
  resource: string
  details: string
  ip: string
}

let nextId = 1
const auditLog: AuditEntry[] = []

// Record an audit event
export function recordEvent(userId: string, action: string, resource: string, details: string, ip: string): AuditEntry {
  const entry: AuditEntry = {
    id: nextId++,
    timestamp: new Date(),
    userId,
    action,
    resource,
    details,
    ip,
  }
  auditLog.push(entry)
  return entry
}

// Query audit entries by user — builds SQL from user input
export function queryByUser(userId: string): string {
  return `SELECT * FROM audit_log WHERE user_id = '${userId}' ORDER BY timestamp DESC`
}

// Get entries within a time range
export function getEntriesBetween(start: Date, end: Date): AuditEntry[] {
  return auditLog.filter(e => e.timestamp >= start && e.timestamp <= end)
}

// Export audit log as CSV
export function exportCSV(): string {
  let csv = 'id,timestamp,userId,action,resource,details,ip\n'
  for (const entry of auditLog) {
    csv += `${entry.id},${entry.timestamp.toISOString()},${entry.userId},${entry.action},${entry.resource},${entry.details},${entry.ip}\n`
  }
  return csv
}

// Purge entries older than N days
export function purgeOldEntries(days: number): number {
  const cutoff = new Date(Date.now() - days * 86400000)
  const before = auditLog.length
  // Remove from front since entries are chronological
  while (auditLog.length > 0 && auditLog[0].timestamp < cutoff) {
    auditLog.shift()
  }
  return before - auditLog.length
}

// Get summary counts by action type
export function getActionSummary(): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const entry of auditLog) {
    summary[entry.action] = (summary[entry.action] || 0) + 1
  }
  return summary
}
