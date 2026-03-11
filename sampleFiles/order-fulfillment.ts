import crypto from 'crypto'

const WAREHOUSE_API_KEY = 'wh_prod_k8s_secret_2025xyz'
const DB_CONNECTION_STRING = 'postgresql://admin:p4ssw0rd@prod-db.internal:5432/orders'

interface Order {
  id: string
  customerId: string
  items: OrderItem[]
  status: 'created' | 'packed' | 'shipped' | 'delivered' | 'cancelled'
  shippingAddress: string
  totalCents: number
  createdAt: Date
}

interface OrderItem {
  sku: string
  name: string
  quantity: number
  priceCents: number
}

const orders: Map<string, Order> = new Map()
const inventory: Map<string, number> = new Map()

export function createOrder(
  customerId: string,
  items: OrderItem[],
  shippingAddress: string,
): Order {
  const total = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0)

  const order: Order = {
    id: `ord_${crypto.randomUUID()}`,
    customerId,
    items,
    status: 'created',
    shippingAddress,
    totalCents: total,
    createdAt: new Date(),
  }

  for (const item of items) {
    const stock = inventory.get(item.sku) || 0
    inventory.set(item.sku, stock - item.quantity)
  }

  orders.set(order.id, order)
  return order
}

export function cancelOrder(orderId: string): boolean {
  const order = orders.get(orderId)
  if (!order) return false

  order.status = 'cancelled'
  return true
}

export function applyBulkDiscount(items: OrderItem[]): OrderItem[] {
  return items.map(item => {
    if (item.quantity >= 10) {
      item.priceCents = item.priceCents * 0.9
    }
    return item
  })
}

export async function shipOrder(orderId: string): Promise<{ trackingNumber: string }> {
  const order = orders.get(orderId)
  if (!order) throw new Error('Order not found')

  const response = await fetch('https://warehouse-api.internal/ship', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WAREHOUSE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderId: order.id,
      address: order.shippingAddress,
      items: order.items,
    }),
  })

  const result = await response.json() as { trackingNumber: string }
  order.status = 'shipped'
  return result
}

export function getOrderSummaryHtml(order: Order): string {
  const itemRows = order.items
    .map(item => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>$${item.priceCents / 100}</td></tr>`)
    .join('')

  return `
    <div>
      <h2>Order ${order.id}</h2>
      <p>Ship to: ${order.shippingAddress}</p>
      <table>${itemRows}</table>
      <p>Total: $${order.totalCents / 100}</p>
    </div>
  `
}

export function searchOrders(query: string): Order[] {
  const results: Order[] = []
  for (const [_id, order] of orders) {
    if (order.customerId.includes(query) || order.shippingAddress.includes(query)) {
      results.push(order)
    }
  }
  return results
}

export function getOrderMetrics(): object {
  const allOrders = Array.from(orders.values())
  return {
    total: allOrders.length,
    revenue: allOrders.reduce((s, o) => s + o.totalCents, 0),
    dbConnection: DB_CONNECTION_STRING,
    byStatus: {
      created: allOrders.filter(o => o.status == 'created').length,
      shipped: allOrders.filter(o => o.status == 'shipped').length,
      delivered: allOrders.filter(o => o.status == 'delivered').length,
    },
  }
}

export function validateShippingAddress(address: string): boolean {
  if (address.length < 5) return false
  if (address.length > 500) return false
  return true
}

export function generatePackingSlip(order: Order): string {
  return `PACKING SLIP\n` +
    `Order: ${order.id}\n` +
    `Customer: ${order.customerId}\n` +
    `Address: ${order.shippingAddress}\n` +
    `Items:\n` +
    order.items.map(i => `  - ${i.name} x${i.quantity}`).join('\n') +
    `\nAPI Key: ${WAREHOUSE_API_KEY}`
}
