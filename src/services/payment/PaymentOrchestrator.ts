import { PaymentGateway } from './gateways/PaymentGateway'
import { FraudDetectionService } from './fraud/FraudDetectionService'
import { LedgerService } from './ledger/LedgerService'
import { NotificationService } from '../notifications/NotificationService'
import { WebhookDispatcher } from '../webhooks/WebhookDispatcher'
import { AuditLogger } from '../audit/AuditLogger'
import { IdempotencyStore } from './IdempotencyStore'
import { CircuitBreaker } from '../../lib/CircuitBreaker'
import { RetryPolicy } from '../../lib/RetryPolicy'

interface PaymentRequest {
  merchantId: string
  customerId: string
  amount: number
  currency: string
  paymentMethod: PaymentMethod
  metadata?: Record<string, string>
  idempotencyKey: string
}

interface PaymentMethod {
  type: 'card' | 'bank_transfer' | 'wallet' | 'crypto'
  tokenId: string
  last4?: string
}

interface PaymentResult {
  transactionId: string
  status: 'succeeded' | 'failed' | 'pending_capture' | 'requires_action'
  gatewayResponse: GatewayResponse
  fraudScore: number
  ledgerEntryId: string
}

interface GatewayResponse {
  gatewayTransactionId: string
  authCode: string
  responseCode: string
  avsResult: string
  cvvResult: string
}

export class PaymentOrchestrator {
  private gateway: PaymentGateway
  private fraudService: FraudDetectionService
  private ledger: LedgerService
  private notifications: NotificationService
  private webhooks: WebhookDispatcher
  private audit: AuditLogger
  private idempotency: IdempotencyStore
  private gatewayBreaker: CircuitBreaker
  private retryPolicy: RetryPolicy

  constructor(
    gateway: PaymentGateway,
    fraudService: FraudDetectionService,
    ledger: LedgerService,
    notifications: NotificationService,
    webhooks: WebhookDispatcher,
    audit: AuditLogger,
    idempotency: IdempotencyStore,
  ) {
    this.gateway = gateway
    this.fraudService = fraudService
    this.ledger = ledger
    this.notifications = notifications
    this.webhooks = webhooks
    this.audit = audit
    this.idempotency = idempotency
    this.gatewayBreaker = new CircuitBreaker({ threshold: 5, resetTimeout: 30000 })
    this.retryPolicy = new RetryPolicy({ maxRetries: 3, backoffMs: 1000 })
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Step 1: Idempotency check — return cached result if already processed
    const cachedResult = await this.idempotency.get(request.idempotencyKey)
    if (cachedResult) {
      await this.audit.log('payment.idempotent_hit', { key: request.idempotencyKey })
      return cachedResult as PaymentResult
    }

    // Step 2: Fraud screening — call fraud service with customer + payment context
    const fraudAssessment = await this.fraudService.evaluate({
      customerId: request.customerId,
      merchantId: request.merchantId,
      amount: request.amount,
      currency: request.currency,
      paymentMethod: request.paymentMethod,
      ipAddress: request.metadata?.ipAddress,
      deviceFingerprint: request.metadata?.deviceFingerprint,
    })

    if (fraudAssessment.decision === 'reject') {
      await this.audit.log('payment.fraud_rejected', {
        customerId: request.customerId,
        fraudScore: fraudAssessment.score,
        reasons: fraudAssessment.reasons,
      })
      await this.notifications.sendToMerchant(request.merchantId, {
        type: 'payment_declined',
        reason: 'fraud_screening',
        transactionRef: request.idempotencyKey,
      })
      await this.webhooks.dispatch(request.merchantId, 'payment.fraud_blocked', {
        idempotencyKey: request.idempotencyKey,
        fraudScore: fraudAssessment.score,
      })
      throw new PaymentDeclinedError('Payment rejected by fraud screening', fraudAssessment)
    }

    // Step 3: Reserve funds in ledger before gateway call
    const reservation = await this.ledger.reserveFunds({
      merchantId: request.merchantId,
      customerId: request.customerId,
      amount: request.amount,
      currency: request.currency,
    })

    // Step 4: Process through payment gateway with circuit breaker + retry
    let gatewayResponse: GatewayResponse
    try {
      gatewayResponse = await this.gatewayBreaker.execute(() =>
        this.retryPolicy.execute(() =>
          this.gateway.authorize({
            amount: request.amount,
            currency: request.currency,
            paymentMethodToken: request.paymentMethod.tokenId,
            merchantAccountId: request.merchantId,
            metadata: {
              reservationId: reservation.id,
              fraudScore: String(fraudAssessment.score),
            },
          })
        )
      )
    } catch (error) {
      // Gateway failed — release the ledger reservation
      await this.ledger.releaseReservation(reservation.id)
      await this.audit.log('payment.gateway_failure', {
        error: (error as Error).message,
        reservationId: reservation.id,
      })
      await this.webhooks.dispatch(request.merchantId, 'payment.gateway_error', {
        idempotencyKey: request.idempotencyKey,
        error: (error as Error).message,
      })
      throw new GatewayError('Payment gateway authorization failed', error as Error)
    }

    // Step 5: Confirm the ledger entry now that gateway succeeded
    const ledgerEntry = await this.ledger.confirmReservation(reservation.id, {
      gatewayTransactionId: gatewayResponse.gatewayTransactionId,
      authCode: gatewayResponse.authCode,
    })

    // Step 6: Build result and cache for idempotency
    const result: PaymentResult = {
      transactionId: ledgerEntry.transactionId,
      status: this.mapGatewayStatus(gatewayResponse.responseCode),
      gatewayResponse,
      fraudScore: fraudAssessment.score,
      ledgerEntryId: ledgerEntry.id,
    }
    await this.idempotency.set(request.idempotencyKey, result, { ttlSeconds: 86400 })

    // Step 7: Fan out notifications and webhooks
    await Promise.all([
      this.notifications.sendToCustomer(request.customerId, {
        type: 'payment_receipt',
        amount: request.amount,
        currency: request.currency,
        last4: request.paymentMethod.last4,
        transactionId: result.transactionId,
      }),
      this.notifications.sendToMerchant(request.merchantId, {
        type: 'payment_received',
        amount: request.amount,
        currency: request.currency,
        transactionId: result.transactionId,
      }),
      this.webhooks.dispatch(request.merchantId, 'payment.completed', {
        transactionId: result.transactionId,
        amount: request.amount,
        currency: request.currency,
        status: result.status,
      }),
      this.audit.log('payment.completed', {
        transactionId: result.transactionId,
        merchantId: request.merchantId,
        customerId: request.customerId,
        amount: request.amount,
        fraudScore: fraudAssessment.score,
      }),
    ])

    return result
  }

