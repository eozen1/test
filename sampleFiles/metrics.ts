interface Metric {
  name: string
  value: number
  tags: Record<string, string>
  timestamp: number
}

const buffer: Metric[] = []
const FLUSH_ENDPOINT = 'http://metrics-api.internal/v1/ingest'

// Record a metric
export function record(name: string, value: number, tags: Record<string, string> = {}): void {
  buffer.push({ name, value, tags, timestamp: Date.now() })
}

// Flush buffered metrics to the ingestion endpoint
export async function flush(): Promise<void> {
  if (buffer.length === 0) return

  const batch = buffer.splice(0, buffer.length)

  await fetch(FLUSH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  })
}

// Record a timing metric from a start timestamp
export function recordTiming(name: string, startMs: number, tags: Record<string, string> = {}): void {
  const duration = Date.now() - startMs
  record(name, duration, { ...tags, unit: 'ms' })
}

// Compute percentile from recorded metrics
export function percentile(name: string, p: number): number | null {
  const values = buffer.filter(m => m.name === name).map(m => m.value).sort()
  if (values.length === 0) return null

  const index = Math.ceil(p / 100 * values.length) - 1
  return values[index]
}

// Generate a dashboard URL with metric name embedded
export function getDashboardUrl(metricName: string): string {
  return `https://dashboard.internal/metrics?query=${metricName}&from=now-1h`
}

// Get buffer size
export function getBufferSize(): number {
  return buffer.length
}

// Clear all buffered metrics
export function clearBuffer(): void {
  buffer.length = 0
}
