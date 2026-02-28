import { InventoryService } from '../inventory/InventoryService'
import { ShippingService, type ShippingQuote } from '../shipping/ShippingService'
import { PaymentService } from '../payment/PaymentService'
import { FraudService } from '../fraud/FraudService'
import { NotificationService } from '../notifications/NotificationService'
import { AuditLogger } from '../audit/AuditLogger'

// ─── Order State Machine ─────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending_validation'
  | 'validating_inventory'
  | 'inventory_reserved'
  | 'pending_fraud_check'
  | 'fraud_review'
  | 'fraud_cleared'
  | 'pending_payment'
  | 'payment_authorized'
  | 'pending_fulfillment'
  | 'picking'
  | 'packing'
  | 'awaiting_carrier'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'return_requested'
  | 'return_in_transit'
  | 'returned'
  | 'refund_pending'
  | 'refunded'
  | 'failed'
  | 'on_hold'

interface Order {
  id: string
  customerId: string
  items: OrderItem[]
  shippingAddress: Address
  billingAddress: Address
  paymentMethodId: string
  status: OrderStatus
  totalAmount: number
  currency: string
  metadata: Record<string, string>
  createdAt: Date
  updatedAt: Date
}

interface OrderItem {
  productId: string
  sku: string
  quantity: number
  unitPrice: number
  warehouseId?: string
}

interface Address {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

interface FulfillmentResult {
  orderId: string
  status: OrderStatus
  trackingNumber?: string
  estimatedDelivery?: Date
  error?: string
}

// ─── State Machine Transition Map ────────────────────────────────────────────

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_validation: ['validating_inventory', 'cancelled', 'failed'],
  validating_inventory: ['inventory_reserved', 'failed', 'on_hold'],
  inventory_reserved: ['pending_fraud_check', 'cancelled'],
  pending_fraud_check: ['fraud_cleared', 'fraud_review', 'cancelled'],
  fraud_review: ['fraud_cleared', 'cancelled'],
  fraud_cleared: ['pending_payment'],
  pending_payment: ['payment_authorized', 'failed', 'cancelled'],
  payment_authorized: ['pending_fulfillment', 'cancelled'],
  pending_fulfillment: ['picking', 'on_hold', 'cancelled'],
  picking: ['packing', 'on_hold', 'cancelled'],
  packing: ['awaiting_carrier', 'on_hold'],
  awaiting_carrier: ['shipped', 'on_hold'],
  shipped: ['in_transit'],
  in_transit: ['out_for_delivery', 'return_requested'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: ['return_requested'],
  cancelled: ['refund_pending'],
  return_requested: ['return_in_transit', 'cancelled'],
  return_in_transit: ['returned'],
  returned: ['refund_pending'],
  refund_pending: ['refunded', 'failed'],
  refunded: [],
  failed: ['pending_validation', 'cancelled'],
  on_hold: ['pending_fulfillment', 'picking', 'packing', 'awaiting_carrier', 'cancelled'],
}

// ─── Fulfillment Engine ──────────────────────────────────────────────────────

export class OrderFulfillmentEngine {
  private inventory: InventoryService
  private shipping: ShippingService
  private payment: PaymentService
  private fraud: FraudService
  private notifications: NotificationService
  private audit: AuditLogger

  constructor(
    inventory: InventoryService,
    shipping: ShippingService,
    payment: PaymentService,
    fraud: FraudService,
    notifications: NotificationService,
    audit: AuditLogger,
  ) {
    this.inventory = inventory
    this.shipping = shipping
    this.payment = payment
    this.fraud = fraud
    this.notifications = notifications
    this.audit = audit
  }

