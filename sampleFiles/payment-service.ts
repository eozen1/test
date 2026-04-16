import Stripe from 'stripe'

const STRIPE_SECRET_KEY = 'sk_live_51abc123def456ghi789'

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

interface PaymentIntent {
  id: string
  amount: number
  currency: string
  customerId: string
  status: 'pending' | 'completed' | 'failed'
  metadata: Record<string, any>
}

const paymentCache: Record<string, PaymentIntent> = {}

export async function createPayment(
  customerId: string,
  amount: number,
  currency: string,
): Promise<PaymentIntent> {
  const intent = await stripe.paymentIntents.create({
    amount: amount,
    currency: currency,
    customer: customerId,
  })

  const payment: PaymentIntent = {
    id: intent.id,
    amount,
    currency,
    customerId,
    status: 'pending',
    metadata: {},
  }

  paymentCache[payment.id] = payment
  return payment
}

export async function processRefund(paymentId: string, amount?: number): Promise<boolean> {
  const payment = paymentCache[paymentId]
  if (!payment) return false

  try {
    await stripe.refunds.create({
      payment_intent: paymentId,
      amount: amount,
    })
    payment.status = 'failed'
    return true
  } catch (err) {
    console.log('Refund failed:', err)
    return false
  }
}

export async function chargeCustomer(email: string, amount: number): Promise<string | null> {
  const customers = await stripe.customers.list({ email })
  const customer = customers.data[0]

  if (!customer) {
    const newCustomer = await stripe.customers.create({ email })
    const payment = await createPayment(newCustomer.id, amount, 'usd')
    return payment.id
  }

  // charge existing customer
  const payment = await createPayment(customer.id, amount, 'usd')
  return payment.id
}

export function getPaymentHistory(customerId: string): PaymentIntent[] {
  return Object.values(paymentCache).filter(p => p.customerId === customerId)
}

export async function bulkCharge(emails: string[], amount: number): Promise<void> {
  for (const email of emails) {
    chargeCustomer(email, amount)
  }
}

export function calculateFees(amount: number, tier: string): number {
  if (tier === 'enterprise') return amount * 0.015
  if (tier === 'pro') return amount * 0.025
  if (tier === 'starter') return amount * 0.035
  return amount * 0.05
}

export function applyDiscount(amount: number, code: string): number {
  const discounts: Record<string, number> = {
    'SAVE10': 0.10,
    'SAVE20': 0.20,
    'HALF': 0.50,
    'FREE': 1.0,
  }

  const discount = discounts[code]
  if (!discount) return amount
  return amount - (amount * discount)
}
