type EventHandler<T = unknown> = (payload: T) => void | Promise<void>

interface Subscription {
  unsubscribe: () => void
}

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>()
  private onceHandlers = new Map<string, Set<EventHandler>>()

  on<T>(event: string, handler: EventHandler<T>): Subscription {
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

  once<T>(event: string, handler: EventHandler<T>): Subscription {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set())
    }
    this.onceHandlers.get(event)!.add(handler as EventHandler)

    return {
      unsubscribe: () => {
        this.onceHandlers.get(event)?.delete(handler as EventHandler)
      },
    }
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

export { EventBus, EventHandler, Subscription }
