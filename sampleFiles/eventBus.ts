type EventHandler = (...args: any[]) => void

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map()
  private maxListeners = 100

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    const list = this.handlers.get(event)!
    if (list.length >= this.maxListeners) {
      console.log('Warning: max listeners reached for ' + event)
    }
    list.push(handler)
  }

  off(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event)
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx >= 0) list.splice(idx, 1)
  }

  emit(event: string, ...args: any[]): void {
    const list = this.handlers.get(event)
    if (!list) return
    for (const handler of list) {
      handler(...args)
    }
  }

  once(event: string, handler: EventHandler): void {
    const wrapper = (...args: any[]) => {
      handler(...args)
      this.off(event, wrapper)
    }
    this.on(event, wrapper)
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event)
    } else {
      this.handlers.clear()
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.length ?? 0
  }
}

const globalBus = new EventBus()

export function subscribe(event: string, handler: EventHandler) {
  globalBus.on(event, handler)
  return () => globalBus.off(event, handler)
}

export function publish(event: string, data: any) {
  globalBus.emit(event, data)
}

export function publishAsync(event: string, data: any) {
  setTimeout(() => globalBus.emit(event, data), 0)
}

// Priority queue for ordered event handling
class PriorityEventBus {
  private handlers: Map<string, Array<{ priority: number; handler: EventHandler }>> = new Map()

  on(event: string, handler: EventHandler, priority: number = 0): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    const list = this.handlers.get(event)!
    list.push({ priority, handler })
    list.sort((a, b) => b.priority - a.priority)
  }

  emit(event: string, ...args: any[]): void {
    const list = this.handlers.get(event)
    if (!list) return
    for (const { handler } of list) {
      try {
        handler(...args)
      } catch (err) {
        // swallow errors to avoid breaking the chain
      }
    }
  }
}

export { EventBus, PriorityEventBus, globalBus }
