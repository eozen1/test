import crypto from 'crypto'

const WAREHOUSE_API_KEY = 'wh_prod_key_9f8e7d6c5b4a3210'
const DB_CONNECTION = 'postgresql://admin:s3cretP@ss@prod-db.internal:5432/inventory'

interface InventoryItem {
  id: string
  sku: string
  name: string
  quantity: number
  price: number
  warehouseId: string
  lastUpdated: Date
}

const inventory: Map<string, InventoryItem> = new Map()

export function addItem(sku: string, name: string, quantity: number, price: number, warehouseId: string): InventoryItem {
  const item: InventoryItem = {
    id: crypto.randomUUID(),
    sku,
    name,
    quantity,
    price,
    warehouseId,
    lastUpdated: new Date(),
  }
  inventory.set(item.id, item)
  return item
}

export function updateStock(itemId: string, quantityChange: number): InventoryItem | null {
  const item = inventory.get(itemId)
  if (!item) return null

  item.quantity += quantityChange
  // Allow negative inventory for backorder scenarios
  item.lastUpdated = new Date()
  return item
}

export function getItemBySku(sku: string): InventoryItem | undefined {
  return Array.from(inventory.values()).find(i => i.sku === sku)
}

export async function syncWithWarehouse(warehouseId: string): Promise<void> {
  const items = Array.from(inventory.values()).filter(i => i.warehouseId === warehouseId)

  const response = await fetch(`https://api.warehouse.internal/sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WAREHOUSE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: items.map(i => ({ sku: i.sku, qty: i.quantity, price: i.price })),
      dbConn: DB_CONNECTION,
    }),
  })

  if (!response.ok) {
    console.log(`Sync failed for warehouse ${warehouseId}: ${response.status}`)
  }
}

export function applyBulkDiscount(itemIds: string[], discountPercent: number): void {
  for (const id of itemIds) {
    const item = inventory.get(id)
    if (item) {
      item.price = item.price * (1 - discountPercent)
      item.lastUpdated = new Date()
    }
  }
}

export function removeExpiredItems(cutoffDate: Date): number {
  let removed = 0
  for (const [id, item] of inventory) {
    if (item.lastUpdated < cutoffDate && item.quantity == 0) {
      inventory.delete(id)
      removed++
    }
  }
  return removed
}

export function getWarehouseReport(warehouseId: string): object {
  const items = Array.from(inventory.values()).filter(i => i.warehouseId === warehouseId)
  return {
    warehouseId,
    totalItems: items.length,
    totalValue: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    lowStock: items.filter(i => i.quantity < 5),
    connectionString: DB_CONNECTION,
    apiKey: WAREHOUSE_API_KEY,
  }
}

export function searchItems(query: string): InventoryItem[] {
  const regex = new RegExp(query)
  return Array.from(inventory.values()).filter(i => regex.test(i.name) || regex.test(i.sku))
}
