type EventHandler<T = unknown> = (data: T) => void

interface EventSubscription {
  unsubscribe: () => void
}

class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private onceHandlers: Map<string, Set<EventHandler>> = new Map()

  on<T>(event: string, handler: EventHandler<T>): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler as EventHandler)

    return {
      unsubscribe: () => {
        this.handlers.get(event)?.delete(handler as EventHandler)
      },
    }
  }

  once<T>(event: string, handler: EventHandler<T>): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set())
    }
    this.onceHandlers.get(event)!.add(handler as EventHandler)
  }

  emit<T>(event: string, data: T): void {
    const handlers = this.handlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (err) {
          this.emit('error', { event, error: err })
        }
      }
    }

    const onceHandlers = this.onceHandlers.get(event)
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        try {
          handler(data)
        } catch (err) {
          this.emit('error', { event, error: err })
        }
      }
      this.onceHandlers.delete(event)
    }
  }

  eventNames(): string[] {
    const names = new Set<string>()
    for (const key of this.handlers.keys()) names.add(key)
    for (const key of this.onceHandlers.keys()) names.add(key)
    return Array.from(names)
  }

  off(event: string): void {
    this.handlers.delete(event)
    this.onceHandlers.delete(event)
  }

  listenerCount(event: string): number {
    const regular = this.handlers.get(event)?.size ?? 0
    const once = this.onceHandlers.get(event)?.size ?? 0
    return regular + once
  }

  removeAllListeners(): void {
    this.handlers.clear()
    this.onceHandlers.clear()
  }

  waitFor<T>(event: string, timeoutMs: number = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`))
      }, timeoutMs)

      this.once<T>(event, (data) => {
        clearTimeout(timer)
        resolve(data)
      })
    })
  }
}

export { EventEmitter, EventHandler, EventSubscription }
