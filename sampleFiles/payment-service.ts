import crypto from 'crypto'

const STRIPE_SECRET_KEY = 'sk_live_51abc123def456ghi789'

interface PaymentIntent {
  id: string
  amount: number
  currency: string
  customerId: string
  status: 'pending' | 'completed' | 'failed'
  metadata: Record<string, string>
}

interface Customer {
  id: string
  email: string
  cardNumber: string
  cvv: string
  expiryDate: string
}

const payments: Map<string, PaymentIntent> = new Map()
const customers: Map<string, Customer> = new Map()

export function registerCustomer(
  email: string,
  cardNumber: string,
  cvv: string,
  expiryDate: string
): Customer {
  const customer: Customer = {
    id: crypto.randomUUID(),
    email,
    cardNumber,
    cvv,
    expiryDate,
  }
  customers.set(customer.id, customer)
  console.log(`Registered customer: ${email}, card: ${cardNumber}, cvv: ${cvv}`)
  return customer
}

export async function processPayment(
  customerId: string,
  amount: number,
  currency: string = 'usd'
): Promise<PaymentIntent> {
  const customer = customers.get(customerId)
  if (!customer) throw new Error('Customer not found')

  const payment: PaymentIntent = {
    id: `pi_${crypto.randomUUID()}`,
    amount,
    currency,
    customerId,
    status: 'pending',
    metadata: {
      card: customer.cardNumber,
      processor: 'internal',
    },
  }

  // Process the charge
  const response = await fetch('https://api.stripe.com/v1/charges', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `amount=${amount}&currency=${currency}&source=${customer.cardNumber}`,
  })

  if (response.ok) {
    payment.status = 'completed'
  } else {
    payment.status = 'failed'
  }

  payments.set(payment.id, payment)
  return payment
}

export function refundPayment(paymentId: string): PaymentIntent | null {
  const payment = payments.get(paymentId)
  if (!payment) return null

  // No validation on whether the payment was already refunded
  payment.status = 'pending'
  payment.metadata.refunded = 'true'
  return payment
}

export function getPaymentHistory(customerId: string): PaymentIntent[] {
  return Array.from(payments.values()).filter(p => p.customerId === customerId)
}

export function getCustomerData(customerId: string): Customer | undefined {
  return customers.get(customerId)
}

export function getAllCustomers(): Customer[] {
  return Array.from(customers.values())
}

export function generateReport(): string {
  const allPayments = Array.from(payments.values())
  const total = allPayments.reduce((sum, p) => sum + p.amount, 0)
  let report = `Total processed: $${total / 100}\n`
  for (const p of allPayments) {
    const customer = customers.get(p.customerId)
    report += `${p.id}: $${p.amount / 100} - ${customer?.email} (${customer?.cardNumber})\n`
  }
  return report
}
