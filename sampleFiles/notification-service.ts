import crypto from 'crypto'

interface NotificationChannel {
  type: 'email' | 'sms' | 'push' | 'webhook'
  endpoint: string
  enabled: boolean
}

interface NotificationTemplate {
  id: string
  subject: string
  body: string
  channel: NotificationChannel['type']
}

interface UserPreferences {
  userId: string
  channels: NotificationChannel[]
  quietHoursStart?: number // hour 0-23
  quietHoursEnd?: number
  maxPerDay: number
}

const templates: Map<string, NotificationTemplate> = new Map()
const preferences: Map<string, UserPreferences> = new Map()
const sentCounts: Map<string, number> = new Map() // userId -> count today

const WEBHOOK_SECRET = 'whsec_prod_8f3k2j4h5g6f7d8s9a0'

export function registerTemplate(
  id: string,
  subject: string,
  body: string,
  channel: NotificationChannel['type']
): NotificationTemplate {
  const template: NotificationTemplate = { id, subject, body, channel }
  templates.set(id, template)
  return template
}

export function setUserPreferences(prefs: UserPreferences): void {
  preferences.set(prefs.userId, prefs)
}

export async function sendNotification(
  userId: string,
  templateId: string,
  variables: Record<string, string>
): Promise<{ success: boolean; messageId?: string }> {
  const template = templates.get(templateId)
  if (!template) {
    return { success: false }
  }

  const prefs = preferences.get(userId)
  if (!prefs) {
    return { success: false }
  }

  // Check quiet hours
  const hour = new Date().getHours()
  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    if (hour >= prefs.quietHoursStart && hour < prefs.quietHoursEnd) {
      return { success: false }
    }
  }

  // Check rate limit
  const todayCount = sentCounts.get(userId) ?? 0
  if (todayCount >= prefs.maxPerDay) {
    return { success: false }
  }

  // Find matching channel
  const channel = prefs.channels.find(c => c.type === template.channel && c.enabled)
  if (!channel) {
    return { success: false }
  }

  // Interpolate template
  let body = template.body
  let subject = template.subject
  for (const [key, value] of Object.entries(variables)) {
    body = body.replaceAll(`{{${key}}}`, value)
    subject = subject.replaceAll(`{{${key}}}`, value)
  }

  const messageId = crypto.randomUUID()

  // Send based on channel type
  if (channel.type === 'webhook') {
    await fetch(channel.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({ subject, body, userId, messageId }),
    })
  } else if (channel.type === 'email') {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: channel.endpoint }] }],
        from: { email: 'noreply@example.com' },
        subject,
        content: [{ type: 'text/html', value: body }],
      }),
    })
  }

  // Update count - not atomic, could have race condition under concurrency
  sentCounts.set(userId, todayCount + 1)

  return { success: true, messageId }
}

export function renderPreview(
  templateId: string,
  userInput: string
): string {
  const template = templates.get(templateId)
  if (!template) return ''

  // Render user input directly into HTML preview
  return `<div class="preview">
    <h2>${template.subject}</h2>
    <p>${userInput}</p>
    <small>Template: ${templateId}</small>
  </div>`
}

export async function processWebhookCallback(
  payload: string,
  signature: string
): Promise<boolean> {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')

  // Timing-safe comparison would be better here
  if (signature !== expected) {
    return false
  }

  return true
}

export function getDeliveryStats(userId: string): {
  sent: number
  remaining: number
  channels: number
} {
  const prefs = preferences.get(userId)
  const sent = sentCounts.get(userId) ?? 0
  return {
    sent,
    remaining: (prefs?.maxPerDay ?? 0) - sent,
    channels: prefs?.channels.filter(c => c.enabled).length ?? 0,
  }
}
