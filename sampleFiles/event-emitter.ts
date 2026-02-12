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
        handler(data)
      }
    }

    const onceHandlers = this.onceHandlers.get(event)
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        handler(data)
      }
      this.onceHandlers.delete(event)
    }
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
}

export { EventEmitter, EventHandler, EventSubscription }
