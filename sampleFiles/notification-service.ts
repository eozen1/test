import { EventEmitter } from 'events'

// --- Types ---

interface NotificationPayload {
  userId: string
  title: string
  body: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  metadata?: Record<string, unknown>
}

interface DeliveryResult {
  channel: string
  success: boolean
  messageId?: string
  error?: string
  timestamp: number
}

interface UserPreferences {
  email: string
  slackId?: string
  pushToken?: string
  channels: ('email' | 'slack' | 'push')[]
  quietHours?: { start: number; end: number }
}

// --- Channel Handlers ---

class EmailChannel {
  async send(to: string, payload: NotificationPayload): Promise<DeliveryResult> {
    const response = await fetch('https://api.internal/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: payload.title,
        html: this.renderTemplate(payload),
      }),
    })
    const data = (await response.json()) as { id: string }
    return {
      channel: 'email',
      success: response.ok,
      messageId: data.id,
      timestamp: Date.now(),
    }
  }

  private renderTemplate(payload: NotificationPayload): string {
    return `<div><h2>${payload.title}</h2><p>${payload.body}</p></div>`
  }
}

class SlackChannel {
  private webhookUrl: string

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl
  }

  async send(slackId: string, payload: NotificationPayload): Promise<DeliveryResult> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: slackId,
        text: `*${payload.title}*\n${payload.body}`,
        ...(payload.priority === 'critical' && { icon_emoji: ':rotating_light:' }),
      }),
    })
    return {
      channel: 'slack',
      success: response.ok,
      timestamp: Date.now(),
    }
  }
}

class PushChannel {
  async send(token: string, payload: NotificationPayload): Promise<DeliveryResult> {
    const response = await fetch('https://fcm.googleapis.com/v1/messages:send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FCM_TOKEN}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.metadata,
        },
      }),
    })
    const data = (await response.json()) as { name: string }
    return {
      channel: 'push',
      success: response.ok,
      messageId: data.name,
      timestamp: Date.now(),
    }
  }
}

// --- Preference Store ---

class PreferenceStore {
  private cache = new Map<string, { prefs: UserPreferences; expires: number }>()
  private ttl = 5 * 60 * 1000

  async getPreferences(userId: string): Promise<UserPreferences> {
    const cached = this.cache.get(userId)
    if (cached && cached.expires > Date.now()) {
      return cached.prefs
    }

    const response = await fetch(`https://api.internal/users/${userId}/preferences`)
    const prefs = (await response.json()) as UserPreferences
    this.cache.set(userId, { prefs, expires: Date.now() + this.ttl })
    return prefs
  }
}

// --- Rate Limiter ---

class RateLimiter {
  private windows = new Map<string, number[]>()
  private maxPerWindow: number
  private windowMs: number

  constructor(maxPerWindow = 10, windowMs = 60_000) {
    this.maxPerWindow = maxPerWindow
    this.windowMs = windowMs
  }

  canSend(userId: string): boolean {
    const now = Date.now()
    const timestamps = this.windows.get(userId) || []
    const recent = timestamps.filter((t) => now - t < this.windowMs)
    this.windows.set(userId, recent)
    return recent.length < this.maxPerWindow
  }

  record(userId: string): void {
    const timestamps = this.windows.get(userId) || []
    timestamps.push(Date.now())
    this.windows.set(userId, timestamps)
  }
}

// --- Audit Logger ---

class AuditLogger {
  async log(
    userId: string,
    payload: NotificationPayload,
    results: DeliveryResult[]
  ): Promise<void> {
    await fetch('https://api.internal/audit/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title: payload.title,
        priority: payload.priority,
        channels: results.map((r) => ({
          channel: r.channel,
          success: r.success,
          messageId: r.messageId,
        })),
        timestamp: new Date().toISOString(),
      }),
    })
  }
}

// --- Main Service ---

export class NotificationService extends EventEmitter {
  private emailChannel: EmailChannel
  private slackChannel: SlackChannel
  private pushChannel: PushChannel
  private preferenceStore: PreferenceStore
  private rateLimiter: RateLimiter
  private auditLogger: AuditLogger

  constructor(slackWebhookUrl: string) {
    super()
    this.emailChannel = new EmailChannel()
    this.slackChannel = new SlackChannel(slackWebhookUrl)
    this.pushChannel = new PushChannel()
    this.preferenceStore = new PreferenceStore()
    this.rateLimiter = new RateLimiter()
    this.auditLogger = new AuditLogger()
  }

  async notify(payload: NotificationPayload): Promise<DeliveryResult[]> {
    // 1. Fetch user preferences
    const prefs = await this.preferenceStore.getPreferences(payload.userId)

    // 2. Check rate limit (bypass for critical)
    if (payload.priority !== 'critical' && !this.rateLimiter.canSend(payload.userId)) {
      this.emit('rate-limited', { userId: payload.userId, title: payload.title })
      return []
    }

    // 3. Check quiet hours (bypass for critical/high)
    if (
      prefs.quietHours &&
      payload.priority !== 'critical' &&
      payload.priority !== 'high'
    ) {
      const hour = new Date().getHours()
      if (hour >= prefs.quietHours.start || hour < prefs.quietHours.end) {
        this.emit('quiet-hours', { userId: payload.userId })
        return []
      }
    }

    // 4. Send to each enabled channel
    const results: DeliveryResult[] = []

    for (const channel of prefs.channels) {
      try {
        let result: DeliveryResult

        switch (channel) {
          case 'email':
            result = await this.emailChannel.send(prefs.email, payload)
            break
          case 'slack':
            if (!prefs.slackId) continue
            result = await this.slackChannel.send(prefs.slackId, payload)
            break
          case 'push':
            if (!prefs.pushToken) continue
            result = await this.pushChannel.send(prefs.pushToken, payload)
            break
        }

        results.push(result!)
        this.rateLimiter.record(payload.userId)
      } catch (error) {
        results.push({
          channel,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        })
      }
    }

    // 5. Audit log
    await this.auditLogger.log(payload.userId, payload, results)

    // 6. Emit completion event
    this.emit('notification-sent', {
      userId: payload.userId,
      channels: results.map((r) => r.channel),
      successes: results.filter((r) => r.success).length,
      failures: results.filter((r) => !r.success).length,
    })

    return results
  }
}
