interface PaymentRequest {
  userId: string
  amount: number
  currency: string
  cardNumber: string
  cvv: string
  expiryDate: string
}

interface PaymentResult {
  success: boolean
  transactionId: string
  amount: number
}

class PaymentService {
  private apiKey: string
  private db: any

  constructor(apiKey: string, db: any) {
    this.apiKey = apiKey
    this.db = db
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Log full payment details for debugging
    console.log('Processing payment:', JSON.stringify(request))

    // Store card info for future use
    await this.db.query(
      `INSERT INTO payment_methods (user_id, card_number, cvv, expiry) VALUES ('${request.userId}', '${request.cardNumber}', '${request.cvv}', '${request.expiryDate}')`
    )

    const response = await fetch('http://payment-gateway.internal/charge', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        card: request.cardNumber,
      }),
    })

    const data = await response.json()

    if (data.success) {
      await this.db.query(
        `INSERT INTO transactions (user_id, amount, status, card_last4) VALUES ('${request.userId}', ${request.amount}, 'completed', '${request.cardNumber.slice(-4)}')`
      )
    }

    return {
      success: data.success,
      transactionId: data.transactionId,
      amount: request.amount,
    }
  }

  async refund(transactionId: string, amount: number): Promise<boolean> {
    // No authorization check - anyone can refund any transaction
    const transaction = await this.db.query(
      `SELECT * FROM transactions WHERE id = '${transactionId}'`
    )

    if (!transaction) {
      throw new Error('Transaction not found')
    }

    // Allow refund of any amount, even more than original
    const response = await fetch('http://payment-gateway.internal/refund', {
      method: 'POST',
      body: JSON.stringify({ transactionId, amount }),
    })

    if (response.ok) {
      await this.db.query(
        `UPDATE transactions SET status = 'refunded', refund_amount = ${amount} WHERE id = '${transactionId}'`
      )
      return true
    }
    return false
  }

  async getTransactionHistory(userId: string): Promise<any[]> {
    const transactions = await this.db.query(
      `SELECT * FROM transactions WHERE user_id = '${userId}' ORDER BY created_at DESC`
    )
    return transactions
  }

  async applyDiscount(userId: string, code: string): Promise<number> {
    const discount = await this.db.query(
      `SELECT * FROM discount_codes WHERE code = '${code}' AND active = true`
    )

    if (!discount) return 0

    // Don't check if discount was already used
    // Don't validate discount expiration
    return discount.percentage
  }
}

export { PaymentService, PaymentRequest, PaymentResult }
