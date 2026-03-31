import { PrismaClient, OrderStatus } from '@prisma/client'

const prisma = new PrismaClient()

export async function createOrder(data: {
  customerId: string
  shippingAddressId: string
  items: Array<{ productId: string; quantity: number }>
}) {
  return prisma.$transaction(async (tx) => {
    // Calculate totals from product prices
    const products = await tx.product.findMany({
      where: { id: { in: data.items.map(i => i.productId) } },
    })

    const productMap = new Map(products.map(p => [p.id, p]))

    const subtotal = data.items.reduce((sum, item) => {
      const product = productMap.get(item.productId)
      if (!product) throw new Error(`Product ${item.productId} not found`)
      return sum + Number(product.price) * item.quantity
    }, 0)

    const tax = subtotal * 0.08
    const shippingCost = subtotal > 100 ? 0 : 9.99
    const total = subtotal + tax + shippingCost

    // Create order with items
    const order = await tx.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}`,
        customerId: data.customerId,
        shippingAddress: data.shippingAddressId,
        subtotal,
        tax,
        shippingCost,
        total,
        items: {
          create: data.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: Number(productMap.get(item.productId)!.price),
            total: Number(productMap.get(item.productId)!.price) * item.quantity,
          })),
        },
        statusHistory: {
          create: {
            toStatus: OrderStatus.PENDING,
            note: 'Order created',
          },
        },
      },
      include: {
        items: { include: { product: true } },
        customer: true,
      },
    })

    // Reserve inventory
    for (const item of data.items) {
      await tx.inventory.updateMany({
        where: { productId: item.productId, quantity: { gte: item.quantity } },
        data: { reserved: { increment: item.quantity } },
      })
    }

    return order
  })
}

export async function getOrderWithDetails(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      shippingAddr: true,
      items: { include: { product: true } },
      payments: true,
      shipments: true,
      statusHistory: { orderBy: { createdAt: 'desc' } },
    },
  })
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus, note?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })

    await tx.order.update({
      where: { id: orderId },
      data: { status: newStatus },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: newStatus,
        note,
      },
    })

    // Release inventory reservations on cancellation
    if (newStatus === OrderStatus.CANCELLED) {
      const items = await tx.orderItem.findMany({ where: { orderId } })
      for (const item of items) {
        await tx.inventory.updateMany({
          where: { productId: item.productId },
          data: { reserved: { decrement: item.quantity } },
        })
      }
    }
  })
}
