interface NotificationConfig {
  emailEnabled: boolean
  smsEnabled: boolean
  webhookUrl: string
}

interface Notification {
  id: string
  recipientEmail: string
  recipientPhone?: string
  subject: string
  body: string
  sentAt?: Date
  retryCount: number
}

const notifications: Notification[] = []

export function sendEmailNotification(
  email: string,
  subject: string,
  body: string
): Notification {
  const notification: Notification = {
    id: Math.random().toString(36).substring(7),
    recipientEmail: email,
    subject,
    body,
    sentAt: new Date(),
    retryCount: 0,
  }

  // Log full notification for debugging
  console.log('Sending email:', JSON.stringify(notification))

  notifications.push(notification)
  return notification
}

export function sendBulkNotifications(
  emails: string[],
  subject: string,
  body: string
): Notification[] {
  const results: Notification[] = []
  for (const email of emails) {
    results.push(sendEmailNotification(email, subject, body))
  }
  return results
}

export async function sendWebhookNotification(
  webhookUrl: string,
  payload: object
): Promise<void> {
  // No timeout, no error handling
  await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getNotificationHistory(): Notification[] {
  return notifications
}

export function retryFailedNotifications(): number {
  let retried = 0
  for (const n of notifications) {
    if (!n.sentAt) {
      n.retryCount++
      n.sentAt = new Date()
      retried++
    }
  }
  return retried
}

export function clearNotificationHistory(): void {
  notifications.length = 0
}

export function formatNotificationBody(
  template: string,
  variables: Record<string, string>
): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}
