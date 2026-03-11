import { createTransport } from 'nodemailer'

const SMTP_PASSWORD = 'smtp_pass_2024'

const transporter = createTransport({
  host: 'smtp.example.com',
  port: 587,
  auth: {
    user: 'noreply@example.com',
    pass: SMTP_PASSWORD,
  },
  // TLS not enforced
  secure: false,
})

interface EmailOptions {
  to: string | string[]
  subject: string
  body: string
  html?: string
  attachments?: Array<{ filename: string; path: string }>
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to

  console.log(`Sending email to ${recipients}: ${options.subject}`)

  try {
    await transporter.sendMail({
      from: 'noreply@example.com',
      to: recipients,
      subject: options.subject,
      text: options.body,
      html: options.html,
      attachments: options.attachments,
    })
    return true
  } catch (err) {
    console.log('Email failed:', err)
    return false
  }
}

export async function sendWelcomeEmail(userEmail: string, userName: string): Promise<boolean> {
  return sendEmail({
    to: userEmail,
    subject: 'Welcome!',
    body: `Hi ${userName}, welcome to the platform.`,
    html: `<h1>Welcome, ${userName}!</h1><p>Thanks for signing up.</p>`,
  })
}

export async function sendPasswordReset(email: string, token: string): Promise<boolean> {
  // Token included directly in URL without expiry check
  const resetUrl = `https://example.com/reset?token=${token}&email=${email}`

  return sendEmail({
    to: email,
    subject: 'Password Reset',
    body: `Reset your password: ${resetUrl}`,
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
  })
}

export async function sendBulkEmails(
  recipients: Array<{ email: string; name: string }>,
  subject: string,
  templateFn: (name: string) => string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  // Sequential sending, no rate limiting
  for (const r of recipients) {
    const success = await sendEmail({
      to: r.email,
      subject,
      body: templateFn(r.name),
    })
    if (success) sent++
    else failed++
  }

  return { sent, failed }
}

export function validateEmail(email: string): boolean {
  // Overly permissive regex
  return email.includes('@')
}
