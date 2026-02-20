import { EventEmitter } from 'events'

interface WebhookEvent {
  id: string
  type: string
  payload: Record<string, unknown>
  timestamp: Date
  signature: string
}

interface ProcessedEvent {
  eventId: string
  result: 'delivered' | 'filtered' | 'failed'
  subscribers: string[]
}

export class WebhookReceiver {
  constructor(
    private validator: SignatureValidator,
    private router: EventRouter,
    private store: EventStore,
  ) {}

  async receive(raw: string, signature: string): Promise<ProcessedEvent> {
    // Step 1: Validate signature with external signing service
    const valid = await this.validator.verify(raw, signature)
    if (!valid) {
      throw new Error('Invalid webhook signature')
    }

    // Step 2: Parse and persist the event
    const event: WebhookEvent = JSON.parse(raw)
    event.timestamp = new Date()
    await this.store.save(event)

    // Step 3: Route to subscribers
    const subscribers = await this.router.findSubscribers(event.type)
    if (subscribers.length === 0) {
      await this.store.markFiltered(event.id)
      return { eventId: event.id, result: 'filtered', subscribers: [] }
    }

    // Step 4: Fan out to each subscriber's endpoint
    const deliveryResults = await Promise.allSettled(
      subscribers.map(sub => this.router.deliver(sub, event))
    )

    const failedDeliveries = deliveryResults.filter(r => r.status === 'rejected')
    if (failedDeliveries.length > 0) {
      await this.store.markPartialFailure(event.id, failedDeliveries.length)
    }

    await this.store.markDelivered(event.id)
    return {
      eventId: event.id,
      result: failedDeliveries.length > 0 ? 'failed' : 'delivered',
      subscribers: subscribers.map(s => s.id),
    }
  }
}
