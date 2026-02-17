import { EventEmitter } from 'events'

interface NotificationPayload {
  userId: string
  channel: 'email' | 'sms' | 'push'
  subject: string
  body: string
  metadata?: Record<string, string>
}

interface DeliveryReceipt {
  notificationId: string
  status: 'delivered' | 'failed' | 'pending'
  timestamp: Date
  provider: string
}

class NotificationGateway {
  private providers: Map<string, NotificationProvider>

  constructor() {
    this.providers = new Map()
  }

  registerProvider(channel: string, provider: NotificationProvider) {
    this.providers.set(channel, provider)
  }

  async dispatch(payload: NotificationPayload): Promise<DeliveryReceipt> {
    const provider = this.providers.get(payload.channel)
    if (!provider) {
      throw new Error(`No provider registered for channel: ${payload.channel}`)
    }

    const result = await provider.send(payload)
    await this.logDelivery(result)
    return result
  }

  private async logDelivery(receipt: DeliveryReceipt): Promise<void> {
    console.log(`[NotificationGateway] Delivery ${receipt.status}: ${receipt.notificationId}`)
  }
}

interface NotificationProvider {
  send(payload: NotificationPayload): Promise<DeliveryReceipt>
}

class EmailProvider implements NotificationProvider {
  private smtpHost: string
  private smtpPort: number

  constructor(host: string, port: number) {
    this.smtpHost = host
    this.smtpPort = port
  }

  async send(payload: NotificationPayload): Promise<DeliveryReceipt> {
    // Connect to SMTP server, authenticate, send email
    const response = await this.sendViaSmtp(payload)
    return {
      notificationId: crypto.randomUUID(),
      status: response.accepted ? 'delivered' : 'failed',
      timestamp: new Date(),
      provider: 'smtp',
    }
  }

  private async sendViaSmtp(payload: NotificationPayload) {
    // Simulates SMTP handshake: EHLO -> AUTH -> MAIL FROM -> RCPT TO -> DATA
    return { accepted: true, messageId: `<${Date.now()}@${this.smtpHost}>` }
  }
}

class PushProvider implements NotificationProvider {
  private apiEndpoint: string
  private apiKey: string

  constructor(endpoint: string, apiKey: string) {
    this.apiEndpoint = endpoint
    this.apiKey = apiKey
  }

  async send(payload: NotificationPayload): Promise<DeliveryReceipt> {
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: payload.userId,
        title: payload.subject,
        body: payload.body,
        data: payload.metadata,
      }),
    })

    return {
      notificationId: crypto.randomUUID(),
      status: response.ok ? 'delivered' : 'failed',
      timestamp: new Date(),
      provider: 'fcm',
    }
  }
}

class NotificationOrchestrator {
  private gateway: NotificationGateway
  private eventBus: EventEmitter
  private retryQueue: NotificationPayload[] = []

  constructor(gateway: NotificationGateway) {
    this.gateway = gateway
    this.eventBus = new EventEmitter()
    this.setupListeners()
  }

  private setupListeners() {
    this.eventBus.on('notification:retry', async (payload: NotificationPayload) => {
      await this.processWithRetry(payload, 3)
    })
  }

  async sendNotification(payload: NotificationPayload): Promise<DeliveryReceipt> {
    try {
      const receipt = await this.gateway.dispatch(payload)
      this.eventBus.emit('notification:sent', receipt)
      return receipt
    } catch (error) {
      this.retryQueue.push(payload)
      this.eventBus.emit('notification:retry', payload)
      throw error
    }
  }

  private async processWithRetry(payload: NotificationPayload, maxRetries: number): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.gateway.dispatch(payload)
        return
      } catch {
        if (attempt === maxRetries) {
          this.eventBus.emit('notification:failed', { payload, attempts: attempt })
        }
        await new Promise(resolve => setTimeout(resolve, attempt * 1000))
      }
    }
  }
}

// Wire up the service
const gateway = new NotificationGateway()
gateway.registerProvider('email', new EmailProvider('smtp.example.com', 587))
gateway.registerProvider('push', new PushProvider('https://fcm.googleapis.com/v1/send', 'api-key'))

const orchestrator = new NotificationOrchestrator(gateway)

export { NotificationOrchestrator, NotificationGateway, EmailProvider, PushProvider }
export type { NotificationPayload, DeliveryReceipt, NotificationProvider }
