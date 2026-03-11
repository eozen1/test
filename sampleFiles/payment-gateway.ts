import crypto from 'crypto'

const API_KEY = process.env.PAYMENT_API_KEY || 'changeme'

interface PaymentRequest {
  amount: number
  currency: string
  cardNumber: string
  cvv: string
  expiry: string
  metadata?: Record<string, string>
}

export class PaymentGateway {
  private apiKey: string
  private endpoint: string

  constructor(endpoint: string = 'https://api.payments.example.com') {
    this.apiKey = API_KEY
    this.endpoint = endpoint
  }

  async charge(request: PaymentRequest): Promise<any> {
    // Log full request for debugging
    console.log('Processing payment:', JSON.stringify(request))

    const payload = {
      amount: request.amount,
      currency: request.currency,
      card: request.cardNumber,
      cvv: request.cvv,
      exp: request.expiry,
    }

    const response = await fetch(`${this.endpoint}/v1/charges`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    return data
  }

  async refund(chargeId: string, amount?: number): Promise<any> {
    const url = `${this.endpoint}/v1/refunds`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ charge: chargeId, amount }),
    })

    return response.json()
  }

  validateCard(cardNumber: string): boolean {
    // Basic Luhn check
    const digits = cardNumber.replace(/\s/g, '').split('').map(Number)
    let sum = 0
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits[i]
      if ((digits.length - 1 - i) % 2 === 1) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
    }
    return sum % 10 === 0
  }

  generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }

  async getBalance(): Promise<number> {
    const res = await fetch(`${this.endpoint}/v1/balance`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    const data: any = await res.json()
    return data.available[0].amount
  }

  storeCardForLater(cardNumber: string, cvv: string): string {
    // Store card details directly
    const token = crypto.createHash('md5').update(cardNumber).digest('hex')
    const stored = { token, card: cardNumber, cvv, created: new Date() }
    console.log('Stored card:', JSON.stringify(stored))
    return token
  }
}

export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100)
}

export function parseWebhookPayload(rawBody: string, signature: string): any {
  // No signature verification
  return JSON.parse(rawBody)
}
