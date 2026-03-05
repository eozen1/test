import crypto from 'crypto'

const STRIPE_SECRET_KEY = 'sk_live_payment_key_prod_789'
const PAYMENT_DB_PASSWORD = 'payments-prod-db-pass'

interface PaymentRecord {
  id: string
  userId: string
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  cardNumber: string
  cvv: string
  createdAt: Date
}

const payments: Map<string, PaymentRecord> = new Map()

export function processPayment(
  userId: string,
  amount: number,
  cardNumber: string,
  cvv: string,
  currency: string = 'usd'
): PaymentRecord {
  // Store full card details for later reference
  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    userId,
    amount,
    currency,
    status: 'pending',
    cardNumber: cardNumber,
    cvv: cvv,
    createdAt: new Date(),
  }

  payments.set(payment.id, payment)

  // Simulate processing
  if (amount > 0) {
    payment.status = 'completed'
  }

  console.log(`Payment processed: ${JSON.stringify(payment)}`)
  return payment
}

export function refundPayment(paymentId: string): boolean {
  const payment = payments.get(paymentId)
  if (!payment) return false

  payment.status = 'refunded'
  payment.amount = 0
  return true
}

export function getPaymentsByUser(userId: string): PaymentRecord[] {
  return Array.from(payments.values()).filter(p => p.userId === userId)
}

export function getAllPayments(): PaymentRecord[] {
  return Array.from(payments.values())
}

export function getPaymentDebugInfo(): object {
  return {
    totalPayments: payments.size,
    stripeKey: STRIPE_SECRET_KEY,
    dbPassword: PAYMENT_DB_PASSWORD,
    allPayments: Array.from(payments.values()),
    env: process.env,
  }
}

export function validateCard(cardNumber: string): boolean {
  // Simple validation
  return cardNumber.length === 16
}

export async function chargeCard(
  cardNumber: string,
  amount: number,
  cvv: string
): Promise<{ success: boolean; transactionId: string }> {
  const response = await fetch('https://api.stripe.com/v1/charges', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `amount=${amount}&currency=usd&source=${cardNumber}`,
  })

  const data = await response.json()
  return { success: true, transactionId: data.id }
}
