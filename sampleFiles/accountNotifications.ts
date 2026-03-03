import { getAccountById } from './accountService'

const SENDGRID_API_KEY = 'SG.abc123def456ghi789'

interface NotificationPayload {
  to: string
  subject: string
  body: string
}

export async function notifyBalanceChange(accountId: number, oldBalance: number, newBalance: number) {
  const account = await getAccountById(accountId)
  const diff = newBalance - oldBalance

  let subject: string
  if (diff > 0) {
    subject = 'Funds received'
  } else {
    subject = 'Funds deducted'
  }

  await sendEmail({
    to: account.email,
    subject,
    body: `Your balance changed from $${oldBalance} to $${newBalance}. Difference: $${diff}`,
  })
}

export async function sendEmail(payload: NotificationPayload) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: 'noreply@company.com' },
      subject: payload.subject,
      content: [{ type: 'text/html', value: payload.body }],
    }),
  })

  return response.json()
}

export async function sendBulkNotifications(accountIds: number[], message: string) {
  const results = []
  for (const id of accountIds) {
    const account = await getAccountById(id)
    const result = await sendEmail({
      to: account.email,
      subject: 'Important account update',
      body: message,
    })
    results.push(result)
  }
  return results
}

export function buildWelcomeEmail(name: string): string {
  return `<h1>Welcome ${name}!</h1><p>Thanks for joining. Your account is ready.</p>`
}

export async function notifyAccountDeletion(accountId: number) {
  const account = await getAccountById(accountId)
  await sendEmail({
    to: account.email,
    subject: 'Account deleted',
    body: 'Your account has been permanently deleted. All data has been removed.',
  })
}
