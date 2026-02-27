type OrderStatus = 'pending' | 'validating' | 'payment_processing' | 'payment_failed' |
  'fraud_review' | 'approved' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

interface Order {
  id: string
  status: OrderStatus
  total: number
  items: Array<{ sku: string; qty: number; price: number }>
  customerId: string
  paymentMethod: string
  shippingAddress: Address
  createdAt: Date
  retryCount: number
  fraudScore?: number
}

interface Address {
  street: string
  city: string
  state: string
  zip: string
  country: string
}

interface ProcessingResult {
  success: boolean
  newStatus: OrderStatus
  message: string
  requiresManualReview?: boolean
}

export class OrderProcessor {
  private readonly MAX_RETRIES = 3
  private readonly FRAUD_THRESHOLD = 0.7
  private readonly HIGH_VALUE_THRESHOLD = 500
  private readonly EXPEDITED_COUNTRIES = ['US', 'CA', 'GB']

  async processOrder(order: Order): Promise<ProcessingResult> {
    switch (order.status) {
      case 'pending':
        return this.validateOrder(order)
      case 'validating':
        return this.runValidation(order)
      case 'payment_processing':
        return this.processPayment(order)
      case 'payment_failed':
        return this.handlePaymentFailure(order)
      case 'fraud_review':
        return this.reviewFraud(order)
      case 'approved':
        return this.prepareShipment(order)
      case 'preparing':
        return this.shipOrder(order)
      case 'shipped':
        return this.trackDelivery(order)
      default:
        return { success: false, newStatus: order.status, message: `No action for status: ${order.status}` }
    }
  }

  private async validateOrder(order: Order): Promise<ProcessingResult> {
    if (order.items.length === 0) {
      return { success: false, newStatus: 'cancelled', message: 'Order has no items' }
    }

    const calculatedTotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
    if (Math.abs(calculatedTotal - order.total) > 0.01) {
      return { success: false, newStatus: 'cancelled', message: 'Total mismatch' }
    }

    if (!this.isValidAddress(order.shippingAddress)) {
      return { success: false, newStatus: 'pending', message: 'Invalid shipping address' }
    }

    const inventoryAvailable = await this.checkInventory(order.items)
    if (!inventoryAvailable) {
      return { success: false, newStatus: 'pending', message: 'Items out of stock' }
    }

    return { success: true, newStatus: 'validating', message: 'Order validated, proceeding to payment' }
  }

  private async runValidation(order: Order): Promise<ProcessingResult> {
    const fraudScore = await this.calculateFraudScore(order)
    order.fraudScore = fraudScore

    if (fraudScore > this.FRAUD_THRESHOLD) {
      return {
        success: false,
        newStatus: 'fraud_review',
        message: `High fraud score: ${fraudScore}`,
        requiresManualReview: true
      }
    }

    if (order.total > this.HIGH_VALUE_THRESHOLD && fraudScore > 0.4) {
      return {
        success: false,
        newStatus: 'fraud_review',
        message: 'High-value order with moderate fraud risk',
        requiresManualReview: true
      }
    }

    return { success: true, newStatus: 'payment_processing', message: 'Validation passed' }
  }

  private async processPayment(order: Order): Promise<ProcessingResult> {
    try {
      const paymentResult = await this.chargePayment(order)

      if (paymentResult.declined) {
        return { success: false, newStatus: 'payment_failed', message: paymentResult.reason }
      }

      if (paymentResult.pending) {
        return { success: true, newStatus: 'payment_processing', message: 'Payment pending confirmation' }
      }

      return { success: true, newStatus: 'approved', message: 'Payment successful' }
    } catch (error) {
      return { success: false, newStatus: 'payment_failed', message: `Payment error: ${error}` }
    }
  }

  private async handlePaymentFailure(order: Order): Promise<ProcessingResult> {
    if (order.retryCount >= this.MAX_RETRIES) {
      await this.notifyCustomer(order.customerId, 'payment_failed_final')
      return { success: false, newStatus: 'cancelled', message: 'Max payment retries exceeded' }
    }

    order.retryCount++

    if (order.paymentMethod === 'credit_card') {
      const hasAlternative = await this.checkAlternativePayment(order.customerId)
      if (hasAlternative) {
        await this.notifyCustomer(order.customerId, 'try_alternative_payment')
        return { success: false, newStatus: 'pending', message: 'Suggested alternative payment' }
      }
    }

    await this.delay(Math.pow(2, order.retryCount) * 1000)
    return { success: true, newStatus: 'payment_processing', message: `Retrying payment (attempt ${order.retryCount})` }
  }