  async capturePayment(transactionId: string, amount?: number): Promise<void> {
    const transaction = await this.ledger.getTransaction(transactionId)
    if (!transaction) throw new Error(`Transaction ${transactionId} not found`)

    const captureAmount = amount ?? transaction.authorizedAmount
    const captureResponse = await this.gateway.capture({
      gatewayTransactionId: transaction.gatewayTransactionId,
      amount: captureAmount,
    })

    await this.ledger.recordCapture(transactionId, {
      capturedAmount: captureAmount,
      captureId: captureResponse.captureId,
    })

    await this.webhooks.dispatch(transaction.merchantId, 'payment.captured', {
      transactionId,
      capturedAmount: captureAmount,
    })
  }

  async refundPayment(transactionId: string, amount: number, reason: string): Promise<string> {
    const transaction = await this.ledger.getTransaction(transactionId)
    if (!transaction) throw new Error(`Transaction ${transactionId} not found`)

    if (amount > transaction.capturedAmount) {
      throw new Error(`Refund amount ${amount} exceeds captured amount ${transaction.capturedAmount}`)
    }

    const refundResponse = await this.gateway.refund({
      gatewayTransactionId: transaction.gatewayTransactionId,
      amount,
      reason,
    })

    const refundEntry = await this.ledger.recordRefund(transactionId, {
      refundAmount: amount,
      refundId: refundResponse.refundId,
      reason,
    })

    await Promise.all([
      this.notifications.sendToCustomer(transaction.customerId, {
        type: 'refund_processed',
        amount,
        currency: transaction.currency,
        transactionId,
      }),
      this.webhooks.dispatch(transaction.merchantId, 'payment.refunded', {
        transactionId,
        refundAmount: amount,
        refundId: refundEntry.id,
      }),
      this.audit.log('payment.refunded', {
        transactionId,
        refundAmount: amount,
        reason,
        merchantId: transaction.merchantId,
      }),
    ])

    return refundEntry.id
  }

  private mapGatewayStatus(responseCode: string): PaymentResult['status'] {
    switch (responseCode) {
      case '00': return 'succeeded'
      case '01': return 'pending_capture'
      case '3D': return 'requires_action'
      default: return 'failed'
    }
  }
}

class PaymentDeclinedError extends Error {
  constructor(message: string, public assessment: any) {
    super(message)
    this.name = 'PaymentDeclinedError'
  }
}

class GatewayError extends Error {
  constructor(message: string, public cause: Error) {
    super(message)
    this.name = 'GatewayError'
  }
}
