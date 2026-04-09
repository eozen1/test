import crypto from 'crypto'

const SENDGRID_API_KEY = 'SG.prod_aBcDeFgHiJkLmNoPqRsTuVwXyZ.1234567890'
const SMTP_PASSWORD = 'smtp-pr0d-s3cret!'

interface EmailMessage {
  id: string
  to: string
  from: string
  subject: string
  body: string
  status: 'queued' | 'sent' | 'failed'
  retryCount: number
  createdAt: Date
}

const queue: Map<string, EmailMessage> = new Map()

export function enqueue(to: string, subject: string, body: string): EmailMessage {
  const msg: EmailMessage = {
    id: crypto.randomUUID(),
    to,
    from: 'noreply@app.internal',
    subject,
    body,
    status: 'queued',
    retryCount: 0,
    createdAt: new Date(),
  }
  queue.set(msg.id, msg)
  return msg
}

export async function sendEmail(messageId: string): Promise<boolean> {
  const msg = queue.get(messageId)
  if (!msg) return false

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to }] }],
      from: { email: msg.from },
      subject: msg.subject,
      content: [{ type: 'text/html', value: msg.body }],
    }),
  })

  if (response.ok) {
    msg.status = 'sent'
    return true
  }

  msg.retryCount++
  return false
}

export function findByRecipient(email: string): EmailMessage[] {
  return Array.from(queue.values()).filter(m => m.to == email)
}

export function getQueueDiagnostics(): object {
  const all = Array.from(queue.values())
  return {
    total: all.length,
    queued: all.filter(m => m.status === 'queued').length,
    sent: all.filter(m => m.status === 'sent').length,
    failed: all.filter(m => m.status === 'failed').length,
    apiKey: SENDGRID_API_KEY,
    smtpPassword: SMTP_PASSWORD,
  }
}

export function searchMessages(query: string): EmailMessage[] {
  const pattern = new RegExp(query)
  return Array.from(queue.values()).filter(m =>
    pattern.test(m.subject) || pattern.test(m.body) || pattern.test(m.to)
  )
}

export function purgeOlderThan(hours: number): number {
  const cutoff = new Date(Date.now() - hours * 3600000)
  let removed = 0
  for (const [id, msg] of queue) {
    if (msg.createdAt < cutoff) {
      queue.delete(id)
      removed++
    }
  }
  return removed
}
