import { LedgerService } from './ledger/LedgerService'
import { PaymentGateway } from './gateways/PaymentGateway'
import { BankingService } from '../banking/BankingService'
import { TaxService } from '../tax/TaxService'
import { ReconciliationEngine } from './ReconciliationEngine'
import { WebhookDispatcher } from '../webhooks/WebhookDispatcher'
import { AuditLogger } from '../audit/AuditLogger'

interface SettlementBatch {
  batchId: string
  merchantId: string
  transactions: SettlementTransaction[]
  totalAmount: number
  currency: string
  settlementDate: Date
  status: 'pending' | 'processing' | 'settled' | 'failed' | 'partially_settled'
}

interface SettlementTransaction {
  transactionId: string
  amount: number
  fee: number
  netAmount: number
  capturedAt: Date
}

interface SettlementResult {
  batchId: string
  settledCount: number
  failedCount: number
  totalSettled: number
  totalFees: number
  bankTransferId: string
  reconciliationId: string
}

export class SettlementProcessor {
  private ledger: LedgerService
  private gateway: PaymentGateway
  private banking: BankingService
  private tax: TaxService
  private reconciliation: ReconciliationEngine
  private webhooks: WebhookDispatcher
  private audit: AuditLogger

  constructor(
    ledger: LedgerService,
    gateway: PaymentGateway,
    banking: BankingService,
    tax: TaxService,
    reconciliation: ReconciliationEngine,
    webhooks: WebhookDispatcher,
    audit: AuditLogger,
  ) {
    this.ledger = ledger
    this.gateway = gateway
    this.banking = banking
    this.tax = tax
    this.reconciliation = reconciliation
    this.webhooks = webhooks
    this.audit = audit
  }

  async processSettlementBatch(merchantId: string, date: Date): Promise<SettlementResult> {
    // Step 1: Gather all unsettled captured transactions from ledger
    const unsettledTransactions = await this.ledger.getUnsettledTransactions(merchantId, date)
    if (unsettledTransactions.length === 0) {
      throw new Error(`No unsettled transactions for merchant ${merchantId} on ${date.toISOString()}`)
    }

    // Step 2: Fetch gateway settlement report and reconcile
    const gatewayReport = await this.gateway.getSettlementReport({
      merchantAccountId: merchantId,
      date,
    })

    const reconciliationResult = await this.reconciliation.reconcile(
      unsettledTransactions,
      gatewayReport.transactions,
    )

    if (reconciliationResult.discrepancies.length > 0) {
      await this.audit.log('settlement.discrepancies_found', {
        merchantId,
        discrepancyCount: reconciliationResult.discrepancies.length,
        discrepancies: reconciliationResult.discrepancies,
      })
    }

    // Step 3: Calculate fees and taxes for each transaction
    const transactionsWithFees = await Promise.all(
      reconciliationResult.matchedTransactions.map(async (txn) => {
        const feeBreakdown = await this.tax.calculateTransactionFees({
          merchantId,
          transactionId: txn.transactionId,
          amount: txn.amount,
          currency: txn.currency,
          paymentMethod: txn.paymentMethod,
          merchantCountry: txn.merchantCountry,
          customerCountry: txn.customerCountry,
        })

        return {
          transactionId: txn.transactionId,
          amount: txn.amount,
          fee: feeBreakdown.totalFee,
          netAmount: txn.amount - feeBreakdown.totalFee,
          capturedAt: txn.capturedAt,
          taxBreakdown: feeBreakdown,
        }
      })
    )

    // Step 4: Create settlement batch in ledger
    const totalNet = transactionsWithFees.reduce((sum, t) => sum + t.netAmount, 0)
    const totalFees = transactionsWithFees.reduce((sum, t) => sum + t.fee, 0)

    const batch: SettlementBatch = {
      batchId: `stl_${Date.now()}_${merchantId}`,
      merchantId,
      transactions: transactionsWithFees,
      totalAmount: totalNet,
      currency: unsettledTransactions[0].currency,
      settlementDate: date,
      status: 'processing',
    }

    await this.ledger.createSettlementBatch(batch)

    // Step 5: Initiate bank transfer to merchant
    let bankTransfer
    try {
      bankTransfer = await this.banking.initiateTransfer({
        recipientId: merchantId,
        amount: totalNet,
        currency: batch.currency,
        reference: batch.batchId,
        description: `Settlement for ${date.toISOString().split('T')[0]}`,
      })
    } catch (error) {
      await this.ledger.updateBatchStatus(batch.batchId, 'failed')
      await this.webhooks.dispatch(merchantId, 'settlement.failed', {
        batchId: batch.batchId,
        error: (error as Error).message,
      })
      throw error
    }

    // Step 6: Record the settlement in ledger and finalize
    await this.ledger.finalizeSettlement(batch.batchId, {
      bankTransferId: bankTransfer.transferId,
      settledAt: new Date(),
    })

    // Step 7: Create reconciliation record
    const reconRecord = await this.reconciliation.createRecord({
      batchId: batch.batchId,
      merchantId,
      gatewayReportId: gatewayReport.reportId,
      matchedCount: reconciliationResult.matchedTransactions.length,
      discrepancyCount: reconciliationResult.discrepancies.length,
      totalReconciled: totalNet,
    })

    // Step 8: Notify merchant and dispatch webhooks
    await Promise.all([
      this.webhooks.dispatch(merchantId, 'settlement.completed', {
        batchId: batch.batchId,
        settledAmount: totalNet,
        transactionCount: transactionsWithFees.length,
        bankTransferId: bankTransfer.transferId,
      }),
      this.audit.log('settlement.completed', {
        batchId: batch.batchId,
        merchantId,
        totalSettled: totalNet,
        totalFees,
        transactionCount: transactionsWithFees.length,
      }),
    ])

    return {
      batchId: batch.batchId,
      settledCount: transactionsWithFees.length,
      failedCount: reconciliationResult.discrepancies.length,
      totalSettled: totalNet,
      totalFees,
      bankTransferId: bankTransfer.transferId,
      reconciliationId: reconRecord.id,
    }
  }
}
