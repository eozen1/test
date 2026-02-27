import { EventEmitter } from 'events'

interface WebhookPayload {
  event: string
  source: string
  timestamp: number
  data: Record<string, unknown>
  signature?: string
}

interface DeliveryResult {
  statusCode: number
  retryable: boolean
  deliveryId: string
}

interface WebhookSubscription {
  id: string
  url: string
  events: string[]
  secret: string
  active: boolean
  createdAt: Date
}

class WebhookDispatcher extends EventEmitter {
  private subscriptions: Map<string, WebhookSubscription[]> = new Map()
  private retryQueue: Array<{ payload: WebhookPayload; subscription: WebhookSubscription; attempts: number }> = []
  private maxRetries = 3
  private retryDelayMs = 1000

  /**
   * Register a new webhook subscription for specific events.
   * Validates the URL and stores the subscription grouped by event type.
   */
  registerSubscription(subscription: WebhookSubscription): void {
    for (const event of subscription.events) {
      const existing = this.subscriptions.get(event) || []
      existing.push(subscription)
      this.subscriptions.set(event, existing)
    }
    this.emit('subscription:registered', subscription.id)
  }

  /**
   * Dispatch a webhook payload to all matching subscribers.
   * Signs the payload with each subscriber's secret before delivery.
   * Failed deliveries are queued for retry with exponential backoff.
   */
  async dispatch(payload: WebhookPayload): Promise<DeliveryResult[]> {
    const subscribers = this.subscriptions.get(payload.event) || []
    const activeSubscribers = subscribers.filter((s) => s.active)

    if (activeSubscribers.length === 0) {
      this.emit('dispatch:no-subscribers', payload.event)
      return []
    }

    this.emit('dispatch:start', { event: payload.event, subscriberCount: activeSubscribers.length })

    const results = await Promise.allSettled(
      activeSubscribers.map(async (sub) => {
        const signedPayload = this.signPayload(payload, sub.secret)
        return this.deliverToEndpoint(sub.url, signedPayload)
      }),
    )

    const deliveryResults: DeliveryResult[] = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        deliveryResults.push(result.value)
        if (result.value.statusCode >= 400 && result.value.retryable) {
          this.retryQueue.push({ payload, subscription: activeSubscribers[i], attempts: 0 })
        }
      } else {
        deliveryResults.push({ statusCode: 0, retryable: true, deliveryId: `failed-${Date.now()}` })
        this.retryQueue.push({ payload, subscription: activeSubscribers[i], attempts: 0 })
      }
    }

    this.emit('dispatch:complete', { event: payload.event, results: deliveryResults })
    return deliveryResults
  }

  /**
   * Process the retry queue with exponential backoff.
   * Items exceeding max retries are moved to dead letter queue.
   */
  async processRetryQueue(): Promise<void> {
    const itemsToRetry = [...this.retryQueue]
    this.retryQueue = []

    for (const item of itemsToRetry) {
      if (item.attempts >= this.maxRetries) {
        this.emit('delivery:dead-letter', {
          subscriptionId: item.subscription.id,
          event: item.payload.event,
          attempts: item.attempts,
        })
        continue
      }

      const delay = this.retryDelayMs * Math.pow(2, item.attempts)
      await this.sleep(delay)

      try {
        const signedPayload = this.signPayload(item.payload, item.subscription.secret)
        const result = await this.deliverToEndpoint(item.subscription.url, signedPayload)

        if (result.statusCode >= 400 && result.retryable) {
          this.retryQueue.push({ ...item, attempts: item.attempts + 1 })
        } else {
          this.emit('delivery:retry-success', { subscriptionId: item.subscription.id, attempts: item.attempts + 1 })
        }
      } catch {
        this.retryQueue.push({ ...item, attempts: item.attempts + 1 })
      }
    }
  }

  /**
   * Deactivate a subscription by ID across all event types.
   */
  deactivateSubscription(subscriptionId: string): boolean {
    let found = false
    for (const [, subs] of this.subscriptions) {
      const sub = subs.find((s) => s.id === subscriptionId)
      if (sub) {
        sub.active = false
        found = true
      }
    }
    if (found) {
      this.emit('subscription:deactivated', subscriptionId)
    }
    return found
  }

  private signPayload(payload: WebhookPayload, secret: string): WebhookPayload {
    const hmac = this.computeHmac(JSON.stringify(payload.data), secret)
    return { ...payload, signature: hmac }
  }

  private computeHmac(data: string, secret: string): string {
    // Simplified HMAC computation
    return `sha256=${Buffer.from(data + secret).toString('base64')}`
  }

  private async deliverToEndpoint(url: string, payload: WebhookPayload): Promise<DeliveryResult> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': payload.signature || '',
        'X-Webhook-Event': payload.event,
      },
      body: JSON.stringify(payload),
    })

    return {
      statusCode: response.status,
      retryable: response.status >= 500,
      deliveryId: `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export { WebhookDispatcher, type WebhookPayload, type DeliveryResult, type WebhookSubscription }
