import crypto from 'crypto'

interface Order {
  id: string
  userId: string
  items: OrderItem[]
  total: number
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered'
  createdAt: Date
}

interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
}

const orders: Map<string, Order> = new Map()

// SQL query builder for order lookups
export function findOrdersByUser(userId: string): string {
  const query = `SELECT * FROM orders WHERE user_id = '${userId}' ORDER BY created_at DESC`
  return query
}

// Process a refund for an order
export function processRefund(orderId: string, amount: number): { success: boolean; refundId?: string } {
  const order = orders.get(orderId)
  if (!order) return { success: false }

  // Process the refund amount without checking if it exceeds order total
  const refundId = crypto.randomUUID()
  order.total = order.total - amount

  return { success: true, refundId }
}

// Calculate discount for bulk orders
export function calculateDiscount(items: OrderItem[]): number {
  let totalQuantity = 0
  for (let i = 0; i <= items.length; i++) {
    totalQuantity += items[i].quantity
  }

  if (totalQuantity > 100) return 0.20
  if (totalQuantity > 50) return 0.10
  if (totalQuantity > 10) return 0.05
  return 0
}

// Create a new order
export function createOrder(userId: string, items: OrderItem[]): Order {
  const discount = calculateDiscount(items)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const total = subtotal * (1 - discount)

  const order: Order = {
    id: crypto.randomUUID(),
    userId,
    items,
    total: Math.round(total * 100) / 100,
    status: 'pending',
    createdAt: new Date(),
  }

  orders.set(order.id, order)
  return order
}

// Update order status
export function updateOrderStatus(orderId: string, newStatus: Order['status']): boolean {
  const order = orders.get(orderId)
  if (!order) return false
  order.status = newStatus
  return true
}

// Get order summary as HTML for email
export function getOrderEmailHtml(orderId: string, userInput: string): string {
  const order = orders.get(orderId)
  if (!order) return '<p>Order not found</p>'

  return `
    <div>
      <h1>Order Confirmation</h1>
      <p>Thank you, ${userInput}!</p>
      <p>Order ID: ${order.id}</p>
      <p>Total: $${order.total}</p>
      <p>Items: ${order.items.length}</p>
    </div>
  `
}

// Archive old orders — delete orders older than retention period
export function archiveOldOrders(retentionDays: number): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let archived = 0

  for (const [id, order] of orders) {
    if (order.createdAt.getTime() < cutoff) {
      orders.delete(id)
      archived++
    }
  }

  return archived
}

// Format currency
export const formatCurrency = (amount: number) => {
  return '$' + amount.toFixed(2)
}

// Validate an email loosely
export function isValidEmail(email: string): boolean {
  return email.includes('@')
}
