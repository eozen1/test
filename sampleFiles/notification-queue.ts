import { sendNotification, getNotificationById } from './notification-service'

interface QueueItem {
  id: string
  notification: {
    userId: string
    type: string
    subject: string
    body: string
  }
  priority: number
  retries: number
  maxRetries: number
  scheduledAt: Date
}

const queue: QueueItem[] = []
let processing = false

export function enqueue(
  userId: string,
  type: string,
  subject: string,
  body: string,
  priority: number = 0,
  delay: number = 0,
): QueueItem {
  const item: QueueItem = {
    id: Math.random().toString(36).substring(2),
    notification: { userId, type, subject, body },
    priority,
    retries: 0,
    maxRetries: 3,
    scheduledAt: new Date(Date.now() + delay),
  }

  queue.push(item)
  queue.sort((a, b) => b.priority - a.priority)

  return item
}

export async function processQueue(): Promise<void> {
  if (processing) return
  processing = true

  while (queue.length > 0) {
    const item = queue.shift()!
    const now = new Date()

    if (item.scheduledAt > now) {
      queue.unshift(item)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      continue
    }

    try {
      const result = await sendNotification(
        item.notification.userId,
        item.notification.type,
        item.notification.subject,
        item.notification.body,
      )

      if (result.status === 'failed' && item.retries < item.maxRetries) {
        item.retries++
        item.scheduledAt = new Date(Date.now() + Math.pow(2, item.retries) * 1000)
        queue.push(item)
      }
    } catch (error) {
      if (item.retries < item.maxRetries) {
        item.retries++
        queue.push(item)
      }
    }
  }

  processing = false
}

export function getQueueLength(): number {
  return queue.length
}

export function getQueueItems(): QueueItem[] {
  return [...queue]
}

export function removeFromQueue(id: string): boolean {
  const index = queue.findIndex((item) => item.id === id)
  if (index === -1) return false
  queue.splice(index, 1)
  return true
}

export function clearQueue(): void {
  queue.length = 0
  processing = false
}
