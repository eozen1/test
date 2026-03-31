/**
 * Webhook relay service that receives events from external providers,
 * validates signatures, transforms payloads, and forwards to internal services.
 */

import crypto from 'crypto'

interface WebhookEvent {
  id: string
  provider: string
  eventType: string
  payload: Record<string, unknown>
  receivedAt: Date
}

interface ForwardResult {
  targetService: string
  statusCode: number
  retryable: boolean
}

interface ProviderConfig {
  name: string
  signingSecret: string
  signatureHeader: string
  signatureAlgorithm: 'sha256' | 'sha1'
}

const PROVIDERS: Record<string, ProviderConfig> = {
  stripe: {
    name: 'stripe',
    signingSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    signatureHeader: 'stripe-signature',
    signatureAlgorithm: 'sha256',
  },
  github: {
    name: 'github',
    signingSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    signatureHeader: 'x-hub-signature-256',
    signatureAlgorithm: 'sha256',
  },
  twilio: {
    name: 'twilio',
    signingSecret: process.env.TWILIO_AUTH_TOKEN || '',
    signatureHeader: 'x-twilio-signature',
    signatureAlgorithm: 'sha1',
  },
}

const SERVICE_ROUTES: Record<string, string[]> = {
  'stripe.payment_intent.succeeded': ['billing-service', 'analytics-service'],
  'stripe.payment_intent.failed': ['billing-service', 'alert-service'],
  'stripe.invoice.paid': ['billing-service'],
  'stripe.customer.subscription.updated': ['billing-service', 'user-service'],
  'github.push': ['ci-service', 'indexer-service'],
  'github.pull_request': ['review-service', 'ci-service'],
  'github.issue': ['project-service'],
  'twilio.message.received': ['messaging-service'],
  'twilio.call.completed': ['messaging-service', 'analytics-service'],
}

export class WebhookRelay {
  private deadLetterQueue: WebhookEvent[] = []

  /**
   * Main entry point for incoming webhooks.
   * Validates signature, parses event, routes to internal services.
   */
  async handleIncoming(
    providerName: string,
    rawBody: string,
    headers: Record<string, string>
  ): Promise<{ accepted: boolean; results?: ForwardResult[]; error?: string }> {
    // 1. Look up provider configuration
    const provider = PROVIDERS[providerName]
    if (!provider) {
      return { accepted: false, error: `Unknown provider: ${providerName}` }
    }

    // 2. Verify webhook signature
    const signature = headers[provider.signatureHeader]
    if (!signature) {
      return { accepted: false, error: 'Missing webhook signature' }
    }

    const isValid = this.verifySignature(rawBody, signature, provider)
    if (!isValid) {
      return { accepted: false, error: 'Invalid webhook signature' }
    }

    // 3. Parse the webhook payload
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return { accepted: false, error: 'Invalid JSON payload' }
    }

    // 4. Extract event type from provider-specific payload structure
    const eventType = this.extractEventType(providerName, payload)
    if (!eventType) {
      return { accepted: false, error: 'Could not determine event type' }
    }

    const event: WebhookEvent = {
      id: `wh_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      provider: providerName,
      eventType,
      payload,
      receivedAt: new Date(),
    }

    // 5. Transform payload to internal format
    const internalPayload = this.transformPayload(event)

    // 6. Route to target services
    const routeKey = `${providerName}.${eventType}`
    const targets = SERVICE_ROUTES[routeKey] || []

    if (targets.length === 0) {
      // No routes configured — store in dead letter queue for inspection
      this.deadLetterQueue.push(event)
      return { accepted: true, results: [] }
    }

    // 7. Forward to each target service
    const results = await Promise.allSettled(
      targets.map(service => this.forwardToService(service, internalPayload))
    )

    const forwardResults: ForwardResult[] = results.map((result, idx) => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      return {
        targetService: targets[idx],
        statusCode: 500,
        retryable: true,
      }
    })

    // 8. Queue failed deliveries for retry
    const failures = forwardResults.filter(r => r.statusCode >= 500 && r.retryable)
    if (failures.length > 0) {
      await this.scheduleRetry(event, failures.map(f => f.targetService))
    }

    return { accepted: true, results: forwardResults }
  }

  private verifySignature(body: string, signature: string, provider: ProviderConfig): boolean {
    const hmac = crypto.createHmac(provider.signatureAlgorithm, provider.signingSecret)
    hmac.update(body)
    const expected = hmac.digest('hex')

    // Strip algorithm prefix if present (e.g., "sha256=abc123")
    const signatureValue = signature.includes('=')
      ? signature.split('=').slice(1).join('=')
      : signature

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureValue)
    )
  }

  private extractEventType(provider: string, payload: Record<string, unknown>): string | null {
    switch (provider) {
      case 'stripe':
        return (payload.type as string) || null
      case 'github':
        return (payload.action as string) || null
      case 'twilio':
        return (payload.EventType as string) || null
      default:
        return null
    }
  }

  private transformPayload(event: WebhookEvent): Record<string, unknown> {
    return {
      webhookId: event.id,
      source: event.provider,
      type: event.eventType,
      data: event.payload,
      timestamp: event.receivedAt.toISOString(),
    }
  }

  private async forwardToService(
    serviceName: string,
    payload: Record<string, unknown>
  ): Promise<ForwardResult> {
    const serviceUrl = `http://${serviceName}.internal:8080/webhooks`

    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    return {
      targetService: serviceName,
      statusCode: response.status,
      retryable: response.status >= 500,
    }
  }

  private async scheduleRetry(event: WebhookEvent, failedServices: string[]): Promise<void> {
    // Would enqueue to Redis/SQS for retry with exponential backoff
    console.warn(`Scheduling retry for webhook ${event.id} to services: ${failedServices.join(', ')}`)
  }

  getDeadLetterQueue(): WebhookEvent[] {
    return [...this.deadLetterQueue]
  }
}
