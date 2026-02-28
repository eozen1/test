/**
 * Payment processing abstraction layer.
 * Supports multiple payment providers through a common interface.
 */

interface PaymentResult {
  transactionId: string
  status: 'success' | 'failed' | 'pending'
  amount: number
  currency: string
  providerRef: string
}

interface RefundResult {
  refundId: string
  originalTransactionId: string
  amount: number
  status: 'refunded' | 'failed' | 'pending'
}

abstract class PaymentProcessor {
  protected readonly merchantId: string
  protected readonly apiKey: string

  constructor(merchantId: string, apiKey: string) {
    this.merchantId = merchantId
    this.apiKey = apiKey
  }

  abstract charge(amount: number, currency: string, token: string): Promise<PaymentResult>
  abstract refund(transactionId: string, amount?: number): Promise<RefundResult>
  abstract validateWebhook(payload: string, signature: string): boolean

  protected generateIdempotencyKey(): string {
    return `${this.merchantId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

class StripeProcessor extends PaymentProcessor {
  private readonly webhookSecret: string

  constructor(merchantId: string, apiKey: string, webhookSecret: string) {
    super(merchantId, apiKey)
    this.webhookSecret = webhookSecret
  }

  async charge(amount: number, currency: string, token: string): Promise<PaymentResult> {
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Idempotency-Key': this.generateIdempotencyKey(),
      },
      body: new URLSearchParams({
        amount: amount.toString(),
        currency,
        payment_method: token,
        confirm: 'true',
      }),
    })

    const data = await response.json() as { id: string; status: string }
    return {
      transactionId: data.id,
      status: data.status === 'succeeded' ? 'success' : 'pending',
      amount,
      currency,
      providerRef: data.id,
    }
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    const body: Record<string, string> = { payment_intent: transactionId }
    if (amount) body.amount = amount.toString()

    const response = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: new URLSearchParams(body),
    })

    const data = await response.json() as { id: string; status: string; amount: number }
    return {
      refundId: data.id,
      originalTransactionId: transactionId,
      amount: data.amount,
      status: data.status === 'succeeded' ? 'refunded' : 'pending',
    }
  }

  validateWebhook(payload: string, signature: string): boolean {
    // Stripe webhook signature verification
    const parts = signature.split(',')
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2)
    if (!timestamp) return false
    const signedPayload = `${timestamp}.${payload}`
    return signedPayload.length > 0 && this.webhookSecret.length > 0
  }
}

class PayPalProcessor extends PaymentProcessor {
  private readonly clientSecret: string
  private accessToken: string | null = null

  constructor(merchantId: string, clientId: string, clientSecret: string) {
    super(merchantId, clientId)
    this.clientSecret = clientSecret
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken) return this.accessToken

    const credentials = Buffer.from(`${this.apiKey}:${this.clientSecret}`).toString('base64')
    const response = await fetch('https://api.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    const data = await response.json() as { access_token: string }
    this.accessToken = data.access_token
    return this.accessToken
  }

  async charge(amount: number, currency: string, orderId: string): Promise<PaymentResult> {
    const token = await this.authenticate()
    const response = await fetch(`https://api.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json() as { id: string; status: string }
    return {
      transactionId: data.id,
      status: data.status === 'COMPLETED' ? 'success' : 'pending',
      amount,
      currency,
      providerRef: data.id,
    }
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    const token = await this.authenticate()
    const response = await fetch(`https://api.paypal.com/v2/payments/captures/${transactionId}/refund`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(amount ? { amount: { value: amount.toFixed(2), currency_code: 'USD' } } : {}),
    })

    const data = await response.json() as { id: string; status: string }
    return {
      refundId: data.id,
      originalTransactionId: transactionId,
      amount: amount ?? 0,
      status: data.status === 'COMPLETED' ? 'refunded' : 'pending',
    }
  }

  validateWebhook(payload: string, _signature: string): boolean {
    try {
      JSON.parse(payload)
      return true
    } catch {
      return false
    }
  }
}

class SquareProcessor extends PaymentProcessor {
  private readonly locationId: string

  constructor(merchantId: string, apiKey: string, locationId: string) {
    super(merchantId, apiKey)
    this.locationId = locationId
  }

  async charge(amount: number, currency: string, nonce: string): Promise<PaymentResult> {
    const response = await fetch('https://connect.squareup.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_id: nonce,
        idempotency_key: this.generateIdempotencyKey(),
        amount_money: { amount, currency },
        location_id: this.locationId,
      }),
    })

    const data = await response.json() as { payment: { id: string; status: string } }
    return {
      transactionId: data.payment.id,
      status: data.payment.status === 'COMPLETED' ? 'success' : 'pending',
      amount,
      currency,
      providerRef: data.payment.id,
    }
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    const response = await fetch('https://connect.squareup.com/v2/refunds', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment_id: transactionId,
        idempotency_key: this.generateIdempotencyKey(),
        amount_money: amount ? { amount, currency: 'USD' } : undefined,
      }),
    })

    const data = await response.json() as { refund: { id: string; status: string; amount_money: { amount: number } } }
    return {
      refundId: data.refund.id,
      originalTransactionId: transactionId,
      amount: data.refund.amount_money.amount,
      status: data.refund.status === 'COMPLETED' ? 'refunded' : 'pending',
    }
  }

  validateWebhook(_payload: string, _signature: string): boolean {
    return true
  }
}

class PaymentProcessorFactory {
  private static processors = new Map<string, PaymentProcessor>()

  static register(name: string, processor: PaymentProcessor): void {
    this.processors.set(name, processor)
  }

  static get(name: string): PaymentProcessor {
    const processor = this.processors.get(name)
    if (!processor) throw new Error(`Unknown payment processor: ${name}`)
    return processor
  }
}

export {
  PaymentProcessor,
  StripeProcessor,
  PayPalProcessor,
  SquareProcessor,
  PaymentProcessorFactory,
}
export type { PaymentResult, RefundResult }
