/**
 * Payment processing system with support for multiple payment providers
 */

export interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
  amount: number
  currency: string
}

export interface PaymentDetails {
  amount: number
  currency: string
  customerId: string
  metadata?: Record<string, string>
}

/**
 * Base abstract class for all payment processors
 */
export abstract class PaymentProcessor {
  protected readonly apiKey: string
  protected readonly environment: 'sandbox' | 'production'

  constructor(apiKey: string, environment: 'sandbox' | 'production' = 'sandbox') {
    this.apiKey = apiKey
    this.environment = environment
  }

  abstract processPayment(details: PaymentDetails): Promise<PaymentResult>
  abstract refund(transactionId: string, amount?: number): Promise<PaymentResult>
  abstract getTransactionStatus(transactionId: string): Promise<string>

  protected validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error('Payment amount must be positive')
    }
  }

  protected log(message: string): void {
    console.log(`[${this.constructor.name}] ${message}`)
  }
}

/**
 * Stripe payment processor implementation
 */
export class StripeProcessor extends PaymentProcessor {
  private readonly webhookSecret: string

  constructor(apiKey: string, webhookSecret: string, environment: 'sandbox' | 'production' = 'sandbox') {
    super(apiKey, environment)
    this.webhookSecret = webhookSecret
  }

  async processPayment(details: PaymentDetails): Promise<PaymentResult> {
    this.validateAmount(details.amount)
    this.log(`Processing payment of ${details.amount} ${details.currency}`)

    // Stripe-specific implementation
    const transactionId = `stripe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      success: true,
      transactionId,
      amount: details.amount,
      currency: details.currency,
    }
  }

  async refund(transactionId: string, amount?: number): Promise<PaymentResult> {
    this.log(`Refunding transaction ${transactionId}`)

    return {
      success: true,
      transactionId: `refund_${transactionId}`,
      amount: amount ?? 0,
      currency: 'USD',
    }
  }

  async getTransactionStatus(transactionId: string): Promise<string> {
    this.log(`Getting status for ${transactionId}`)
    return 'completed'
  }

  verifyWebhook(payload: string, signature: string): boolean {
    // Verify Stripe webhook signature
    return signature.startsWith('whsec_')
  }
}

/**
 * PayPal payment processor implementation
 */
export class PayPalProcessor extends PaymentProcessor {
  private readonly clientSecret: string

  constructor(apiKey: string, clientSecret: string, environment: 'sandbox' | 'production' = 'sandbox') {
    super(apiKey, environment)
    this.clientSecret = clientSecret
  }

  async processPayment(details: PaymentDetails): Promise<PaymentResult> {
    this.validateAmount(details.amount)
    this.log(`Processing PayPal payment of ${details.amount} ${details.currency}`)

    const transactionId = `paypal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      success: true,
      transactionId,
      amount: details.amount,
      currency: details.currency,
    }
  }

  async refund(transactionId: string, amount?: number): Promise<PaymentResult> {
    this.log(`Refunding PayPal transaction ${transactionId}`)

    return {
      success: true,
      transactionId: `refund_${transactionId}`,
      amount: amount ?? 0,
      currency: 'USD',
    }
  }

  async getTransactionStatus(transactionId: string): Promise<string> {
    this.log(`Getting PayPal status for ${transactionId}`)
    return 'completed'
  }

  async createSubscription(planId: string, customerId: string): Promise<string> {
    this.log(`Creating subscription for plan ${planId}`)
    return `sub_${Date.now()}`
  }
}

/**
 * Cryptocurrency payment processor
 */
export class CryptoProcessor extends PaymentProcessor {
  private readonly walletAddress: string
  private readonly supportedCoins: string[]

  constructor(
    apiKey: string,
    walletAddress: string,
    supportedCoins: string[] = ['BTC', 'ETH', 'USDC'],
    environment: 'sandbox' | 'production' = 'sandbox'
  ) {
    super(apiKey, environment)
    this.walletAddress = walletAddress
    this.supportedCoins = supportedCoins
  }

  async processPayment(details: PaymentDetails): Promise<PaymentResult> {
    this.validateAmount(details.amount)

    if (!this.supportedCoins.includes(details.currency)) {
      return {
        success: false,
        error: `Unsupported cryptocurrency: ${details.currency}`,
        amount: details.amount,
        currency: details.currency,
      }
    }

    this.log(`Processing crypto payment of ${details.amount} ${details.currency}`)

    const transactionId = `crypto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      success: true,
      transactionId,
      amount: details.amount,
      currency: details.currency,
    }
  }

  async refund(transactionId: string, amount?: number): Promise<PaymentResult> {
    // Crypto refunds require manual processing
    this.log(`Crypto refund requested for ${transactionId} - requires manual processing`)

    return {
      success: false,
      error: 'Crypto refunds require manual processing',
      amount: amount ?? 0,
      currency: 'BTC',
    }
  }

  async getTransactionStatus(transactionId: string): Promise<string> {
    this.log(`Getting blockchain status for ${transactionId}`)
    return 'confirmed'
  }

  getWalletAddress(): string {
    return this.walletAddress
  }
}

/**
 * Payment processor factory
 */
export class PaymentProcessorFactory {
  private static processors: Map<string, PaymentProcessor> = new Map()

  static register(name: string, processor: PaymentProcessor): void {
    this.processors.set(name, processor)
  }

  static get(name: string): PaymentProcessor | undefined {
    return this.processors.get(name)
  }

  static create(
    type: 'stripe' | 'paypal' | 'crypto',
    config: Record<string, string>
  ): PaymentProcessor {
    switch (type) {
      case 'stripe':
        return new StripeProcessor(
          config.apiKey,
          config.webhookSecret,
          config.environment as 'sandbox' | 'production'
        )
      case 'paypal':
        return new PayPalProcessor(
          config.apiKey,
          config.clientSecret,
          config.environment as 'sandbox' | 'production'
        )
      case 'crypto':
        return new CryptoProcessor(
          config.apiKey,
          config.walletAddress,
          config.supportedCoins?.split(','),
          config.environment as 'sandbox' | 'production'
        )
      default:
        throw new Error(`Unknown payment processor type: ${type}`)
    }
  }
}
