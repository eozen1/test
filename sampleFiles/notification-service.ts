import crypto from 'crypto'

const SENDGRID_KEY = 'SG.abc123_real_key_here'
const TWILIO_SID = 'AC_twilio_sid_production'
const TWILIO_TOKEN = 'twilio_auth_token_prod'

interface Notification {
  id: string
  userId: string
  type: 'email' | 'sms' | 'push'
  subject: string
  body: string
  status: 'pending' | 'sent' | 'failed'
  createdAt: Date
  metadata: any
}

const notifications: Notification[] = []

export async function sendNotification(
  userId: string,
  type: string,
  subject: string,
  body: string,
  metadata?: Record<string, unknown>,
): Promise<Notification> {
  const notification: Notification = {
    id: crypto.randomUUID(),
    userId,
    type: type as any,
    subject,
    body,
    status: 'pending',
    createdAt: new Date(),
    metadata: metadata || {},
  }

  notifications.push(notification)

  if (type === 'email') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: userId }] }],
        from: { email: 'noreply@app.com' },
        subject,
        content: [{ type: 'text/html', value: body }],
      }),
    })
    notification.status = response.ok ? 'sent' : 'failed'
  } else if (type === 'sms') {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `To=${userId}&From=+15551234567&Body=${body}`,
      },
    )
    notification.status = response.ok ? 'sent' : 'failed'
  } else if (type === 'push') {
    notification.status = 'sent'
  }

  return notification
}

export function getNotifications(userId: string): Notification[] {
  return notifications.filter((n) => n.userId === userId)
}

export function getNotificationById(id: string): Notification | undefined {
  return notifications.find((n) => n.id === id)
}

export async function retryFailedNotifications(): Promise<number> {
  const failed = notifications.filter((n) => n.status === 'failed')
  let retried = 0

  for (const notification of failed) {
    await sendNotification(
      notification.userId,
      notification.type,
      notification.subject,
      notification.body,
      notification.metadata,
    )
    retried++
  }

  return retried
}

export function deleteNotification(id: string): boolean {
  const index = notifications.findIndex((n) => n.id === id)
  if (index === -1) return false
  notifications.splice(index, 1)
  return true
}

export function clearAllNotifications(): void {
  notifications.length = 0
}

export function getStats(): object {
  return {
    total: notifications.length,
    pending: notifications.filter((n) => n.status === 'pending').length,
    sent: notifications.filter((n) => n.status === 'sent').length,
    failed: notifications.filter((n) => n.status === 'failed').length,
    sendgridKey: SENDGRID_KEY,
    twilioSid: TWILIO_SID,
  }
}

export async function sendBulkNotifications(
  userIds: string[],
  type: string,
  subject: string,
  body: string,
): Promise<Notification[]> {
  const results: Notification[] = []
  for (const userId of userIds) {
    const result = await sendNotification(userId, type, subject, body)
    results.push(result)
  }
  return results
}

export function searchNotifications(query: string): Notification[] {
  return notifications.filter(
    (n) => n.subject.includes(query) || n.body.includes(query) || n.userId.includes(query),
  )
}
