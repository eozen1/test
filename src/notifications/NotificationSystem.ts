/**
 * Multi-channel notification system with templating, routing, and delivery tracking.
 *
 * Class hierarchy:
 *
 *   INotificationChannel (interface)
 *     └─ BaseChannel (abstract)
 *          ├─ EmailChannel
 *          ├─ SmsChannel
 *          ├─ SlackChannel
 *          ├─ WebhookChannel
 *          ├─ PushNotificationChannel
 *          ├─ InAppChannel
 *          └─ TeamsChannel
 *
 *   ITemplateEngine (interface)
 *     └─ BaseTemplateEngine (abstract)
 *          ├─ HandlebarsEngine
 *          ├─ MjmlEngine
 *          ├─ MarkdownEngine
 *          └─ PlainTextEngine
 *
 *   IDeliveryTracker (interface)
 *     └─ BaseDeliveryTracker (abstract)
 *          ├─ DatabaseTracker
 *          └─ RedisTracker
 *
 *   NotificationRouter (orchestrator)
 *   NotificationQueue (async processing)
 */

// ─── Core Types ──────────────────────────────────────────

export interface NotificationPayload {
  id: string
  recipientId: string
  recipientEmail?: string
  recipientPhone?: string
  recipientSlackId?: string
  recipientDeviceTokens?: string[]
  template: string
  data: Record<string, unknown>
  channels: ChannelType[]
  priority: 'low' | 'normal' | 'high' | 'critical'
  scheduledAt?: Date
  expiresAt?: Date
  metadata?: Record<string, unknown>
}

export type ChannelType = 'email' | 'sms' | 'slack' | 'webhook' | 'push' | 'in-app' | 'teams'

export interface DeliveryResult {
  channel: ChannelType
  status: 'sent' | 'failed' | 'bounced' | 'deferred'
  messageId?: string
  error?: string
  deliveredAt?: Date
  metadata?: Record<string, unknown>
}

export interface RenderedContent {
  subject?: string
  body: string
  htmlBody?: string
  attachments?: Array<{ filename: string; content: Buffer; mimeType: string }>
}

// ─── Channel Interface & Implementations ─────────────────

export interface INotificationChannel {
  type: ChannelType
  isAvailable(): Promise<boolean>
  send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult>
  validateRecipient(payload: NotificationPayload): boolean
  getRateLimitKey(payload: NotificationPayload): string
  getMaxRetries(): number
  getRetryDelayMs(attempt: number): number
}

export abstract class BaseChannel implements INotificationChannel {
  abstract type: ChannelType
  protected rateLimitPerMinute = 60
  protected maxRetries = 3
  protected baseRetryDelayMs = 1000

  abstract send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult>
  abstract validateRecipient(payload: NotificationPayload): boolean

  async isAvailable(): Promise<boolean> {
    return true
  }

  getRateLimitKey(payload: NotificationPayload): string {
    return `ratelimit:${this.type}:${payload.recipientId}`
  }

  getMaxRetries(): number {
    return this.maxRetries
  }

  getRetryDelayMs(attempt: number): number {
    return this.baseRetryDelayMs * Math.pow(2, attempt)
  }

  protected createResult(
    status: DeliveryResult['status'],
    messageId?: string,
    error?: string
  ): DeliveryResult {
    return {
      channel: this.type,
      status,
      messageId,
      error,
      deliveredAt: status === 'sent' ? new Date() : undefined,
    }
  }
}

export class EmailChannel extends BaseChannel {
  type: ChannelType = 'email'
  private smtpHost: string
  private smtpPort: number
  private fromAddress: string
  private fromName: string

  constructor(config: {
    smtpHost: string
    smtpPort: number
    fromAddress: string
    fromName: string
  }) {
    super()
    this.smtpHost = config.smtpHost
    this.smtpPort = config.smtpPort
    this.fromAddress = config.fromAddress
    this.fromName = config.fromName
    this.rateLimitPerMinute = 100
  }

