import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export type UserWithRelations = Prisma.UserGetPayload<{
  include: { addresses: true; orders: true; cart: { include: { items: true } } };
}>;

export type OrderWithDetails = Prisma.OrderGetPayload<{
  include: {
    items: { include: { product: true; variant: true } };
    payments: true;
    shipment: true;
    user: true;
    address: true;
  };
}>;

export type ProductWithVariants = Prisma.ProductGetPayload<{
  include: { variants: true; images: true; category: true; reviews: true };
}>;

export async function getUserWithOrders(userId: string): Promise<UserWithRelations | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      addresses: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      cart: {
        include: {
          items: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      },
    },
  });
}

export async function getOrderDetails(orderId: string): Promise<OrderWithDetails | null> {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
      payments: true,
      shipment: true,
      user: true,
      address: true,
    },
  });
}

export async function getProductCatalog(
  categoryId?: string,
  page = 1,
  pageSize = 20
): Promise<{ products: ProductWithVariants[]; total: number }> {
  const where: Prisma.ProductWhereInput = categoryId ? { categoryId } : {};

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        variants: true,
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
        reviews: { select: { rating: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total };
}

export async function createOrder(
  userId: string,
  addressId: string,
  items: { productId: string; variantId?: string; quantity: number }[]
): Promise<OrderWithDetails> {
  return prisma.$transaction(async (tx) => {
    // Fetch product prices
    const productIds = items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      include: { variants: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Calculate totals
    let subtotal = new Prisma.Decimal(0);
    const orderItems = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);

      let unitPrice = product.price;
      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (variant) unitPrice = unitPrice.add(variant.priceAdj);
      }

      const total = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(total);

      return {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        total,
      };
    });

    const tax = subtotal.mul(0.08);
    const shippingCost = subtotal.greaterThan(100) ? new Prisma.Decimal(0) : new Prisma.Decimal(9.99);
    const orderTotal = subtotal.add(tax).add(shippingCost);

    // Create order with items
    const order = await tx.order.create({
      data: {
        userId,
        addressId,
        subtotal,
        tax,
        shippingCost,
        total: orderTotal,
        items: { create: orderItems },
      },
      include: {
        items: { include: { product: true, variant: true } },
        payments: true,
        shipment: true,
        user: true,
        address: true,
      },
    });

    // Decrement stock
    for (const item of items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { decrement: item.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
    }

    // Clear user's cart
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (cart) {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    return order;
  });
}
