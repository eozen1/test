import { createHmac } from 'crypto'

interface WebhookEvent {
  id: string
  source: string
  type: string
  payload: Record<string, unknown>
  timestamp: Date
  signature: string
}

interface WebhookResponse {
  eventId: string
  status: 'accepted' | 'rejected' | 'error'
  handlerResults: HandlerResult[]
}

interface HandlerResult {
  handler: string
  success: boolean
  duration: number
  error?: string
}

interface WebhookHandler {
  name: string
  canHandle(event: WebhookEvent): boolean
  handle(event: WebhookEvent): Promise<HandlerResult>
}

class SignatureVerifier {
  private secrets: Map<string, string>

  constructor() {
    this.secrets = new Map()
  }

  registerSecret(source: string, secret: string) {
    this.secrets.set(source, secret)
  }

  verify(event: WebhookEvent): boolean {
    const secret = this.secrets.get(event.source)
    if (!secret) return false

    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(event.payload))
      .digest('hex')

    return event.signature === `sha256=${expected}`
  }
}

class EventDeduplicator {
  private seen: Map<string, Date> = new Map()
  private ttl: number

  constructor(ttlMs: number = 300_000) {
    this.ttl = ttlMs
  }

  isDuplicate(eventId: string): boolean {
    this.cleanup()
    if (this.seen.has(eventId)) return true
    this.seen.set(eventId, new Date())
    return false
  }

  private cleanup() {
    const now = Date.now()
    for (const [id, timestamp] of this.seen) {
      if (now - timestamp.getTime() > this.ttl) {
        this.seen.delete(id)
      }
    }
  }
}

class WebhookDispatcher {
  private verifier: SignatureVerifier
  private deduplicator: EventDeduplicator
  private handlers: WebhookHandler[] = []
  private deadLetterQueue: WebhookEvent[] = []

  constructor(verifier: SignatureVerifier, deduplicator: EventDeduplicator) {
    this.verifier = verifier
    this.deduplicator = deduplicator
  }

  registerHandler(handler: WebhookHandler) {
    this.handlers.push(handler)
  }

  async dispatch(event: WebhookEvent): Promise<WebhookResponse> {
    // Step 1: Verify signature with the source system
    if (!this.verifier.verify(event)) {
      return { eventId: event.id, status: 'rejected', handlerResults: [] }
    }

    // Step 2: Check for duplicate delivery
    if (this.deduplicator.isDuplicate(event.id)) {
      return { eventId: event.id, status: 'accepted', handlerResults: [] }
    }

    // Step 3: Route to matching handlers
    const matchingHandlers = this.handlers.filter(h => h.canHandle(event))
    if (matchingHandlers.length === 0) {
      this.deadLetterQueue.push(event)
      return { eventId: event.id, status: 'error', handlerResults: [] }
    }

    // Step 4: Execute handlers and collect results
    const results: HandlerResult[] = []
    for (const handler of matchingHandlers) {
      const start = performance.now()
      try {
        const result = await handler.handle(event)
        results.push(result)
      } catch (error) {
        results.push({
          handler: handler.name,
          success: false,
          duration: performance.now() - start,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Step 5: Return aggregated response
    const allSucceeded = results.every(r => r.success)
    return {
      eventId: event.id,
      status: allSucceeded ? 'accepted' : 'error',
      handlerResults: results,
    }
  }

  getDeadLetterQueue(): WebhookEvent[] {
    return [...this.deadLetterQueue]
  }

  drainDeadLetterQueue(): WebhookEvent[] {
    const events = [...this.deadLetterQueue]
    this.deadLetterQueue = []
    return events
  }
}

// Handler implementations
class GitPushHandler implements WebhookHandler {
  name = 'git-push'

  canHandle(event: WebhookEvent): boolean {
    return event.source === 'github' && event.type === 'push'
  }

  async handle(event: WebhookEvent): Promise<HandlerResult> {
    const start = performance.now()
    // Trigger CI pipeline via internal API
    const response = await fetch('http://ci-service.internal/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: event.payload.repository,
        ref: event.payload.ref,
        commits: event.payload.commits,
      }),
    })

    return {
      handler: this.name,
      success: response.ok,
      duration: performance.now() - start,
    }
  }
}

class PRReviewHandler implements WebhookHandler {
  name = 'pr-review'

  canHandle(event: WebhookEvent): boolean {
    return event.source === 'github' && event.type === 'pull_request'
  }

  async handle(event: WebhookEvent): Promise<HandlerResult> {
    const start = performance.now()
    // Notify review service to start analysis
    const response = await fetch('http://review-service.internal/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prNumber: event.payload.number,
        repo: event.payload.repository,
        action: event.payload.action,
      }),
    })

    return {
      handler: this.name,
      success: response.ok,
      duration: performance.now() - start,
    }
  }
}

class SlackNotifier implements WebhookHandler {
  name = 'slack-notifier'
  private webhookUrl: string

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl
  }

  canHandle(event: WebhookEvent): boolean {
    return event.type === 'deployment' || event.type === 'incident'
  }

  async handle(event: WebhookEvent): Promise<HandlerResult> {
    const start = performance.now()
    const message = this.formatMessage(event)
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    })

    return {
      handler: this.name,
      success: response.ok,
      duration: performance.now() - start,
    }
  }

  private formatMessage(event: WebhookEvent): string {
    if (event.type === 'deployment') {
      return `:rocket: Deployment to ${event.payload.environment}: ${event.payload.status}`
    }
    return `:rotating_light: Incident: ${event.payload.title} (severity: ${event.payload.severity})`
  }
}

// Bootstrap
const verifier = new SignatureVerifier()
verifier.registerSecret('github', process.env.GITHUB_WEBHOOK_SECRET || '')
verifier.registerSecret('stripe', process.env.STRIPE_WEBHOOK_SECRET || '')

const deduplicator = new EventDeduplicator(5 * 60 * 1000)
const dispatcher = new WebhookDispatcher(verifier, deduplicator)

dispatcher.registerHandler(new GitPushHandler())
dispatcher.registerHandler(new PRReviewHandler())
dispatcher.registerHandler(new SlackNotifier(process.env.SLACK_WEBHOOK_URL || ''))

export { WebhookDispatcher, SignatureVerifier, EventDeduplicator }
export type { WebhookEvent, WebhookResponse, WebhookHandler }