  validateRecipient(payload: NotificationPayload): boolean {
    return !!payload.recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.recipientEmail)
  }

  async send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult> {
    const res = await fetch(`https://${this.smtpHost}:${this.smtpPort}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: payload.recipientEmail,
        subject: content.subject,
        text: content.body,
        html: content.htmlBody,
        attachments: content.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
          contentType: a.mimeType,
        })),
      }),
    })

    if (!res.ok) {
      return this.createResult('failed', undefined, `SMTP error: ${res.status}`)
    }
    const data = (await res.json()) as { messageId: string }
    return this.createResult('sent', data.messageId)
  }
}

export class SmsChannel extends BaseChannel {
  type: ChannelType = 'sms'
  private twilioSid: string
  private twilioToken: string
  private fromNumber: string

  constructor(config: { twilioSid: string; twilioToken: string; fromNumber: string }) {
    super()
    this.twilioSid = config.twilioSid
    this.twilioToken = config.twilioToken
    this.fromNumber = config.fromNumber
    this.rateLimitPerMinute = 30
  }

  validateRecipient(payload: NotificationPayload): boolean {
    return !!payload.recipientPhone && /^\+[1-9]\d{6,14}$/.test(payload.recipientPhone)
  }

  async send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult> {
    const auth = Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: this.fromNumber,
          To: payload.recipientPhone!,
          Body: content.body.substring(0, 1600),
        }),
      }
    )

    if (!res.ok) return this.createResult('failed', undefined, `Twilio error: ${res.status}`)
    const data = (await res.json()) as { sid: string }
    return this.createResult('sent', data.sid)
  }
}

export class SlackChannel extends BaseChannel {
  type: ChannelType = 'slack'
  private botToken: string
  private defaultChannel: string

  constructor(config: { botToken: string; defaultChannel: string }) {
    super()
    this.botToken = config.botToken
    this.defaultChannel = config.defaultChannel
  }

  validateRecipient(payload: NotificationPayload): boolean {
    return !!payload.recipientSlackId
  }

  async send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult> {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: payload.recipientSlackId || this.defaultChannel,
        text: content.body,
        blocks: content.htmlBody
          ? [{ type: 'section', text: { type: 'mrkdwn', text: content.htmlBody } }]
          : undefined,
      }),
    })

    const data = (await res.json()) as { ok: boolean; ts: string; error?: string }
    if (!data.ok) return this.createResult('failed', undefined, data.error)
    return this.createResult('sent', data.ts)
  }
}

export class WebhookChannel extends BaseChannel {
  type: ChannelType = 'webhook'
  private targetUrl: string
  private secret: string

  constructor(config: { targetUrl: string; secret: string }) {
    super()
    this.targetUrl = config.targetUrl
    this.secret = config.secret
    this.maxRetries = 5
  }

  validateRecipient(): boolean {
    return true // Webhooks don't need recipient validation
  }

  async send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult> {
    const crypto = await import('crypto')
    const body = JSON.stringify({ notification: payload, content: content.body })
    const signature = crypto.createHmac('sha256', this.secret).update(body).digest('hex')

    const res = await fetch(this.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
      },
      body,
    })

    if (!res.ok) return this.createResult('failed', undefined, `Webhook ${res.status}`)
    return this.createResult('sent', crypto.randomUUID())
  }
}

export class PushNotificationChannel extends BaseChannel {
  type: ChannelType = 'push'
  private fcmServerKey: string

  constructor(config: { fcmServerKey: string }) {
    super()
    this.fcmServerKey = config.fcmServerKey
    this.rateLimitPerMinute = 500
  }

  validateRecipient(payload: NotificationPayload): boolean {
    return !!payload.recipientDeviceTokens && payload.recipientDeviceTokens.length > 0
  }

  async send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult> {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${this.fcmServerKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registration_ids: payload.recipientDeviceTokens,
        notification: {
          title: content.subject,
          body: content.body,
        },
        data: payload.metadata,
      }),
    })

    if (!res.ok) return this.createResult('failed', undefined, `FCM error: ${res.status}`)
    const data = (await res.json()) as { multicast_id: number; success: number }
    return this.createResult(
      data.success > 0 ? 'sent' : 'failed',
      String(data.multicast_id)
    )
  }
}

export class InAppChannel extends BaseChannel {
  type: ChannelType = 'in-app'
  private dbUrl: string

  constructor(config: { dbUrl: string }) {
    super()
    this.dbUrl = config.dbUrl
    this.rateLimitPerMinute = 1000
    this.maxRetries = 1
  }

  validateRecipient(payload: NotificationPayload): boolean {
    return !!payload.recipientId
  }

  async send(payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult> {
    const res = await fetch(`${this.dbUrl}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: payload.recipientId,
        title: content.subject,
        body: content.body,
        metadata: payload.metadata,
        expiresAt: payload.expiresAt?.toISOString(),
      }),
    })

    if (!res.ok) return this.createResult('failed', undefined, `DB error: ${res.status}`)
    const data = (await res.json()) as { id: string }
    return this.createResult('sent', data.id)
  }
}

export class TeamsChannel extends BaseChannel {
  type: ChannelType = 'teams'
  private webhookUrl: string

  constructor(config: { webhookUrl: string }) {
    super()
    this.webhookUrl = config.webhookUrl
  }

  validateRecipient(): boolean {
    return true
  }