  async processOrder(order: Order): Promise<FulfillmentResult> {
    try {
      // Phase 1: Validate and reserve inventory
      await this.transition(order, 'validating_inventory')
      const reservationResult = await this.reserveInventory(order)

      if (!reservationResult.success) {
        if (reservationResult.partialAvailability) {
          await this.transition(order, 'on_hold')
          await this.notifications.send(order.customerId, {
            type: 'order_partial_stock',
            orderId: order.id,
            unavailableItems: reservationResult.unavailableItems,
          })
          return { orderId: order.id, status: order.status, error: 'Partial inventory availability' }
        }
        await this.transition(order, 'failed')
        return { orderId: order.id, status: order.status, error: 'Inventory unavailable' }
      }

      await this.transition(order, 'inventory_reserved')

      // Phase 2: Fraud screening
      await this.transition(order, 'pending_fraud_check')
      const fraudResult = await this.fraud.screenOrder({
        orderId: order.id,
        customerId: order.customerId,
        amount: order.totalAmount,
        currency: order.currency,
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
        items: order.items,
        metadata: order.metadata,
      })

      if (fraudResult.decision === 'reject') {
        await this.transition(order, 'cancelled')
        await this.releaseInventory(order)
        await this.notifications.send(order.customerId, {
          type: 'order_cancelled',
          orderId: order.id,
          reason: 'Unable to process order',
        })
        return { orderId: order.id, status: order.status, error: 'Fraud screening rejected' }
      }

      if (fraudResult.decision === 'review') {
        await this.transition(order, 'fraud_review')
        await this.notifications.sendToOps({
          type: 'fraud_review_required',
          orderId: order.id,
          fraudScore: fraudResult.score,
          reasons: fraudResult.reasons,
        })
        return { orderId: order.id, status: order.status }
      }

      await this.transition(order, 'fraud_cleared')

      // Phase 3: Payment authorization
      await this.transition(order, 'pending_payment')
      const paymentResult = await this.payment.authorize({
        orderId: order.id,
        amount: order.totalAmount,
        currency: order.currency,
        paymentMethodId: order.paymentMethodId,
        customerId: order.customerId,
      })

      if (!paymentResult.success) {
        await this.transition(order, 'failed')
        await this.releaseInventory(order)
        await this.notifications.send(order.customerId, {
          type: 'payment_failed',
          orderId: order.id,
        })
        return { orderId: order.id, status: order.status, error: 'Payment authorization failed' }
      }

      await this.transition(order, 'payment_authorized')

      // Phase 4: Fulfillment pipeline
      await this.transition(order, 'pending_fulfillment')

      // Picking: Assign warehouse workers to collect items
      await this.transition(order, 'picking')
      const pickResult = await this.inventory.createPickList(order.id, order.items)

      if (!pickResult.allItemsPicked) {
        await this.transition(order, 'on_hold')
        await this.audit.log('fulfillment.pick_incomplete', {
          orderId: order.id,
          missingItems: pickResult.missingItems,
        })
        return { orderId: order.id, status: order.status, error: 'Picking incomplete' }
      }

      // Packing: Package items for shipping
      await this.transition(order, 'packing')
      const packResult = await this.inventory.packOrder(order.id, {
        items: order.items,
        shippingAddress: order.shippingAddress,
      })

      // Get shipping quote and schedule carrier pickup
      await this.transition(order, 'awaiting_carrier')
      const shippingQuote = await this.selectBestShippingOption(order)
      const shipment = await this.shipping.createShipment({
        orderId: order.id,
        packageId: packResult.packageId,
        carrier: shippingQuote.carrier,
        serviceLevel: shippingQuote.serviceLevel,
        origin: packResult.warehouseAddress,
        destination: order.shippingAddress,
        weight: packResult.totalWeight,
        dimensions: packResult.dimensions,
      })

      // Capture payment now that we're shipping
      await this.payment.capture({
        authorizationId: paymentResult.authorizationId,
        amount: order.totalAmount,
      })

      await this.transition(order, 'shipped')

      // Send shipment confirmation
      await this.notifications.send(order.customerId, {
        type: 'order_shipped',
        orderId: order.id,
        trackingNumber: shipment.trackingNumber,
        carrier: shippingQuote.carrier,
        estimatedDelivery: shipment.estimatedDelivery,
      })

      await this.audit.log('fulfillment.shipped', {
        orderId: order.id,
        trackingNumber: shipment.trackingNumber,
        carrier: shippingQuote.carrier,
      })

      return {
        orderId: order.id,
        status: order.status,
        trackingNumber: shipment.trackingNumber,
        estimatedDelivery: shipment.estimatedDelivery,
      }
    } catch (error) {
      await this.handleProcessingError(order, error as Error)
      return {
        orderId: order.id,
        status: order.status,
        error: (error as Error).message,
      }
    }
  }

  async processReturn(order: Order, returnReason: string): Promise<FulfillmentResult> {
    if (order.status !== 'delivered' && order.status !== 'in_transit') {
      throw new Error(`Cannot initiate return for order in status: ${order.status}`)
    }

    await this.transition(order, 'return_requested')

    // Generate return shipping label
    const returnLabel = await this.shipping.createReturnLabel({
      orderId: order.id,
      origin: order.shippingAddress,
      destination: await this.inventory.getNearestReturnCenter(order.shippingAddress),
    })

    await this.notifications.send(order.customerId, {
      type: 'return_approved',
      orderId: order.id,
      returnLabel: returnLabel.labelUrl,
      trackingNumber: returnLabel.trackingNumber,
    })

    await this.audit.log('fulfillment.return_initiated', {
      orderId: order.id,
      reason: returnReason,
    })

    return {
      orderId: order.id,
      status: order.status,
      trackingNumber: returnLabel.trackingNumber,
    }
  }

