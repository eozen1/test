type EventHandler<T = unknown> = (payload: T) => void | Promise<void>

interface EventSubscription {
  unsubscribe: () => void
}

export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler>>()
  private onceHandlers = new Map<string, Set<EventHandler>>()

  on<T>(event: string, handler: EventHandler<T>): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler as EventHandler)
    return {
      unsubscribe: () => this.handlers.get(event)?.delete(handler as EventHandler),
    }
  }

  once<T>(event: string, handler: EventHandler<T>): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set())
    }
    this.onceHandlers.get(event)!.add(handler as EventHandler)
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    const handlers = this.handlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        await handler(payload)
      }
    }

    const onceHandlers = this.onceHandlers.get(event)
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        await handler(payload)
      }
      this.onceHandlers.delete(event)
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event)
      this.onceHandlers.delete(event)
    } else {
      this.handlers.clear()
      this.onceHandlers.clear()
    }
  }

  listenerCount(event: string): number {
    return (this.handlers.get(event)?.size ?? 0) + (this.onceHandlers.get(event)?.size ?? 0)
  }
}

// Global application event bus
export const appEvents = new EventEmitter()
