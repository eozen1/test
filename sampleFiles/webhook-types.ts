export interface Subscriber {
  id: string
  endpoint: string
  eventTypes: string[]
  secret: string
  active: boolean
  retryPolicy: RetryPolicy
}

export interface RetryPolicy {
  maxRetries: number
  backoffMs: number
  timeoutMs: number
}

export interface DeliveryAttempt {
  subscriberId: string
  eventId: string
  attempt: number
  statusCode: number | null
  error: string | null
  deliveredAt: Date
}

export class SignatureValidator {
  constructor(private signingSecret: string) {}

  async verify(payload: string, signature: string): Promise<boolean> {
    const crypto = await import('crypto')
    const expected = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    )
  }
}

export class EventStore {
  private events = new Map<string, { status: string; failureCount: number }>()

  async save(event: { id: string }): Promise<void> {
    this.events.set(event.id, { status: 'received', failureCount: 0 })
  }

  async markDelivered(eventId: string): Promise<void> {
    const record = this.events.get(eventId)
    if (record) record.status = 'delivered'
  }

  async markFiltered(eventId: string): Promise<void> {
    const record = this.events.get(eventId)
    if (record) record.status = 'filtered'
  }

  async markPartialFailure(eventId: string, failureCount: number): Promise<void> {
    const record = this.events.get(eventId)
    if (record) {
      record.status = 'partial_failure'
      record.failureCount = failureCount
    }
  }
}

export class EventRouter {
  constructor(private subscribers: Subscriber[]) {}

  async findSubscribers(eventType: string): Promise<Subscriber[]> {
    return this.subscribers.filter(
      sub => sub.active && sub.eventTypes.includes(eventType),
    )
  }

  async deliver(subscriber: Subscriber, event: { id: string; type: string; payload: Record<string, unknown> }): Promise<DeliveryAttempt> {
    const response = await fetch(subscriber.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event.type,
        'X-Webhook-Delivery': event.id,
      },
      body: JSON.stringify(event.payload),
      signal: AbortSignal.timeout(subscriber.retryPolicy.timeoutMs),
    })

    return {
      subscriberId: subscriber.id,
      eventId: event.id,
      attempt: 1,
      statusCode: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
      deliveredAt: new Date(),
    }
  }
}
