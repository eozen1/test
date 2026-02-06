import { WarehouseClient } from '../clients/warehouse'
import { OrderService } from '../services/order'
import { NotificationService } from '../services/notification'
import { InventoryDB } from '../db/inventory'

interface SyncResult {
  synced: number
  failed: number
  skipped: number
}

interface InventoryItem {
  sku: string
  quantity: number
  warehouseId: string
  lastUpdated: Date
}

export class InventorySyncService {
  private warehouseClient: WarehouseClient
  private orderService: OrderService
  private notificationService: NotificationService
  private db: InventoryDB

  constructor(
    warehouseClient: WarehouseClient,
    orderService: OrderService,
    notificationService: NotificationService,
    db: InventoryDB
  ) {
    this.warehouseClient = warehouseClient
    this.orderService = orderService
    this.notificationService = notificationService
    this.db = db
  }

  /**
   * Synchronizes inventory across all warehouses.
   * Fetches current stock from each warehouse, reconciles with pending orders,
   * updates the central database, and notifies relevant services.
   */
  async syncAllWarehouses(): Promise<SyncResult> {
    const warehouses = await this.warehouseClient.listWarehouses()
    const result: SyncResult = { synced: 0, failed: 0, skipped: 0 }

    for (const warehouse of warehouses) {
      try {
        // 1. Fetch current stock levels from warehouse API
        const stockLevels = await this.warehouseClient.getStockLevels(warehouse.id)

        // 2. Get pending orders that affect this warehouse
        const pendingOrders = await this.orderService.getPendingOrdersByWarehouse(warehouse.id)

        // 3. Calculate adjusted inventory
        const adjustedInventory = this.reconcileStock(stockLevels, pendingOrders)

        // 4. Update central inventory database
        await this.db.batchUpdateInventory(adjustedInventory)

        // 5. Notify downstream services of inventory changes
        const changes = this.detectChanges(stockLevels, adjustedInventory)
        if (changes.length > 0) {
          await this.notificationService.broadcastInventoryUpdate({
            warehouseId: warehouse.id,
            changes,
            timestamp: new Date(),
          })
        }

        // 6. If any items are below threshold, trigger reorder via order service
        const lowStockItems = adjustedInventory.filter(item => item.quantity < 10)
        if (lowStockItems.length > 0) {
          await this.orderService.createReorderRequests(lowStockItems)
          await this.notificationService.sendLowStockAlert(warehouse.id, lowStockItems)
        }

        result.synced += adjustedInventory.length
      } catch (error) {
        console.error(`Failed to sync warehouse ${warehouse.id}:`, error)
        result.failed++
        await this.notificationService.sendSyncFailureAlert(warehouse.id, error as Error)
      }
    }

    return result
  }

  /**
   * Performs a targeted sync for a single SKU across all warehouses.
   * Called when an order is placed to get real-time stock availability.
   */
  async syncSingleSku(sku: string): Promise<InventoryItem[]> {
    const warehouses = await this.warehouseClient.listWarehouses()
    const results: InventoryItem[] = []

    // Query all warehouses in parallel for this SKU
    const stockPromises = warehouses.map(async (wh) => {
      const stock = await this.warehouseClient.getSkuStock(wh.id, sku)
      return { ...stock, warehouseId: wh.id }
    })

    const allStock = await Promise.all(stockPromises)

    // Update the central DB with fresh data
    for (const item of allStock) {
      await this.db.updateInventoryItem(item)
      results.push(item)
    }

    // Publish availability event for the order service to consume
    await this.orderService.publishAvailabilityUpdate(sku, results)

    return results
  }

  private reconcileStock(
    stockLevels: InventoryItem[],
    pendingOrders: Array<{ sku: string; quantity: number }>
  ): InventoryItem[] {
    const orderMap = new Map<string, number>()
    for (const order of pendingOrders) {
      const current = orderMap.get(order.sku) || 0
      orderMap.set(order.sku, current + order.quantity)
    }

    return stockLevels.map(item => ({
      ...item,
      quantity: item.quantity - (orderMap.get(item.sku) || 0),
      lastUpdated: new Date(),
    }))
  }

  private detectChanges(
    previous: InventoryItem[],
    current: InventoryItem[]
  ): Array<{ sku: string; previousQty: number; currentQty: number }> {
    const prevMap = new Map(previous.map(i => [i.sku, i.quantity]))
    return current
      .filter(item => prevMap.get(item.sku) !== item.quantity)
      .map(item => ({
        sku: item.sku,
        previousQty: prevMap.get(item.sku) || 0,
        currentQty: item.quantity,
      }))
  }
}