  async processReturnReceived(order: Order): Promise<FulfillmentResult> {
    await this.transition(order, 'returned')

    // Inspect returned items and restock if in good condition
    const inspection = await this.inventory.inspectReturn(order.id, order.items)

    if (inspection.restockable) {
      await this.inventory.restockItems(order.items, inspection.warehouseId)
    }

    // Initiate refund
    await this.transition(order, 'refund_pending')
    const refundResult = await this.payment.refund({
      orderId: order.id,
      amount: order.totalAmount,
      reason: 'return',
    })

    if (refundResult.success) {
      await this.transition(order, 'refunded')
      await this.notifications.send(order.customerId, {
        type: 'refund_processed',
        orderId: order.id,
        amount: order.totalAmount,
      })
    } else {
      await this.transition(order, 'failed')
    }

    return { orderId: order.id, status: order.status }
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────────

  private async transition(order: Order, newStatus: OrderStatus): Promise<void> {
    const allowed = VALID_TRANSITIONS[order.status]
    if (!allowed?.includes(newStatus)) {
      throw new InvalidTransitionError(order.id, order.status, newStatus)
    }

    const previousStatus = order.status
    order.status = newStatus
    order.updatedAt = new Date()

    await this.audit.log('order.status_changed', {
      orderId: order.id,
      from: previousStatus,
      to: newStatus,
    })
  }

  private async reserveInventory(order: Order): Promise<InventoryReservation> {
    const results = await Promise.all(
      order.items.map((item) =>
        this.inventory.reserve({
          productId: item.productId,
          sku: item.sku,
          quantity: item.quantity,
          orderId: order.id,
        })
      )
    )

    const allReserved = results.every((r) => r.reserved)
    const unavailable = results.filter((r) => !r.reserved).map((r) => r.sku)
    const partial = !allReserved && results.some((r) => r.reserved)

    return {
      success: allReserved,
      partialAvailability: partial,
      unavailableItems: unavailable,
    }
  }

  private async releaseInventory(order: Order): Promise<void> {
    await Promise.all(
      order.items.map((item) =>
        this.inventory.release({ orderId: order.id, sku: item.sku })
      )
    )
  }

  private async selectBestShippingOption(order: Order): Promise<ShippingQuote> {
    const quotes = await this.shipping.getQuotes({
      origin: order.items[0].warehouseId!,
      destination: order.shippingAddress,
      weight: order.items.reduce((sum, i) => sum + i.quantity * 0.5, 0), // Estimated weight
      priority: order.metadata.shippingPriority ?? 'standard',
    })

    if (quotes.length === 0) {
      throw new Error(`No shipping options available for order ${order.id}`)
    }

    // Select cheapest option that meets delivery deadline
    const deadline = order.metadata.deliveryDeadline
      ? new Date(order.metadata.deliveryDeadline)
      : undefined

    if (deadline) {
      const eligible = quotes.filter(
        (q) => new Date(q.estimatedDelivery) <= deadline
      )
      if (eligible.length > 0) {
        return eligible.sort((a, b) => a.cost - b.cost)[0]
      }
    }

    return quotes.sort((a, b) => a.cost - b.cost)[0]
  }

  private async handleProcessingError(order: Order, error: Error): Promise<void> {
    this.audit.log('fulfillment.error', {
      orderId: order.id,
      status: order.status,
      error: error.message,
      stack: error.stack,
    })

    // Attempt to release inventory if we reserved it
    if (['inventory_reserved', 'pending_fraud_check', 'fraud_cleared', 'pending_payment'].includes(order.status)) {
      try {
        await this.releaseInventory(order)
      } catch (releaseError) {
        this.audit.log('fulfillment.release_failed', {
          orderId: order.id,
          error: (releaseError as Error).message,
        })
      }
    }

    // Move to failed state if possible
    if (VALID_TRANSITIONS[order.status]?.includes('failed')) {
      order.status = 'failed'
    }

    await this.notifications.send(order.customerId, {
      type: 'order_error',
      orderId: order.id,
    })
  }
}

// ─── Error Types ─────────────────────────────────────────────────────────────

class InvalidTransitionError extends Error {
  constructor(orderId: string, from: OrderStatus, to: OrderStatus) {
    super(`Invalid transition for order ${orderId}: ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

// ─── Supporting Types ────────────────────────────────────────────────────────

interface InventoryReservation {
  success: boolean
  partialAvailability: boolean
  unavailableItems: string[]
}
