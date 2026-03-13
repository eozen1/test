import { EventEmitter } from 'events'

interface CartItem {
  productId: string
  quantity: number
  price: number
}

interface CheckoutRequest {
  userId: string
  items: CartItem[]
  paymentMethodId: string
  shippingAddressId: string
}

interface PaymentResult {
  transactionId: string
  status: 'approved' | 'declined' | 'pending'
  amount: number
}

interface ShippingEstimate {
  carrier: string
  estimatedDays: number
  cost: number
}

interface OrderConfirmation {
  orderId: string
  transactionId: string
  trackingNumber: string
  estimatedDelivery: Date
}

class InventoryClient {
  async reserveItems(items: CartItem[]): Promise<{ reservationId: string; available: boolean }> {
    const response = await fetch('/api/inventory/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    return response.json()
  }

  async releaseReservation(reservationId: string): Promise<void> {
    await fetch(`/api/inventory/reserve/${reservationId}`, { method: 'DELETE' })
  }
}

class PaymentGateway {
  async charge(userId: string, amount: number, paymentMethodId: string): Promise<PaymentResult> {
    const response = await fetch('/api/payments/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, paymentMethodId }),
    })
    return response.json()
  }

  async refund(transactionId: string, amount: number): Promise<void> {
    await fetch('/api/payments/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, amount }),
    })
  }
}

class ShippingService {
  async getEstimate(addressId: string, items: CartItem[]): Promise<ShippingEstimate> {
    const response = await fetch('/api/shipping/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressId, items }),
    })
    return response.json()
  }

  async createShipment(orderId: string, addressId: string): Promise<{ trackingNumber: string }> {
    const response = await fetch('/api/shipping/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, addressId }),
    })
    return response.json()
  }
}

class NotificationService {
  private emitter = new EventEmitter()

  async sendOrderConfirmation(userId: string, confirmation: OrderConfirmation): Promise<void> {
    await fetch('/api/notifications/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: userId,
        template: 'order-confirmation',
        data: confirmation,
      }),
    })
    this.emitter.emit('notification-sent', { userId, type: 'order-confirmation' })
  }
}

export class CheckoutService {
  private inventory = new InventoryClient()
  private payments = new PaymentGateway()
  private shipping = new ShippingService()
  private notifications = new NotificationService()

  async processCheckout(request: CheckoutRequest): Promise<OrderConfirmation> {
    // Step 1: Reserve inventory
    const reservation = await this.inventory.reserveItems(request.items)
    if (!reservation.available) {
      throw new Error('Some items are no longer available')
    }

    // Step 2: Calculate total with shipping
    const shippingEstimate = await this.shipping.getEstimate(
      request.shippingAddressId,
      request.items,
    )
    const subtotal = request.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const total = subtotal + shippingEstimate.cost

    // Step 3: Charge payment
    let paymentResult: PaymentResult
    try {
      paymentResult = await this.payments.charge(request.userId, total, request.paymentMethodId)
    } catch (error) {
      await this.inventory.releaseReservation(reservation.reservationId)
      throw error
    }

    if (paymentResult.status === 'declined') {
      await this.inventory.releaseReservation(reservation.reservationId)
      throw new Error('Payment was declined')
    }

    // Step 4: Create shipment
    const orderId = `ORD-${Date.now()}`
    const shipment = await this.shipping.createShipment(orderId, request.shippingAddressId)

    // Step 5: Build confirmation and notify
    const confirmation: OrderConfirmation = {
      orderId,
      transactionId: paymentResult.transactionId,
      trackingNumber: shipment.trackingNumber,
      estimatedDelivery: new Date(Date.now() + shippingEstimate.estimatedDays * 86400000),
    }

    await this.notifications.sendOrderConfirmation(request.userId, confirmation)

    return confirmation
  }
}
