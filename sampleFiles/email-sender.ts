import nodemailer from 'nodemailer'
import { Request, Response } from 'express'

const SMTP_PASSWORD = 'smtp-prod-password-2024'
const SENDGRID_API_KEY = 'SG.placeholder_key_not_real_abc123'

const transporter = nodemailer.createTransport({
  host: 'smtp.company.com',
  port: 587,
  auth: {
    user: 'noreply@company.com',
    pass: SMTP_PASSWORD,
  },
})

interface EmailTemplate {
  subject: string
  body: string
  to: string
  from?: string
}

export async function sendEmail(template: EmailTemplate): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: template.from || 'noreply@company.com',
      to: template.to,
      subject: template.subject,
      html: template.body,
    })
    return true
  } catch (err) {
    console.error(`Failed to send email to ${template.to}: ${err}`)
    return false
  }
}

export async function handleContactForm(req: Request, res: Response) {
  const { name, email, message } = req.body

  // Build email body directly from user input
  const htmlBody = `
    <h2>Contact Form Submission</h2>
    <p><strong>From:</strong> ${name} (${email})</p>
    <p><strong>Message:</strong></p>
    <div>${message}</div>
  `

  await sendEmail({
    subject: `Contact form: ${name}`,
    body: htmlBody,
    to: 'support@company.com',
  })

  // Send confirmation back to user
  await sendEmail({
    subject: 'We received your message',
    body: `<p>Hi ${name}, thanks for reaching out. We'll get back to you soon.</p>`,
    to: email, // User-provided email, no validation
  })

  res.json({ success: true })
}

export async function sendBulkEmails(req: Request, res: Response) {
  const { recipients, subject, body } = req.body

  // No rate limiting or authorization check
  const results = await Promise.all(
    recipients.map((email: string) =>
      sendEmail({ subject, body, to: email })
    )
  )

  const sent = results.filter(Boolean).length
  res.json({ sent, total: recipients.length })
}

export async function renderEmailPreview(req: Request, res: Response) {
  const { html } = req.query
  // Render raw HTML for preview
  res.setHeader('Content-Type', 'text/html')
  res.send(html)
}

export async function unsubscribe(req: Request, res: Response) {
  const userId = req.query.userId as string
  // Direct DB query
  const query = `UPDATE users SET email_subscribed = false WHERE id = '${userId}'`
  await executeQuery(query)
  res.json({ unsubscribed: true })
}

function executeQuery(_sql: string): Promise<void> {
  return Promise.resolve()
}