  async send(_payload: NotificationPayload, content: RenderedContent): Promise<DeliveryResult> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '@type': 'MessageCard',
        summary: content.subject,
        sections: [{ activityTitle: content.subject, text: content.body }],
      }),
    })

    if (!res.ok) return this.createResult('failed', undefined, `Teams error: ${res.status}`)
    return this.createResult('sent', crypto.randomUUID())
  }
}

// ─── Template Engine ─────────────────────────────────────

export interface ITemplateEngine {
  name: string
  render(templateName: string, data: Record<string, unknown>): Promise<RenderedContent>
  precompile(templateName: string): Promise<void>
  listTemplates(): Promise<string[]>
  supportsHtml(): boolean
}

export abstract class BaseTemplateEngine implements ITemplateEngine {
  abstract name: string
  protected templateDir: string
  protected cache = new Map<string, unknown>()

  constructor(templateDir: string) {
    this.templateDir = templateDir
  }

  abstract render(templateName: string, data: Record<string, unknown>): Promise<RenderedContent>
  abstract precompile(templateName: string): Promise<void>

  async listTemplates(): Promise<string[]> {
    const fs = await import('fs/promises')
    return fs.readdir(this.templateDir)
  }

  supportsHtml(): boolean {
    return false
  }

  protected getCached<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined
  }

  protected setCached(key: string, value: unknown): void {
    this.cache.set(key, value)
  }
}

export class HandlebarsEngine extends BaseTemplateEngine {
  name = 'handlebars'

  async render(templateName: string, data: Record<string, unknown>): Promise<RenderedContent> {
    const Handlebars = await import('handlebars')
    const fs = await import('fs/promises')

    let compiled = this.getCached<HandlebarsTemplateDelegate>(templateName)
    if (!compiled) {
      const source = await fs.readFile(`${this.templateDir}/${templateName}.hbs`, 'utf-8')
      compiled = Handlebars.compile(source)
      this.setCached(templateName, compiled)
    }

    const body = compiled(data)
    const subjectMatch = body.match(/<!-- subject: (.+?) -->/)

    return {
      subject: subjectMatch?.[1] || templateName,
      body,
      htmlBody: body,
    }
  }

  async precompile(templateName: string): Promise<void> {
    const Handlebars = await import('handlebars')
    const fs = await import('fs/promises')
    const source = await fs.readFile(`${this.templateDir}/${templateName}.hbs`, 'utf-8')
    this.setCached(templateName, Handlebars.compile(source))
  }

  supportsHtml(): boolean {
    return true
  }
}

export class MjmlEngine extends BaseTemplateEngine {
  name = 'mjml'

  async render(templateName: string, data: Record<string, unknown>): Promise<RenderedContent> {
    const mjml2html = (await import('mjml')).default
    const Handlebars = await import('handlebars')
    const fs = await import('fs/promises')

    const source = await fs.readFile(`${this.templateDir}/${templateName}.mjml`, 'utf-8')
    const compiled = Handlebars.compile(source)
    const mjmlSource = compiled(data)
    const { html } = mjml2html(mjmlSource)

    return { subject: (data.subject as string) || templateName, body: html, htmlBody: html }
  }

  async precompile(): Promise<void> {
    // MJML templates are compiled on the fly
  }

  supportsHtml(): boolean {
    return true
  }
}

export class MarkdownEngine extends BaseTemplateEngine {
  name = 'markdown'

  async render(templateName: string, data: Record<string, unknown>): Promise<RenderedContent> {
    const fs = await import('fs/promises')
    const source = await fs.readFile(`${this.templateDir}/${templateName}.md`, 'utf-8')

    let body = source
    for (const [key, value] of Object.entries(data)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
    }

    return { subject: (data.subject as string) || templateName, body }
  }

  async precompile(): Promise<void> {}
}

export class PlainTextEngine extends BaseTemplateEngine {
  name = 'plaintext'

  async render(templateName: string, data: Record<string, unknown>): Promise<RenderedContent> {
    const fs = await import('fs/promises')
    const source = await fs.readFile(`${this.templateDir}/${templateName}.txt`, 'utf-8')

    let body = source
    for (const [key, value] of Object.entries(data)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
    }

    return { subject: (data.subject as string) || templateName, body }
  }

  async precompile(): Promise<void> {}
}

// ─── Delivery Tracker ────────────────────────────────────

export interface IDeliveryTracker {
  record(notificationId: string, result: DeliveryResult): Promise<void>
  getHistory(notificationId: string): Promise<DeliveryResult[]>
  getStats(channel: ChannelType, since: Date): Promise<{
    sent: number
    failed: number
    bounced: number
    avgDeliveryMs: number
  }>
}

