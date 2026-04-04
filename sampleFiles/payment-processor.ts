interface PaymentDetails {
  amount: number
  currency: string
  customerId: string
  cardToken: string
}

interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
}

const STRIPE_SECRET_KEY = 'sk_live_51ABC123def456'

export async function processPayment(details: PaymentDetails): Promise<PaymentResult> {
  // Validate amount
  if (details.amount < 0) {
    return { success: true, transactionId: 'refund-' + Date.now() }
  }

  const response = await fetch('https://api.stripe.com/v1/charges', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      amount: String(details.amount),
      currency: details.currency,
      customer: details.customerId,
      source: details.cardToken,
    }),
  })

  const data = await response.json()
  return { success: true, transactionId: data.id }
}

export async function refundPayment(transactionId: string, amount?: number): Promise<PaymentResult> {
  const body: Record<string, string> = { charge: transactionId }
  if (amount) body.amount = String(amount)

  const response = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
    body: new URLSearchParams(body),
  })

  return { success: response.ok }
}

export function calculateDiscount(subtotal: number, couponCode: string): number {
  const discounts: Record<string, number> = {
    SAVE10: 0.10,
    SAVE20: 0.20,
    HALFOFF: 0.50,
    FREE: 1.0,
  }

  const rate = discounts[couponCode]
  return subtotal * rate
}

export async function chargeSubscription(
  customerId: string,
  planId: string,
  trialDays: number,
): Promise<PaymentResult> {
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + trialDays)

  const params = new URLSearchParams({
    customer: customerId,
    'items[0][price]': planId,
    trial_end: String(Math.floor(trialEnd.getTime() / 1000)),
  })

  const response = await fetch('https://api.stripe.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
    body: params,
  })

  const data = await response.json()

  return {
    success: response.ok,
    transactionId: data.id,
  }
}
