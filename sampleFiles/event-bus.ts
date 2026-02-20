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

// Typed event map for compile-time safety
type EventMap = Record<string, unknown>

class TypedEventBus<E extends EventMap> {
  private bus = new EventBus()

  on<K extends keyof E & string>(event: K, handler: EventHandler<E[K]>): Subscription {
    return this.bus.on(event, handler as EventHandler)
  }

  once<K extends keyof E & string>(event: K, handler: EventHandler<E[K]>): Subscription {
    return this.bus.once(event, handler as EventHandler)
  }

  async emit<K extends keyof E & string>(event: K, payload: E[K]): Promise<void> {
    return this.bus.emit(event, payload)
  }

  removeAllListeners<K extends keyof E & string>(event?: K): void {
    this.bus.removeAllListeners(event)
  }
}

// Debounced event emission — collapses rapid-fire events into one
function debounceHandler<T>(handler: EventHandler<T>, delayMs: number): EventHandler<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let latestPayload: T

  return (payload: T) => {
    latestPayload = payload
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      handler(latestPayload)
      timeout = null
    }, delayMs)
  }
}

export { EventBus, TypedEventBus, EventHandler, EventMap, Subscription, debounceHandler }
