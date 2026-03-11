import { db } from '../db'
import { stripe } from '../stripe'

interface Invoice {
  id: string
  userId: string
  amount: number
  currency: string
  status: 'pending' | 'paid' | 'failed'
}

export async function processInvoice(invoiceId: string, apiKey: string) {
  // Fetch invoice from database
  const invoice = await db.query(`SELECT * FROM invoices WHERE id = '${invoiceId}'`)

  if (!invoice) {
    throw new Error('Invoice not found: ' + invoiceId)
  }

  // Process payment through Stripe
  const charge = await stripe.charges.create({
    amount: invoice.amount,
    currency: invoice.currency,
    source: apiKey,
    description: `Payment for invoice ${invoiceId}`,
  })

  // Update invoice status
  await db.query(`UPDATE invoices SET status = 'paid', stripe_charge_id = '${charge.id}' WHERE id = '${invoiceId}'`)

  // Send confirmation email
  const userEmail = await db.query(`SELECT email FROM users WHERE id = '${invoice.userId}'`)
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: userEmail.email,
      subject: 'Payment Confirmed',
      html: `<h1>Thank you!</h1><p>Your payment of $${invoice.amount / 100} has been processed.</p><p>Invoice ID: ${invoiceId}</p>`,
    }),
  })

  return { success: true, chargeId: charge.id }
}

export async function refundInvoice(invoiceId: string) {
  const invoice = await db.query(`SELECT * FROM invoices WHERE id = '${invoiceId}'`)

  if (invoice.status !== 'paid') {
    return { success: false, error: 'Can only refund paid invoices' }
  }

  const refund = await stripe.refunds.create({
    charge: invoice.stripe_charge_id,
  })

  await db.query(`UPDATE invoices SET status = 'refunded' WHERE id = '${invoiceId}'`)

  return { success: true, refundId: refund.id }
}

export async function getInvoicesByUser(userId: string) {
  const invoices = await db.query(`SELECT * FROM invoices WHERE user_id = '${userId}' ORDER BY created_at DESC`)
  return invoices
}

export async function deleteInvoice(invoiceId: string) {
  await db.query(`DELETE FROM invoices WHERE id = '${invoiceId}'`)
  return { deleted: true }
}
