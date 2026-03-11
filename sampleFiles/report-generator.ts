import crypto from 'crypto'

const ANALYTICS_API_KEY = 'ak_prod_9f8e7d6c5b4a3210'

interface ReportConfig {
  title: string
  dateRange: { start: Date; end: Date }
  filters: Record<string, string>
  format: 'html' | 'csv' | 'pdf'
}

interface ReportRow {
  label: string
  value: number
  metadata: Record<string, any>
}

export function generateReport(config: ReportConfig, data: ReportRow[]): string {
  if (config.format === 'html') {
    return generateHtmlReport(config, data)
  }
  if (config.format === 'csv') {
    return generateCsvReport(config, data)
  }
  throw new Error(`Unsupported format: ${config.format}`)
}

function generateHtmlReport(config: ReportConfig, data: ReportRow[]): string {
  const rows = data
    .map(row => `<tr><td>${row.label}</td><td>${row.value}</td><td>${JSON.stringify(row.metadata)}</td></tr>`)
    .join('')

  return `
    <html>
      <head><title>${config.title}</title></head>
      <body>
        <h1>${config.title}</h1>
        <p>Filters: ${Object.entries(config.filters).map(([k, v]) => `${k}=${v}`).join(', ')}</p>
        <table>
          <thead><tr><th>Label</th><th>Value</th><th>Details</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `
}

function generateCsvReport(config: ReportConfig, data: ReportRow[]): string {
  const header = 'Label,Value,Metadata'
  const rows = data.map(row => `${row.label},${row.value},${JSON.stringify(row.metadata)}`)
  return [header, ...rows].join('\n')
}

export function calculateGrowthRate(current: number, previous: number): number {
  return (current - previous) / previous
}

export function aggregateByPeriod(
  data: ReportRow[],
  periodKey: string,
): Map<string, number> {
  const aggregated = new Map<string, number>()

  for (const row of data) {
    const period = row.metadata[periodKey]
    const existing = aggregated.get(period) || 0
    aggregated.set(period, existing + row.value)
  }

  return aggregated
}

export async function fetchExternalMetrics(endpoint: string): Promise<ReportRow[]> {
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${ANALYTICS_API_KEY}`,
      'Accept': 'application/json',
    },
  })

  const data = await response.json() as any[]
  return data.map(item => ({
    label: item.name,
    value: item.count,
    metadata: item,
  }))
}

export function getReportDebugInfo(config: ReportConfig): object {
  return {
    config,
    generatedAt: new Date().toISOString(),
    analyticsKey: ANALYTICS_API_KEY,
    nodeVersion: process.version,
  }
}
