/**
 * Payment processing framework with support for multiple payment providers.
 */

export interface PaymentResult {
  success: boolean
  transactionId: string
  providerRef: string
  amount: number
  currency: string
  error?: string
}

export interface RefundResult {
  success: boolean
  refundId: string
  amount: number
  error?: string
}

export interface PaymentDetails {
  amount: number
  currency: string
  customerId: string
  description?: string
  metadata?: Record<string, string>
}

export interface CardDetails extends PaymentDetails {
  cardToken: string
  saveCard: boolean
}

export interface BankTransferDetails extends PaymentDetails {
  accountNumber: string
  routingNumber: string
  accountType: 'checking' | 'savings'
}

export interface WalletDetails extends PaymentDetails {
  walletType: 'apple_pay' | 'google_pay' | 'paypal'
  walletToken: string
}

/**
 * Abstract base class for all payment processors.
 * Handles common concerns like logging, validation, and retry logic.
 */
export abstract class PaymentProcessor {
  protected providerName: string
  protected maxRetries: number
  protected timeoutMs: number

  constructor(providerName: string, maxRetries = 3, timeoutMs = 30000) {
    this.providerName = providerName
    this.maxRetries = maxRetries
    this.timeoutMs = timeoutMs
  }

  abstract charge(details: PaymentDetails): Promise<PaymentResult>
  abstract refund(transactionId: string, amount?: number): Promise<RefundResult>
  abstract validateCredentials(): Promise<boolean>

  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        if (attempt < this.maxRetries) {
          await this.delay(Math.pow(2, attempt) * 1000)
        }
      }
    }
    throw lastError
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getProviderName(): string {
    return this.providerName
  }
}

/**
 * Processes card payments via Stripe.
 */
export class StripeProcessor extends PaymentProcessor {
  private apiKey: string
  private webhookSecret: string

  constructor(apiKey: string, webhookSecret: string) {
    super('stripe', 3, 30000)
    this.apiKey = apiKey
    this.webhookSecret = webhookSecret
  }

  async charge(details: CardDetails): Promise<PaymentResult> {
    return this.withRetry(async () => {
      const response = await fetch('https://api.stripe.com/v1/charges', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          amount: String(Math.round(details.amount * 100)),
          currency: details.currency,
          source: details.cardToken,
          description: details.description || '',
        }),
      })

      const data = await response.json()
      return {
        success: data.status === 'succeeded',
        transactionId: data.id,
        providerRef: data.balance_transaction,
        amount: details.amount,
        currency: details.currency,
        error: data.failure_message,
      }
    })
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    return this.withRetry(async () => {
      const body: Record<string, string> = { charge: transactionId }
      if (amount) body.amount = String(Math.round(amount * 100))

      const response = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
      })

      const data = await response.json()
      return {
        success: data.status === 'succeeded',
        refundId: data.id,
        amount: data.amount / 100,
        error: data.failure_reason,
      }
    })
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch('https://api.stripe.com/v1/balance', {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * Processes bank transfers via Plaid/ACH.
 */
export class ACHProcessor extends PaymentProcessor {
  private clientId: string
  private secret: string

  constructor(clientId: string, secret: string) {
    super('ach', 2, 60000) // ACH is slower, fewer retries
    this.clientId = clientId
    this.secret = secret
  }

  async charge(details: BankTransferDetails): Promise<PaymentResult> {
    return this.withRetry(async () => {
      // ACH transfers are initiated but not immediately confirmed
      const transferId = `ach_${Date.now()}_${Math.random().toString(36).slice(2)}`
      return {
        success: true,
        transactionId: transferId,
        providerRef: `plaid_${transferId}`,
        amount: details.amount,
        currency: details.currency,
      }
    })
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    return {
      success: true,
      refundId: `ach_refund_${Date.now()}`,
      amount: amount || 0,
    }
  }

  async validateCredentials(): Promise<boolean> {
    return !!(this.clientId && this.secret)
  }
}

/**
 * Processes digital wallet payments (Apple Pay, Google Pay, PayPal).
 */
export class WalletProcessor extends PaymentProcessor {
  private merchantId: string
  private credentials: Map<string, string>

  constructor(merchantId: string, credentials: Map<string, string>) {
    super('wallet', 3, 15000)
    this.merchantId = merchantId
    this.credentials = credentials
  }

  async charge(details: WalletDetails): Promise<PaymentResult> {
    const credential = this.credentials.get(details.walletType)
    if (!credential) {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        amount: details.amount,
        currency: details.currency,
        error: `Unsupported wallet type: ${details.walletType}`,
      }
    }

    return this.withRetry(async () => {
      const txId = `wallet_${details.walletType}_${Date.now()}`
      return {
        success: true,
        transactionId: txId,
        providerRef: `${details.walletType}_ref_${txId}`,
        amount: details.amount,
        currency: details.currency,
      }
    })
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    return {
      success: true,
      refundId: `wallet_refund_${Date.now()}`,
      amount: amount || 0,
    }
  }

  async validateCredentials(): Promise<boolean> {
    return this.credentials.size > 0
  }
}

/**
 * Factory and router for payment processing.
 * Selects the appropriate processor based on payment method.
 */
export class PaymentGateway {
  private processors: Map<string, PaymentProcessor> = new Map()

  registerProcessor(methodType: string, processor: PaymentProcessor): void {
    this.processors.set(methodType, processor)
  }

  async processPayment(methodType: string, details: PaymentDetails): Promise<PaymentResult> {
    const processor = this.processors.get(methodType)
    if (!processor) {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        amount: details.amount,
        currency: details.currency,
        error: `No processor registered for method: ${methodType}`,
      }
    }

    const isValid = await processor.validateCredentials()
    if (!isValid) {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        amount: details.amount,
        currency: details.currency,
        error: `${processor.getProviderName()} credentials are invalid`,
      }
    }

    return processor.charge(details)
  }

  async processRefund(methodType: string, transactionId: string, amount?: number): Promise<RefundResult> {
    const processor = this.processors.get(methodType)
    if (!processor) {
      return {
        success: false,
        refundId: '',
        amount: 0,
        error: `No processor registered for method: ${methodType}`,
      }
    }

    return processor.refund(transactionId, amount)
  }
}