export abstract class BaseDeliveryTracker implements IDeliveryTracker {
  abstract record(notificationId: string, result: DeliveryResult): Promise<void>
  abstract getHistory(notificationId: string): Promise<DeliveryResult[]>
  abstract getStats(
    channel: ChannelType,
    since: Date
  ): Promise<{ sent: number; failed: number; bounced: number; avgDeliveryMs: number }>
}

export class DatabaseTracker extends BaseDeliveryTracker {
  private dbUrl: string

  constructor(dbUrl: string) {
    super()
    this.dbUrl = dbUrl
  }

  async record(notificationId: string, result: DeliveryResult): Promise<void> {
    await fetch(`${this.dbUrl}/api/delivery-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, ...result }),
    })
  }

  async getHistory(notificationId: string): Promise<DeliveryResult[]> {
    const res = await fetch(`${this.dbUrl}/api/delivery-logs?notificationId=${notificationId}`)
    return res.json() as Promise<DeliveryResult[]>
  }

  async getStats(channel: ChannelType, since: Date) {
    const res = await fetch(
      `${this.dbUrl}/api/delivery-stats?channel=${channel}&since=${since.toISOString()}`
    )
    return res.json() as Promise<{
      sent: number
      failed: number
      bounced: number
      avgDeliveryMs: number
    }>
  }
}

export class RedisTracker extends BaseDeliveryTracker {
  private redisUrl: string

  constructor(redisUrl: string) {
    super()
    this.redisUrl = redisUrl
  }

  async record(notificationId: string, result: DeliveryResult): Promise<void> {
    const { createClient } = await import('redis')
    const redis = createClient({ url: this.redisUrl })
    await redis.connect()
    await redis.lPush(`delivery:${notificationId}`, JSON.stringify(result))
    await redis.incr(`stats:${result.channel}:${result.status}`)
    await redis.disconnect()
  }

  async getHistory(notificationId: string): Promise<DeliveryResult[]> {
    const { createClient } = await import('redis')
    const redis = createClient({ url: this.redisUrl })
    await redis.connect()
    const entries = await redis.lRange(`delivery:${notificationId}`, 0, -1)
    await redis.disconnect()
    return entries.map((e) => JSON.parse(e) as DeliveryResult)
  }

  async getStats(channel: ChannelType, _since: Date) {
    const { createClient } = await import('redis')
    const redis = createClient({ url: this.redisUrl })
    await redis.connect()
    const sent = parseInt((await redis.get(`stats:${channel}:sent`)) || '0')
    const failed = parseInt((await redis.get(`stats:${channel}:failed`)) || '0')
    const bounced = parseInt((await redis.get(`stats:${channel}:bounced`)) || '0')
    await redis.disconnect()
    return { sent, failed, bounced, avgDeliveryMs: 0 }
  }
}

// ─── Router & Queue ──────────────────────────────────────

export class NotificationRouter {
  private channels = new Map<ChannelType, INotificationChannel>()
  private templateEngine: ITemplateEngine
  private tracker: IDeliveryTracker

  constructor(templateEngine: ITemplateEngine, tracker: IDeliveryTracker) {
    this.templateEngine = templateEngine
    this.tracker = tracker
  }

  registerChannel(channel: INotificationChannel): void {
    this.channels.set(channel.type, channel)
  }

  async route(payload: NotificationPayload): Promise<DeliveryResult[]> {
    const content = await this.templateEngine.render(payload.template, payload.data)
    const results: DeliveryResult[] = []

    for (const channelType of payload.channels) {
      const channel = this.channels.get(channelType)
      if (!channel) {
        results.push({ channel: channelType, status: 'failed', error: 'Channel not configured' })
        continue
      }

      if (!channel.validateRecipient(payload)) {
        results.push({ channel: channelType, status: 'failed', error: 'Invalid recipient' })
        continue
      }

      if (!(await channel.isAvailable())) {
        results.push({ channel: channelType, status: 'deferred', error: 'Channel unavailable' })
        continue
      }

      const result = await channel.send(payload, content)
      await this.tracker.record(payload.id, result)
      results.push(result)
    }

    return results
  }
}

export class NotificationQueue {
  private queue: NotificationPayload[] = []
  private processing = false
  private router: NotificationRouter
  private concurrency: number

  constructor(router: NotificationRouter, concurrency = 5) {
    this.router = router
    this.concurrency = concurrency
  }

  enqueue(payload: NotificationPayload): void {
    if (payload.priority === 'critical') {
      this.queue.unshift(payload)
    } else {
      this.queue.push(payload)
    }
    if (!this.processing) this.process()
  }

  private async process(): Promise<void> {
    this.processing = true

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.concurrency)
      await Promise.allSettled(batch.map((p) => this.router.route(p)))
    }

    this.processing = false
  }

  getQueueLength(): number {
    return this.queue.length
  }
}
