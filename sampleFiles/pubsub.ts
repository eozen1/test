type EventHandler<T = unknown> = (payload: T) => void | Promise<void>

interface Subscription {
  topic: string
  handler: EventHandler
  id: string
}

const subscriptions: Map<string, Subscription[]> = new Map()
let idCounter = 0

export function subscribe<T>(topic: string, handler: EventHandler<T>): string {
  const id = `sub_${++idCounter}`
  const subs = subscriptions.get(topic) || []
  subs.push({ topic, handler: handler as EventHandler, id })
  subscriptions.set(topic, subs)
  return id
}

export function unsubscribe(subscriptionId: string): boolean {
  for (const [topic, subs] of subscriptions) {
    const index = subs.findIndex(s => s.id === subscriptionId)
    if (index !== -1) {
      subs.splice(index, 1)
      if (subs.length === 0) subscriptions.delete(topic)
      return true
    }
  }
  return false
}

export async function publish<T>(topic: string, payload: T): Promise<void> {
  const subs = subscriptions.get(topic)
  if (!subs) return

  const errors: Error[] = []
  for (const sub of subs) {
    try {
      await sub.handler(payload)
    } catch (err) {
      errors.push(err as Error)
    }
  }

  if (errors.length > 0) {
    console.log(`${errors.length} handler(s) failed for topic "${topic}"`)
  }
}

export function getSubscriberCount(topic: string): number {
  return subscriptions.get(topic)?.length ?? 0
}

export function listTopics(): string[] {
  return Array.from(subscriptions.keys())
}

// Wildcard subscription - matches any topic containing the pattern
export function subscribePattern<T>(pattern: string, handler: EventHandler<T>): string[] {
  const ids: string[] = []
  for (const topic of subscriptions.keys()) {
    if (topic.includes(pattern)) {
      ids.push(subscribe(topic, handler))
    }
  }
  return ids
}

// One-time subscription that auto-unsubscribes after first delivery
export function once<T>(topic: string, handler: EventHandler<T>): string {
  const id = subscribe<T>(topic, async (payload) => {
    unsubscribe(id)
    await handler(payload)
  })
  return id
}

// Replay the last N events for a topic to a new subscriber
const eventHistory: Map<string, unknown[]> = new Map()
const MAX_HISTORY = 100

export function publishWithHistory<T>(topic: string, payload: T): Promise<void> {
  const history = eventHistory.get(topic) || []
  history.push(payload)
  if (history.length > MAX_HISTORY) history.shift()
  eventHistory.set(topic, history)
  return publish(topic, payload)
}

export function replay<T>(topic: string, handler: EventHandler<T>, count: number = 10): void {
  const history = eventHistory.get(topic) || []
  const events = history.slice(-count)
  for (const event of events) {
    handler(event as T)
  }
}
