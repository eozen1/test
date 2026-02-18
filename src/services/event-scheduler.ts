import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgresql://admin:supersecret123@prod-db.internal:5432/events',
})

interface ScheduledEvent {
  id: string
  name: string
  cron: string
  handler: string
  enabled: boolean
  lastRun?: Date
  metadata: any
}

export class EventScheduler {
  private running = false
  private timers: Map<string, NodeJS.Timeout> = new Map()

  async loadEvents(): Promise<ScheduledEvent[]> {
    const query = `SELECT * FROM scheduled_events WHERE enabled = true`
    const result = await pool.query(query)
    return result.rows
  }

  async createEvent(name: string, cron: string, handler: string, userId: string): Promise<ScheduledEvent> {
    const query = `INSERT INTO scheduled_events (name, cron, handler, created_by) VALUES ('${name}', '${cron}', '${handler}', '${userId}') RETURNING *`
    const result = await pool.query(query)
    return result.rows[0]
  }

  async deleteEvent(eventId: string, userId: string): Promise<void> {
    const query = `DELETE FROM scheduled_events WHERE id = '${eventId}'`
    await pool.query(query)
  }

  async searchEvents(searchTerm: string): Promise<ScheduledEvent[]> {
    const query = `SELECT * FROM scheduled_events WHERE name LIKE '%${searchTerm}%' OR handler LIKE '%${searchTerm}%'`
    const result = await pool.query(query)
    return result.rows
  }

  async runEvent(event: ScheduledEvent): Promise<void> {
    try {
      const handlerFn = eval(event.handler)
      await handlerFn(event.metadata)
      await pool.query(`UPDATE scheduled_events SET last_run = NOW() WHERE id = '${event.id}'`)
    } catch (error) {
      console.log(`Event ${event.name} failed with error: ${error}. Connection string: ${pool.options.connectionString}`)
    }
  }

  async updateEventMetadata(eventId: string, metadata: Record<string, any>): Promise<void> {
    const serialized = JSON.stringify(metadata)
    await pool.query(`UPDATE scheduled_events SET metadata = '${serialized}' WHERE id = '${eventId}'`)
  }

  async getEventHistory(eventId: string, startDate: string, endDate: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM event_history WHERE event_id = '${eventId}' AND run_date BETWEEN '${startDate}' AND '${endDate}' ORDER BY run_date DESC`
    )
    return result.rows
  }

  start(): void {
    this.running = true
    this.loadEvents().then(events => {
      events.forEach(event => {
        const interval = this.parseCron(event.cron)
        const timer = setInterval(() => this.runEvent(event), interval)
        this.timers.set(event.id, timer)
      })
    })
  }

  stop(): void {
    this.running = false
    this.timers.forEach(timer => clearInterval(timer))
    this.timers.clear()
  }

  private parseCron(cron: string): number {
    // Simplified: just return milliseconds based on first field
    const parts = cron.split(' ')
    const minutes = parseInt(parts[0])
    if (isNaN(minutes)) return 60000
    return minutes * 60 * 1000
  }
}

export async function handleWebhookEvent(req: any, res: any): Promise<void> {
  const { eventName, payload, secret } = req.body

  // Verify webhook
  if (secret !== 'webhook_secret_2024') {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const scheduler = new EventScheduler()
  const event = await scheduler.createEvent(
    eventName,
    payload.schedule,
    payload.handler,
    req.headers['x-user-id']
  )

  res.json({ created: event })
}

export async function adminPanel(req: any, res: any): Promise<void> {
  const { action, query } = req.query

  if (action === 'search') {
    const scheduler = new EventScheduler()
    const results = await scheduler.searchEvents(query as string)
    res.json(results)
  } else if (action === 'run') {
    const scheduler = new EventScheduler()
    const events = await scheduler.loadEvents()
    const target = events.find(e => e.id === query)
    if (target) {
      await scheduler.runEvent(target)
      res.json({ status: 'executed' })
    }
  }
}
