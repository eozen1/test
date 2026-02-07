import { NotificationService } from './notification-service'

interface QueuedNotification {
  id: string
  payload: {
    userId: string
    title: string
    body: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    metadata?: Record<string, unknown>
  }
  scheduledFor?: Date
  retryCount: number
  maxRetries: number
  createdAt: Date
}

interface RouterConfig {
  batchSize: number
  pollIntervalMs: number
  deadLetterThreshold: number
  slackWebhookUrl: string
}

export class NotificationRouter {
  private service: NotificationService
  private queue: QueuedNotification[] = []
  private deadLetter: QueuedNotification[] = []
  private config: RouterConfig
  private isProcessing = false
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(config: RouterConfig) {
    this.config = config
    this.service = new NotificationService(config.slackWebhookUrl)

    this.service.on('rate-limited', (data) => {
      console.warn(`Rate limited: user=${data.userId} title="${data.title}"`)
    })

    this.service.on('notification-sent', (data) => {
      console.log(
        `Notification delivered: user=${data.userId} ` +
          `channels=${data.channels.join(',')} ` +
          `success=${data.successes}/${data.successes + data.failures}`
      )
    })
  }

  enqueue(notification: Omit<QueuedNotification, 'retryCount' | 'createdAt'>): void {
    this.queue.push({
      ...notification,
      retryCount: 0,
      maxRetries: notification.maxRetries ?? 3,
      createdAt: new Date(),
    })
  }

  start(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.processBatch(), this.config.pollIntervalMs)
    console.log(`Router started (batch=${this.config.batchSize}, interval=${this.config.pollIntervalMs}ms)`)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return
    this.isProcessing = true

    try {
      const now = new Date()
      const ready = this.queue
        .filter((n) => !n.scheduledFor || n.scheduledFor <= now)
        .slice(0, this.config.batchSize)

      // Remove from queue
      this.queue = this.queue.filter((n) => !ready.includes(n))

      // Process each notification
      const settled = await Promise.allSettled(
        ready.map(async (notification) => {
          try {
            const results = await this.service.notify(notification.payload)
            const allFailed = results.every((r) => !r.success)

            if (allFailed && results.length > 0) {
              this.handleFailure(notification)
            }
          } catch (error) {
            this.handleFailure(notification)
          }
        })
      )

      const fulfilled = settled.filter((r) => r.status === 'fulfilled').length
      const rejected = settled.filter((r) => r.status === 'rejected').length

      if (rejected > 0) {
        console.error(`Batch complete: ${fulfilled} ok, ${rejected} failed`)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private handleFailure(notification: QueuedNotification): void {
    notification.retryCount++

    if (notification.retryCount >= this.config.deadLetterThreshold) {
      this.deadLetter.push(notification)
      console.error(
        `Moved to dead letter: id=${notification.id} retries=${notification.retryCount}`
      )
      return
    }

    // Exponential backoff: 1s, 2s, 4s, 8s...
    const delay = Math.pow(2, notification.retryCount) * 1000
    notification.scheduledFor = new Date(Date.now() + delay)
    this.queue.push(notification)
  }

  getQueueDepth(): number {
    return this.queue.length
  }

  getDeadLetterCount(): number {
    return this.deadLetter.length
  }

  drainDeadLetter(): QueuedNotification[] {
    const items = [...this.deadLetter]
    this.deadLetter = []
    return items
  }
}
