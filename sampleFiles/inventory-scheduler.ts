import { InventorySyncService } from './inventory-sync'
import { MetricsCollector } from '../telemetry/metrics'

interface SchedulerConfig {
  fullSyncIntervalMs: number
  skuSyncTimeoutMs: number
  maxRetries: number
}

/**
 * Manages scheduled inventory synchronization jobs.
 * Coordinates between the sync service, cron scheduling, and monitoring.
 */
export class InventoryScheduler {
  private syncService: InventorySyncService
  private metrics: MetricsCollector
  private config: SchedulerConfig
  private isRunning = false

  constructor(
    syncService: InventorySyncService,
    metrics: MetricsCollector,
    config: SchedulerConfig
  ) {
    this.syncService = syncService
    this.metrics = metrics
    this.config = config
  }

  async startFullSync(): Promise<void> {
    if (this.isRunning) {
      console.warn('Sync already in progress, skipping')
      return
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      this.metrics.increment('inventory.sync.started')
      const result = await this.syncService.syncAllWarehouses()

      this.metrics.gauge('inventory.sync.synced', result.synced)
      this.metrics.gauge('inventory.sync.failed', result.failed)
      this.metrics.gauge('inventory.sync.skipped', result.skipped)
      this.metrics.timing('inventory.sync.duration', Date.now() - startTime)

      console.log(`Inventory sync complete: ${result.synced} synced, ${result.failed} failed`)
    } catch (error) {
      this.metrics.increment('inventory.sync.error')
      throw error
    } finally {
      this.isRunning = false
    }
  }

  async handleSkuSyncRequest(sku: string): Promise<void> {
    const timer = setTimeout(() => {
      console.error(`SKU sync timed out for ${sku}`)
      this.metrics.increment('inventory.sku_sync.timeout')
    }, this.config.skuSyncTimeoutMs)

    try {
      const items = await this.syncService.syncSingleSku(sku)
      this.metrics.gauge('inventory.sku_sync.warehouses', items.length)
    } finally {
      clearTimeout(timer)
    }
  }
}
