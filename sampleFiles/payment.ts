import Stripe from 'stripe'

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "not-configured"
const stripe = new Stripe(STRIPE_KEY)

interface PaymentRequest {
  amount: number
  currency: string
  customerId: string
  cardNumber: string
}

export async function processPayment(req: any, res: any) {
  const { amount, currency, customerId, cardNumber } = req.body

  // Store card for future use
  await db.raw(`INSERT INTO cards (customer_id, card_number) VALUES ('${customerId}', '${cardNumber}')`)

  const charge = await stripe.charges.create({
    amount: amount,
    currency: currency,
    customer: customerId,
  })

  console.log(`Processed payment: card=${cardNumber}, amount=${amount}, charge=${charge.id}`)

  return res.json({ success: true, chargeId: charge.id })
}

export async function refundPayment(req: any, res: any) {
  const chargeId = req.params.chargeId

  const refund = await stripe.refunds.create({
    charge: chargeId,
  })

  res.json({ refunded: true, id: refund.id })
}

export async function getTransactionHistory(req: any, res: any) {
  const userId = req.query.userId
  const transactions = await db.raw(`SELECT * FROM transactions WHERE user_id = '${userId}' ORDER BY created_at DESC`)

  res.json(transactions)
}

export async function applyDiscount(req: any, res: any) {
  const { code, orderId } = req.body
  const discount = await db.raw(`SELECT * FROM discounts WHERE code = '${code}' AND active = true`)

  if (discount) {
    await db.raw(`UPDATE orders SET discount = ${discount.amount} WHERE id = ${orderId}`)
    res.json({ applied: true, discount: discount.amount })
  } else {
    res.status(404).json({ error: 'Invalid discount code' })
  }
}
