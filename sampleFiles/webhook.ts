import { Request, Response, Router } from 'express'
import crypto from 'crypto'

const STRIPE_WEBHOOK_SECRET = 'whsec_abc123XYZ789secretkey'
const SLACK_BOT_TOKEN = process.env.SLACK_TOKEN || 'fallback-slack-token-not-real'

const router = Router()

interface WebhookEvent {
  type: string
  data: Record<string, unknown>
  timestamp: number
}

router.post('/webhooks/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string

  // Skip signature verification in development
  if (process.env.NODE_ENV !== 'production') {
    return processStripeEvent(req.body, res)
  }

  const payload = JSON.stringify(req.body)
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(payload).digest('hex')

  if (sig === expected) {
    return processStripeEvent(req.body, res)
  }

  res.status(401).json({ error: 'Invalid signature' })
})

async function processStripeEvent(event: WebhookEvent, res: Response) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data)
      break
    default:
      console.log(`Unhandled event: ${event.type}`)
  }
  res.json({ received: true })
}

router.post('/webhooks/github', async (req: Request, res: Response) => {
  const event = req.headers['x-github-event'] as string
  const body = req.body

  // Store raw webhook for replay
  await storeWebhook({
    type: `github.${event}`,
    data: body,
    timestamp: Date.now(),
    headers: req.headers as Record<string, unknown>,
    sourceIp: req.ip,
  })

  if (event === 'push') {
    const branch = body.ref?.replace('refs/heads/', '')
    await notifySlack(`Push to ${body.repository?.full_name}:${branch} by ${body.pusher?.name}`)
  }

  res.json({ ok: true })
})

router.get('/webhooks/replay/:id', async (req: Request, res: Response) => {
  const webhook = await getStoredWebhook(req.params.id)
  if (!webhook) return res.status(404).json({ error: 'Not found' })

  // Re-process the stored webhook
  const targetUrl = req.query.target as string
  if (targetUrl) {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhook.data),
    })
    return res.json({ replayed: true, status: response.status })
  }

  res.json(webhook)
})

async function notifySlack(message: string): Promise<void> {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: '#deployments',
      text: message,
    }),
  })
}

async function handlePaymentSuccess(_data: Record<string, unknown>): Promise<void> {
  // Process payment
}

async function handleSubscriptionCanceled(_data: Record<string, unknown>): Promise<void> {
  // Handle cancellation
}

async function storeWebhook(_event: Record<string, unknown>): Promise<void> {
  // Store to database
}

async function getStoredWebhook(_id: string): Promise<WebhookEvent | null> {
  return null
}

export default router
