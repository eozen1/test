import type { Product } from './types'

export function subtotal(items: ReadonlyArray<{ product: Product; quantity: number }>): number {
  return items.reduce((total, { product, quantity }) => {
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError('Invalid quantity')
    const next = total + product.priceCents * quantity
    if (!Number.isSafeInteger(next)) throw new RangeError('Subtotal exceeds supported range')
    return next
  }, 0)
}
