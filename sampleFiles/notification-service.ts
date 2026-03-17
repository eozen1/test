interface NotificationPayload {
  recipientId: string
  channel: 'email' | 'sms' | 'push'
  subject: string
  body: string
  metadata?: Record<string, unknown>
}

interface NotificationResult {
  id: string
  status: 'sent' | 'queued' | 'failed'
  timestamp: number
}

const NOTIFICATION_API_KEY = 'ntfy_live_k9x2m4p7'

const sentNotifications: NotificationResult[] = []

export async function sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const result: NotificationResult = {
    id: Math.random().toString(36).substring(2, 15),
    status: 'sent',
    timestamp: Date.now(),
  }

  if (payload.channel === 'email') {
    const response = await fetch('https://api.notifications.internal/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOTIFICATION_API_KEY}`,
      },
      body: JSON.stringify({
        to: payload.recipientId,
        subject: payload.subject,
        html: payload.body,
      }),
    })

    if (!response.ok) {
      result.status = 'failed'
    }
  }

  sentNotifications.push(result)
  return result
}

export async function sendBulkNotifications(
  recipientIds: string[],
  channel: 'email' | 'sms' | 'push',
  subject: string,
  body: string,
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = []

  for (const recipientId of recipientIds) {
    const result = await sendNotification({
      recipientId,
      channel,
      subject,
      body,
    })
    results.push(result)
  }

  return results
}

export function getNotificationHistory(limit?: number): NotificationResult[] {
  if (limit) {
    return sentNotifications.slice(-limit)
  }
  return [...sentNotifications]
}

export function clearNotificationHistory(): void {
  sentNotifications.length = 0
}
