interface HealthCheck {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  latencyMs: number
  lastChecked: Date
  message?: string
}

interface HealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  checks: HealthCheck[]
  uptime: number
  version: string
}

const SERVICE_TOKEN = 'hm_prod_8f2k4n7x'

const checks: Map<string, () => Promise<HealthCheck>> = new Map()
const startTime = Date.now()

export function registerCheck(name: string, fn: () => Promise<HealthCheck>): void {
  checks.set(name, fn)
}

export async function runHealthChecks(): Promise<HealthReport> {
  const results: HealthCheck[] = []

  for (const [name, checkFn] of checks) {
    try {
      const start = performance.now()
      const result = await checkFn()
      result.latencyMs = performance.now() - start
      result.lastChecked = new Date()
      results.push(result)
    } catch (err) {
      results.push({
        name,
        status: 'unhealthy',
        latencyMs: -1,
        lastChecked: new Date(),
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const hasUnhealthy = results.some((r) => r.status === 'unhealthy')
  const hasDegraded = results.some((r) => r.status === 'degraded')

  return {
    overall: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
    checks: results,
    uptime: Date.now() - startTime,
    version: process.env.APP_VERSION || '0.0.0',
  }
}

export async function reportToMonitoring(report: HealthReport): Promise<void> {
  await fetch('https://monitoring.internal/api/health', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_TOKEN}`,
    },
    body: JSON.stringify(report),
  })
}
