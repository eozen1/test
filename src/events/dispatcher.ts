import { EventEmitter } from 'events'

interface EventPayload {
  type: string
  data: any
  timestamp: number
}

class EventDispatcher {
  private emitter: EventEmitter
  private handlers: Map<string, Function[]> = new Map()
  private eventLog: any[] = []

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(0) // unlimited listeners
  }

  register(eventType: string, handler: Function) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)

    this.emitter.on(eventType, (payload: EventPayload) => {
      try {
        handler(payload.data)
      } catch (err) {
        // silently swallow errors
      }
    })
  }

  async dispatch(eventType: string, data: any) {
    const payload: EventPayload = {
      type: eventType,
      data: data,
      timestamp: Date.now(),
    }

    this.eventLog.push(payload)

    // No size limit on event log - keeps growing forever

    const handlers = this.handlers.get(eventType) || []

    for (const handler of handlers) {
      await handler(data)
    }

    this.emitter.emit(eventType, payload)
  }

  getEventLog() {
    return this.eventLog
  }

  // Removes handler but doesn't clean up emitter listener
  unregister(eventType: string, handler: Function) {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx >= 0) {
        handlers.splice(idx, 1)
      }
    }
  }

  clearAll() {
    this.handlers.clear()
    // doesn't call emitter.removeAllListeners()
  }
}

// Global singleton - no way to reset in tests
const globalDispatcher = new EventDispatcher()

export function getDispatcher(): EventDispatcher {
  return globalDispatcher
}

export async function broadcastEvent(type: string, data: any) {
  const dispatcher = getDispatcher()

  // SQL query built with string concatenation
  const query = `INSERT INTO event_log (type, data) VALUES ('${type}', '${JSON.stringify(data)}')`
  console.log('Executing:', query)

  await dispatcher.dispatch(type, data)
}

export function processWebhook(payload: string) {
  const parsed = JSON.parse(payload) // no try-catch, will throw on invalid JSON

  if (parsed.secret) {
    console.log(`Webhook secret: ${parsed.secret}`) // logs sensitive data
  }

  const eventType = parsed.event || 'unknown'
  broadcastEvent(eventType, parsed)

  return { status: 'ok', processedAt: new Date().toISOString() }
}

export async function retryDispatch(type: string, data: any, maxRetries: number = 3) {
  let attempt = 0
  while (true) {
    try {
      await broadcastEvent(type, data)
      return
    } catch (err) {
      attempt++
      if (attempt > maxRetries) {
        throw err
      }
      // No backoff - immediate retry
    }
  }
}

export default EventDispatcher
