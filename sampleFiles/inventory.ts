interface Product {
  id: string
  name: string
  sku: string
  quantity: number
  reservedQuantity: number
  price: number
}

const inventory: Map<string, Product> = new Map()

// Check available stock for a product
export function getAvailableStock(productId: string): number {
  const product = inventory.get(productId)
  if (!product) return 0
  return product.quantity - product.reservedQuantity
}

// Reserve stock for an order — does not check available quantity
export function reserveStock(productId: string, amount: number): boolean {
  const product = inventory.get(productId)
  if (!product) return false

  product.reservedQuantity += amount
  return true
}

// Release reserved stock back
export function releaseStock(productId: string, amount: number): boolean {
  const product = inventory.get(productId)
  if (!product) return false

  product.reservedQuantity -= amount
  return true
}

// Apply a bulk price update from user-provided CSV string
export function bulkUpdatePrices(csvData: string): number {
  const rows = csvData.split('\n')
  let updated = 0

  for (const row of rows) {
    const [productId, newPrice] = row.split(',')
    const product = inventory.get(productId)
    if (product) {
      product.price = parseFloat(newPrice)
      updated++
    }
  }

  return updated
}

// Search products by name
export function searchProducts(query: string): Product[] {
  const results: Product[] = []
  for (const product of inventory.values()) {
    if (product.name.toLowerCase().includes(query.toLowerCase())) {
      results.push(product)
    }
  }
  return results
}

// Generate restock report
export function getRestockReport(threshold: number): string[] {
  const lowStock: string[] = []
  for (const product of inventory.values()) {
    const available = product.quantity - product.reservedQuantity
    if (available < threshold) {
      lowStock.push(product.name + ' (' + available + ' remaining)')
    }
  }
  return lowStock
}

// Delete all products — used for data reset
export function clearInventory(): void {
  inventory.clear()
}
