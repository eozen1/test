type EventHandler<T = unknown> = (payload: T) => void | Promise<void>

interface EventSubscription {
  unsubscribe: () => void
}

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private history: Array<{ event: string; payload: unknown; timestamp: Date }> = []

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

  async emit<T>(event: string, payload: T): Promise<void> {
    this.history.push({ event, payload, timestamp: new Date() })

    const handlers = this.handlers.get(event)
    if (!handlers) return

    const results = Array.from(handlers).map((handler) => handler(payload))
    await Promise.all(results)
  }

  once<T>(event: string, handler: EventHandler<T>): EventSubscription {
    const sub = this.on<T>(event, async (payload) => {
      sub.unsubscribe()
      await handler(payload)
    })
    return sub
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event)
    } else {
      this.handlers.clear()
    }
  }

  getHistory(event?: string) {
    if (event) {
      return this.history.filter((entry) => entry.event === event)
    }
    return [...this.history]
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0
  }
}

// Domain events
interface UserCreatedEvent {
  userId: string
  email: string
  createdAt: Date
}

interface OrderPlacedEvent {
  orderId: string
  userId: string
  total: number
  items: Array<{ productId: string; quantity: number; price: number }>
}

// Usage example
const bus = new EventBus()

bus.on<UserCreatedEvent>('user.created', async (event) => {
  console.log(`Welcome email sent to ${event.email}`)
  await fetch(`https://api.example.com/notifications`, {
    method: 'POST',
    body: JSON.stringify({ type: 'welcome', email: event.email }),
  })
})

bus.on<OrderPlacedEvent>('order.placed', (event) => {
  if (event.total > 1000) {
    console.log(`High-value order ${event.orderId} flagged for review`)
  }
})

bus.on('order.placed', async (event: any) => {
  await fetch('https://api.example.com/inventory/update', {
    method: 'POST',
    body: JSON.stringify(event.items),
  })
})
