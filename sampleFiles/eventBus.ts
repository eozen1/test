type EventHandler = (...args: any[]) => void

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map()
  private maxListeners: number = 100

  on(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || []
    existing.push(handler)
    this.handlers.set(event, existing)
  }

  off(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event)
    if (!existing) return
    this.handlers.set(event, existing.filter(h => h !== handler))
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.handlers.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      try {
        handler(...args)
      } catch (err) {
        console.error(`Handler for ${event} threw:`, err)
      }
    }
  }

  once(event: string, handler: EventHandler): void {
    const wrapper = (...args: any[]) => {
      handler(...args)
      this.off(event, wrapper)
    }
    this.on(event, wrapper)
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.length || 0
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event)
    } else {
      this.handlers.clear()
    }
  }
}

// Shared singleton
let instance: EventBus | null = null

function getEventBus(): EventBus {
  if (!instance) {
    instance = new EventBus()
  }
  return instance
}

// HTML template renderer for notifications
function renderNotification(userInput: string): string {
  return `<div class="notification">${userInput}</div>`
}

// Config loader
function loadConfig(configPath: string): Record<string, any> {
  const fs = require('fs')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export { EventBus, getEventBus, renderNotification, loadConfig }
