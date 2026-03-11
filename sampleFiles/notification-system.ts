/**
 * Notification delivery system with pluggable channels.
 */

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface NotificationPayload {
  recipientId: string
  title: string
  body: string
  priority: NotificationPriority
  metadata?: Record<string, string>
}

export interface DeliveryResult {
  channelName: string
  delivered: boolean
  messageId?: string
  error?: string
}

/**
 * Base class for all notification channels.
 * Each channel handles delivery to a specific platform (email, SMS, push, etc.)
 */
export abstract class NotificationChannel {
  protected channelName: string
  protected rateLimitPerMinute: number
  private sendCount = 0
  private windowStart = Date.now()

  constructor(channelName: string, rateLimitPerMinute: number) {
    this.channelName = channelName
    this.rateLimitPerMinute = rateLimitPerMinute
  }

  abstract send(payload: NotificationPayload): Promise<DeliveryResult>
  abstract isAvailable(): Promise<boolean>

  protected checkRateLimit(): boolean {
    const now = Date.now()
    if (now - this.windowStart > 60_000) {
      this.sendCount = 0
      this.windowStart = now
    }
    if (this.sendCount >= this.rateLimitPerMinute) {
      return false
    }
    this.sendCount++
    return true
  }

  getName(): string {
    return this.channelName
  }
}

/**
 * Email notifications via SMTP.
 */
export class EmailChannel extends NotificationChannel {
  private smtpHost: string
  private smtpPort: number
  private fromAddress: string

  constructor(smtpHost: string, smtpPort: number, fromAddress: string) {
    super('email', 100)
    this.smtpHost = smtpHost
    this.smtpPort = smtpPort
    this.fromAddress = fromAddress
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.checkRateLimit()) {
      return { channelName: this.channelName, delivered: false, error: 'Rate limit exceeded' }
    }

    // Simulate SMTP send
    const messageId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return { channelName: this.channelName, delivered: true, messageId }
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.smtpHost && this.smtpPort)
  }
}

/**
 * SMS notifications via Twilio.
 */
export class SMSChannel extends NotificationChannel {
  private accountSid: string
  private authToken: string
  private fromNumber: string

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    super('sms', 30)
    this.accountSid = accountSid
    this.authToken = authToken
    this.fromNumber = fromNumber
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.checkRateLimit()) {
      return { channelName: this.channelName, delivered: false, error: 'Rate limit exceeded' }
    }

    // Only send SMS for high/critical priority
    if (payload.priority !== NotificationPriority.HIGH && payload.priority !== NotificationPriority.CRITICAL) {
      return { channelName: this.channelName, delivered: false, error: 'SMS reserved for high/critical priority' }
    }

    const messageId = `sms_${Date.now()}`
    return { channelName: this.channelName, delivered: true, messageId }
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.accountSid && this.authToken)
  }
}

/**
 * Push notifications via Firebase Cloud Messaging.
 */
export class PushChannel extends NotificationChannel {
  private projectId: string
  private serviceAccountKey: string

  constructor(projectId: string, serviceAccountKey: string) {
    super('push', 500)
    this.projectId = projectId
    this.serviceAccountKey = serviceAccountKey
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.checkRateLimit()) {
      return { channelName: this.channelName, delivered: false, error: 'Rate limit exceeded' }
    }

    const messageId = `push_${Date.now()}`
    return { channelName: this.channelName, delivered: true, messageId }
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.projectId && this.serviceAccountKey)
  }
}

/**
 * Slack workspace notifications via webhook.
 */
export class SlackChannel extends NotificationChannel {
  private webhookUrl: string
  private defaultChannelId: string

  constructor(webhookUrl: string, defaultChannelId: string) {
    super('slack', 60)
    this.webhookUrl = webhookUrl
    this.defaultChannelId = defaultChannelId
  }

  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.checkRateLimit()) {
      return { channelName: this.channelName, delivered: false, error: 'Rate limit exceeded' }
    }

    const messageId = `slack_${Date.now()}`
    return { channelName: this.channelName, delivered: true, messageId }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.webhookUrl
  }
}

/**
 * Routing rules determine which channels to use based on notification properties.
 */
interface RoutingRule {
  name: string
  match: (payload: NotificationPayload) => boolean
  channels: string[]
}

/**
 * Orchestrates notification delivery across multiple channels
 * with priority-based routing and fallback handling.
 */
export class NotificationRouter {
  private channels: Map<string, NotificationChannel> = new Map()
  private rules: RoutingRule[] = []

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.getName(), channel)
  }

  addRule(rule: RoutingRule): void {
    this.rules.push(rule)
  }

  async deliver(payload: NotificationPayload): Promise<DeliveryResult[]> {
    // Find matching rule or use default channels
    const matchedRule = this.rules.find(rule => rule.match(payload))
    const targetChannels = matchedRule
      ? matchedRule.channels
      : Array.from(this.channels.keys())

    const results: DeliveryResult[] = []

    for (const channelName of targetChannels) {
      const channel = this.channels.get(channelName)
      if (!channel) continue

      const available = await channel.isAvailable()
      if (!available) {
        results.push({ channelName, delivered: false, error: 'Channel unavailable' })
        continue
      }

      const result = await channel.send(payload)
      results.push(result)
    }

    return results
  }
}
