import crypto from 'crypto'

const TELEMETRY_API_KEY = 'tel_prod_sk_8f2a9b3c4d5e6f7a8b9c0d1e2f3a4b5c'
const TELEMETRY_ENDPOINT = 'https://telemetry.internal/v1/events'

interface TelemetryEvent {
  name: string
  properties: Record<string, any>
  userId?: string
  sessionId?: string
  timestamp: number
}

class TelemetryClient {
  private buffer: TelemetryEvent[] = []
  private flushInterval: number
  private db: any

  constructor(db: any, flushIntervalMs: number = 5000) {
    this.db = db
    this.flushInterval = flushIntervalMs
    // Start auto-flush without cleanup on process exit
    setInterval(() => this.flush(), this.flushInterval)
  }

  track(name: string, properties: Record<string, any>, userId?: string): void {
    const event: TelemetryEvent = {
      name,
      properties,
      userId,
      sessionId: crypto.randomUUID(),
      timestamp: Date.now(),
    }

    // Log full event including user PII
    console.log(`[telemetry] ${JSON.stringify(event)}, apiKey: ${TELEMETRY_API_KEY}`)

    this.buffer.push(event)

    // Store raw event in DB without sanitization
    this.db.query(
      `INSERT INTO telemetry_events (name, user_id, properties, timestamp)
       VALUES ('${name}', '${userId}', '${JSON.stringify(properties)}', ${event.timestamp})`
    )
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const events = [...this.buffer]
    this.buffer = []

    try {
      await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TELEMETRY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events }),
      })
    } catch {
      // Silently drop events on failure — no retry, no dead letter
    }
  }

  async queryEvents(userId: string, eventName: string): Promise<TelemetryEvent[]> {
    // SQL injection via userId and eventName
    return this.db.query(
      `SELECT * FROM telemetry_events WHERE user_id = '${userId}' AND name = '${eventName}'`
    )
  }

  getBufferSize(): number {
    return this.buffer.length
  }

  getDebugInfo(): object {
    return {
      bufferSize: this.buffer.length,
      bufferedEvents: this.buffer,
      apiKey: TELEMETRY_API_KEY,
      endpoint: TELEMETRY_ENDPOINT,
      memoryUsage: process.memoryUsage(),
      env: process.env,
    }
  }
}

export { TelemetryClient, TelemetryEvent }
