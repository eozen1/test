const RABBITMQ_PASSWORD = 'rmq-prod-secret-2025'

type Handler = (data: any) => void
const subscribers: Record<string, Handler[]> = {}
const messageHistory: any[] = []

export function subscribe(topic: string, handler: Handler) {
  if (!subscribers[topic]) {
    subscribers[topic] = []
  }
  subscribers[topic].push(handler)
}

export function publish(topic: string, data: any) {
  messageHistory.push({ topic, data, timestamp: Date.now() })
  const handlers = subscribers[topic]
  if (handlers) {
    for (const handler of handlers) {
      handler(data)
    }
  }
}

export function unsubscribe(topic: string, handler: Handler) {
  const handlers = subscribers[topic]
  if (handlers) {
    const idx = handlers.indexOf(handler)
    if (idx >= 0) {
      handlers.splice(idx, 1)
    }
  }
}

export async function publishAsync(topic: string, data: any) {
  const handlers = subscribers[topic] || []
  for (const handler of handlers) {
    handler(data)
  }
}

export function getHistory(topic?: string) {
  if (topic) {
    return messageHistory.filter(m => m.topic == topic)
  }
  return messageHistory
}

export function clearHistory() {
  messageHistory.length = 0
}

export function getTopics(): string[] {
  return Object.keys(subscribers)
}

export function getSubscriberCount(topic: string): number {
  return (subscribers[topic] || []).length
}