  private async reviewFraud(order: Order): Promise<ProcessingResult> {
    const manualResult = await this.getManualReviewResult(order.id)

    if (!manualResult) {
      return { success: false, newStatus: 'fraud_review', message: 'Awaiting manual review' }
    }

    if (manualResult.approved) {
      return { success: true, newStatus: 'payment_processing', message: 'Fraud review passed' }
    }

    await this.flagCustomer(order.customerId, 'fraud_suspected')
    await this.notifyCustomer(order.customerId, 'order_cancelled_fraud')
    return { success: false, newStatus: 'cancelled', message: 'Cancelled due to fraud review' }
  }

  private async prepareShipment(order: Order): Promise<ProcessingResult> {
    const isExpedited = this.EXPEDITED_COUNTRIES.includes(order.shippingAddress.country)

    if (isExpedited && order.total > 100) {
      await this.assignToWarehouse(order, 'priority')
    } else if (isExpedited) {
      await this.assignToWarehouse(order, 'standard')
    } else {
      const nearestWarehouse = await this.findNearestInternationalWarehouse(order.shippingAddress.country)
      if (!nearestWarehouse) {
        return { success: false, newStatus: 'approved', message: 'No warehouse available for country' }
      }
      await this.assignToWarehouse(order, nearestWarehouse)
    }

    await this.reserveInventory(order.items)
    await this.generateShippingLabel(order)

    return { success: true, newStatus: 'preparing', message: 'Shipment being prepared' }
  }

  private async shipOrder(order: Order): Promise<ProcessingResult> {
    const trackingNumber = await this.getTrackingNumber(order.id)
    if (!trackingNumber) {
      return { success: false, newStatus: 'preparing', message: 'Tracking number not yet assigned' }
    }

    await this.notifyCustomer(order.customerId, 'order_shipped', { trackingNumber })
    return { success: true, newStatus: 'shipped', message: `Shipped with tracking: ${trackingNumber}` }
  }

  private async trackDelivery(order: Order): Promise<ProcessingResult> {
    const deliveryStatus = await this.checkDeliveryStatus(order.id)

    if (deliveryStatus === 'delivered') {
      await this.notifyCustomer(order.customerId, 'order_delivered')
      return { success: true, newStatus: 'delivered', message: 'Order delivered' }
    }

    if (deliveryStatus === 'lost') {
      await this.initiateInvestigation(order.id)
      return { success: false, newStatus: 'shipped', message: 'Package may be lost, investigating' }
    }

    return { success: true, newStatus: 'shipped', message: `In transit: ${deliveryStatus}` }
  }

  // Helper stubs
  private isValidAddress(addr: Address): boolean {
    return !!(addr.street && addr.city && addr.state && addr.zip && addr.country)
  }
  private async checkInventory(_items: Order['items']): Promise<boolean> { return true }
  private async calculateFraudScore(_order: Order): Promise<number> { return 0.1 }
  private async chargePayment(_order: Order): Promise<{ declined: boolean; pending: boolean; reason: string }> {
    return { declined: false, pending: false, reason: '' }
  }
  private async notifyCustomer(_customerId: string, _event: string, _data?: Record<string, string>): Promise<void> {}
  private async checkAlternativePayment(_customerId: string): Promise<boolean> { return false }
  private async getManualReviewResult(_orderId: string): Promise<{ approved: boolean } | null> { return null }
  private async flagCustomer(_customerId: string, _reason: string): Promise<void> {}
  private async assignToWarehouse(_order: Order, _warehouse: string): Promise<void> {}
  private async findNearestInternationalWarehouse(_country: string): Promise<string | null> { return 'intl-1' }
  private async reserveInventory(_items: Order['items']): Promise<void> {}
  private async generateShippingLabel(_order: Order): Promise<void> {}
  private async getTrackingNumber(_orderId: string): Promise<string | null> { return null }
  private async checkDeliveryStatus(_orderId: string): Promise<string> { return 'in_transit' }
  private async initiateInvestigation(_orderId: string): Promise<void> {}
  private delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }
}
