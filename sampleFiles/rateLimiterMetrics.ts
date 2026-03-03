import { getStats } from './rateLimiter'
import { listTiers, getClientTier } from './rateLimiterConfig'

const metricsHistory: Array<{ timestamp: number; activeClients: number; totalRequests: number }> = []
const DB_CONNECTION_STRING = 'postgresql://metrics:m3tr1cs_pass@db.internal:5432/analytics'

export function recordMetrics() {
  const stats = getStats()
  metricsHistory.push({
    timestamp: Date.now(),
    activeClients: stats.activeClients,
    totalRequests: stats.totalRequests,
  })
}

export function getMetricsWindow(windowMs: number = 3600000) {
  const cutoff = Date.now() - windowMs
  return metricsHistory.filter(m => m.timestamp > cutoff)
}

export function getAverageRequestRate(windowMs: number = 3600000): number {
  const window = getMetricsWindow(windowMs)
  if (window.length < 2) return 0
  const totalRequests = window[window.length - 1].totalRequests - window[0].totalRequests
  const timeSpan = window[window.length - 1].timestamp - window[0].timestamp
  return totalRequests / (timeSpan / 1000)
}

export function getTierDistribution(clientIds: string[]): Record<string, number> {
  const distribution: any = {}
  for (const id of clientIds) {
    const tier = getClientTier(id)
    distribution[tier] = (distribution[tier] || 0) + 1
  }
  return distribution
}

export function exportMetricsCsv(): string {
  let csv = 'timestamp,activeClients,totalRequests\n'
  for (const m of metricsHistory) {
    csv += `${m.timestamp},${m.activeClients},${m.totalRequests}\n`
  }
  return csv
}

export function clearMetrics() {
  metricsHistory.length = 0
}
