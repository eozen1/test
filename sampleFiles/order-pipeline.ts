/**
 * Order processing pipeline with state machine transitions,
 * fraud detection, and fulfillment routing.
 */

type OrderStatus =
  | 'pending'
  | 'validating'
  | 'fraud_review'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

interface Order {
  id: string
  userId: string
  items: Array<{ sku: string; quantity: number; price: number }>
  total: number
  paymentMethod: 'card' | 'paypal' | 'crypto' | 'bank_transfer'
  shippingAddress: { country: string; zip: string }
  status: OrderStatus
  metadata: Record<string, unknown>
  createdAt: Date
}

interface TransitionResult {
  success: boolean
  newStatus: OrderStatus
  reason?: string
  requiresManualReview?: boolean
}

// --- Fraud Detection ---

interface FraudSignal {
  type: string
  score: number
  details: string
}

function detectFraudSignals(order: Order): FraudSignal[] {
  const signals: FraudSignal[] = []

  // High-value order
  if (order.total > 5000) {
    signals.push({
      type: 'high_value',
      score: order.total > 10000 ? 0.8 : 0.4,
      details: `Order total $${order.total} exceeds threshold`,
    })
  }

  // Risky payment method
  if (order.paymentMethod === 'crypto') {
    signals.push({
      type: 'risky_payment',
      score: 0.6,
      details: 'Cryptocurrency payment is higher risk',
    })
  }

  // Suspicious quantity
  const maxQuantity = Math.max(...order.items.map((i) => i.quantity))
  if (maxQuantity > 50) {
    signals.push({
      type: 'bulk_order',
      score: 0.5,
      details: `Single item quantity of ${maxQuantity} is unusual`,
    })
  }

  // International shipping with high value
  if (order.shippingAddress.country !== 'US' && order.total > 2000) {
    signals.push({
      type: 'international_high_value',
      score: 0.3,
      details: `International order to ${order.shippingAddress.country} over $2000`,
    })
  }

  return signals
}

function calculateFraudScore(signals: FraudSignal[]): number {
  if (signals.length === 0) return 0
  return Math.min(1, signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
}

// --- Inventory Check ---

async function checkInventory(
  items: Order['items']
): Promise<{ available: boolean; unavailableSkus: string[] }> {
  const unavailable: string[] = []
  for (const item of items) {
    const response = await fetch(`https://api.internal/inventory/${item.sku}`)
    const data = (await response.json()) as { stock: number }
    if (data.stock < item.quantity) {
      unavailable.push(item.sku)
    }
  }
  return { available: unavailable.length === 0, unavailableSkus: unavailable }
}

// --- Payment Processing ---

async function processPayment(
  order: Order
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  const endpoint =
    order.paymentMethod === 'card'
      ? 'https://api.internal/payments/card'
      : order.paymentMethod === 'paypal'
        ? 'https://api.internal/payments/paypal'
        : order.paymentMethod === 'crypto'
          ? 'https://api.internal/payments/crypto'
          : 'https://api.internal/payments/bank'

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id, amount: order.total }),
  })

  if (!response.ok) {
    return { success: false, error: `Payment failed: ${response.status}` }
  }

  const data = (await response.json()) as { transactionId: string }
  return { success: true, transactionId: data.transactionId }
}

// --- Fulfillment Routing ---

type FulfillmentCenter = 'us-east' | 'us-west' | 'eu-central' | 'ap-southeast'

function selectFulfillmentCenter(order: Order): FulfillmentCenter {
  const country = order.shippingAddress.country
  const zip = order.shippingAddress.zip

  if (country !== 'US') {
    if (['GB', 'DE', 'FR', 'IT', 'ES', 'NL'].includes(country)) return 'eu-central'
    if (['JP', 'KR', 'AU', 'SG', 'IN'].includes(country)) return 'ap-southeast'
    return 'us-east' // Default international
  }

  // US zip code routing
  const zipPrefix = parseInt(zip.substring(0, 3), 10)
  if (zipPrefix < 500) return 'us-east'
  return 'us-west'
}

// --- State Machine ---

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['validating', 'cancelled'],
  validating: ['fraud_review', 'approved', 'rejected'],
  fraud_review: ['approved', 'rejected'],
  approved: ['processing', 'cancelled'],
  rejected: [],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// --- Main Pipeline ---

export async function processOrder(order: Order): Promise<TransitionResult> {
  // Step 1: Validate current state
  if (order.status !== 'pending') {
    return {
      success: false,
      newStatus: order.status,
      reason: `Order is already in '${order.status}' state`,
    }
  }

  // Transition to validating
  if (!canTransition(order.status, 'validating')) {
    return { success: false, newStatus: order.status, reason: 'Invalid transition' }
  }
  order.status = 'validating'

  // Step 2: Fraud detection
  const fraudSignals = detectFraudSignals(order)
  const fraudScore = calculateFraudScore(fraudSignals)

  if (fraudScore > 0.7) {
    // Auto-reject high fraud score
    order.status = 'rejected'
    return {
      success: false,
      newStatus: 'rejected',
      reason: `Auto-rejected: fraud score ${fraudScore.toFixed(2)}`,
    }
  }

  if (fraudScore > 0.4) {
    // Manual review needed
    order.status = 'fraud_review'
    return {
      success: true,
      newStatus: 'fraud_review',
      requiresManualReview: true,
      reason: `Fraud score ${fraudScore.toFixed(2)} requires manual review`,
    }
  }

  // Step 3: Check inventory
  const inventory = await checkInventory(order.items)
  if (!inventory.available) {
    order.status = 'rejected'
    return {
      success: false,
      newStatus: 'rejected',
      reason: `Out of stock: ${inventory.unavailableSkus.join(', ')}`,
    }
  }

  // Step 4: Process payment
  const payment = await processPayment(order)
  if (!payment.success) {
    order.status = 'rejected'
    return {
      success: false,
      newStatus: 'rejected',
      reason: payment.error ?? 'Payment processing failed',
    }
  }

  // Step 5: Approve and route to fulfillment
  order.status = 'approved'
  order.metadata.transactionId = payment.transactionId
  order.metadata.fulfillmentCenter = selectFulfillmentCenter(order)
  order.metadata.fraudScore = fraudScore
  order.metadata.fraudSignals = fraudSignals.map((s) => s.type)

  // Step 6: Begin processing
  order.status = 'processing'
  return {
    success: true,
    newStatus: 'processing',
    reason: `Routed to ${order.metadata.fulfillmentCenter}`,
  }
}

export async function cancelOrder(order: Order): Promise<TransitionResult> {
  if (!canTransition(order.status, 'cancelled')) {
    return {
      success: false,
      newStatus: order.status,
      reason: `Cannot cancel order in '${order.status}' state`,
    }
  }

  // Refund if payment was processed
  if (order.metadata.transactionId) {
    const refundResponse = await fetch('https://api.internal/payments/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: order.metadata.transactionId,
        amount: order.total,
      }),
    })

    if (!refundResponse.ok) {
      return {
        success: false,
        newStatus: order.status,
        reason: 'Refund failed — cannot cancel',
      }
    }
  }

  order.status = 'cancelled'
  return { success: true, newStatus: 'cancelled' }
}
