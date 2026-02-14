import type { Order } from './order-processor'

type RefundReason = 'customer_request' | 'defective' | 'wrong_item' | 'not_delivered' | 'duplicate_charge'
type RefundMethod = 'original_payment' | 'store_credit' | 'bank_transfer'

interface RefundRequest {
  orderId: string
  reason: RefundReason
  amount: number
  fullRefund: boolean
  evidence?: string[]
}

interface RefundResult {
  approved: boolean
  method: RefundMethod
  amount: number
  message: string
}

export class RefundHandler {
  private readonly AUTO_APPROVE_THRESHOLD = 50
  private readonly DAYS_SINCE_DELIVERY_LIMIT = 30
  private readonly ABUSE_REFUND_COUNT = 5

  async processRefund(request: RefundRequest, order: Order): Promise<RefundResult> {
    // Step 1: Check eligibility
    const eligibility = await this.checkEligibility(request, order)
    if (!eligibility.eligible) {
      return { approved: false, method: 'original_payment', amount: 0, message: eligibility.reason }
    }

    // Step 2: Determine if auto-approvable
    if (this.canAutoApprove(request, order)) {
      return this.executeAutoRefund(request, order)
    }

    // Step 3: Route to appropriate review queue
    if (request.reason === 'defective' || request.reason === 'wrong_item') {
      if (request.evidence && request.evidence.length > 0) {
        const verificationResult = await this.verifyEvidence(request.evidence)
        if (verificationResult.valid) {
          return this.executeAutoRefund(request, order)
        }
        return { approved: false, method: 'original_payment', amount: 0, message: 'Evidence could not be verified' }
      }
      return { approved: false, method: 'original_payment', amount: 0, message: 'Evidence required for defective/wrong item claims' }
    }

    if (request.reason === 'not_delivered') {
      const deliveryConfirmed = await this.confirmDelivery(request.orderId)
      if (!deliveryConfirmed) {
        return this.executeAutoRefund(request, order)
      }
      return { approved: false, method: 'store_credit', amount: request.amount * 0.5, message: 'Delivery confirmed — partial store credit offered' }
    }

    if (request.reason === 'duplicate_charge') {
      const isDuplicate = await this.verifyDuplicateCharge(request.orderId)
      if (isDuplicate) {
        return { approved: true, method: 'original_payment', amount: request.amount, message: 'Duplicate charge confirmed — full refund' }
      }
      return { approved: false, method: 'original_payment', amount: 0, message: 'No duplicate charge found' }
    }

    // Customer request: check abuse patterns
    const abuseScore = await this.checkAbusePattern(order.customerId)
    if (abuseScore > this.ABUSE_REFUND_COUNT) {
      return { approved: false, method: 'store_credit', amount: request.amount * 0.7, message: 'Frequent refund pattern — partial store credit offered' }
    }

    return { approved: true, method: 'store_credit', amount: request.amount, message: 'Refund approved as store credit' }
  }

  private async checkEligibility(request: RefundRequest, order: Order): Promise<{ eligible: boolean; reason: string }> {
    if (order.status === 'cancelled') {
      return { eligible: false, reason: 'Order already cancelled' }
    }

    if (order.status === 'refunded') {
      return { eligible: false, reason: 'Order already refunded' }
    }

    if (order.status === 'pending' || order.status === 'validating') {
      return { eligible: false, reason: 'Order not yet processed — cancel instead' }
    }

    if (request.amount > order.total) {
      return { eligible: false, reason: 'Refund amount exceeds order total' }
    }

    if (order.status === 'delivered') {
      const daysSinceDelivery = this.daysSince(order.createdAt)
      if (daysSinceDelivery > this.DAYS_SINCE_DELIVERY_LIMIT) {
        return { eligible: false, reason: `Refund window expired (${daysSinceDelivery} days since delivery)` }
      }
    }

    return { eligible: true, reason: '' }
  }

  private canAutoApprove(request: RefundRequest, order: Order): boolean {
    if (!request.fullRefund && request.amount <= this.AUTO_APPROVE_THRESHOLD) {
      return true
    }

    if (request.reason === 'duplicate_charge') {
      return false // always needs verification
    }

    if (order.total <= this.AUTO_APPROVE_THRESHOLD && request.fullRefund) {
      return true
    }

    return false
  }

  private async executeAutoRefund(request: RefundRequest, order: Order): Promise<RefundResult> {
    const method: RefundMethod = order.status === 'delivered' ? 'original_payment' : 'original_payment'

    await this.issueRefund(request.orderId, request.amount, method)
    await this.notifyCustomer(order.customerId, request.amount, method)

    return { approved: true, method, amount: request.amount, message: 'Auto-approved refund processed' }
  }

  // Helper stubs
  private async verifyEvidence(_evidence: string[]): Promise<{ valid: boolean }> { return { valid: true } }
  private async confirmDelivery(_orderId: string): Promise<boolean> { return true }
  private async verifyDuplicateCharge(_orderId: string): Promise<boolean> { return false }
  private async checkAbusePattern(_customerId: string): Promise<number> { return 0 }
  private async issueRefund(_orderId: string, _amount: number, _method: RefundMethod): Promise<void> {}
  private async notifyCustomer(_customerId: string, _amount: number, _method: RefundMethod): Promise<void> {}
  private daysSince(date: Date): number { return Math.floor((Date.now() - date.getTime()) / 86400000) }
}
