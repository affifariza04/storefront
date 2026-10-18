import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { cartItems, carts, orderItems, orders, products } from "@/db/schema";

export class ShopError extends Error {
  constructor(
    readonly code: "out_of_stock" | "empty_cart" | "not_found" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

export const MAX_QTY_PER_ITEM = 20;

// ---------- Catalogue ----------

export async function listProducts(db: DB, opts: { q?: string; category?: string } = {}) {
  const filters = [];
  if (opts.category) filters.push(eq(products.category, opts.category));
  if (opts.q) {
    const like = `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(or(ilike(products.name, like), ilike(products.description, like)));
  }
  return db
    .select()
    .from(products)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(products.category), asc(products.name));
}

export async function listCategories(db: DB): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .orderBy(asc(products.category));
  return rows.map((r) => r.category);
}

export async function getProduct(db: DB, slug: string) {
  const [row] = await db.select().from(products).where(eq(products.slug, slug));
  return row ?? null;
}

// ---------- Cart ----------

export async function createCart(db: DB): Promise<string> {
  const [cart] = await db.insert(carts).values({}).returning({ id: carts.id });
  return cart!.id;
}

export async function getCart(db: DB, cartId: string | undefined) {
  if (!cartId) return { items: [], subtotalIdr: 0, count: 0 };
  const items = await db
    .select({
      productId: products.id,
      slug: products.slug,
      name: products.name,
      emoji: products.emoji,
      priceIdr: products.priceIdr,
      stock: products.stock,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(products.name));
  return {
    items,
    subtotalIdr: items.reduce((sum, i) => sum + i.priceIdr * i.quantity, 0),
    count: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

/** Sets an absolute quantity (0 removes). Clamped to stock and a per-item cap. */
export async function setCartQuantity(db: DB, cartId: string, productId: number, quantity: number) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) throw new ShopError("not_found", "Product not found");

  const qty = Math.min(Math.max(0, Math.floor(quantity)), product.stock, MAX_QTY_PER_ITEM);
  if (qty === 0) {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
    return 0;
  }
  await db
    .insert(cartItems)
    .values({ cartId, productId, quantity: qty })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity: qty } });
  return qty;
}

export async function addToCart(db: DB, cartId: string, productId: number, quantity = 1) {
  const [existing] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
  return setCartQuantity(db, cartId, productId, (existing?.quantity ?? 0) + quantity);
}

// ---------- Checkout ----------

export const CheckoutInput = z.object({
  customerName: z.string().trim().min(2, "Name is too short").max(100),
  email: z.email("Enter a valid email").max(254),
  address: z.string().trim().min(10, "Please enter a full delivery address").max(500),
});

/**
 * Creates a pending order atomically. Stock is reserved with a conditional
 * `UPDATE … WHERE stock >= qty`, so two shoppers racing for the last unit
 * cannot both succeed. If any line fails, the whole transaction rolls back.
 */
export async function checkout(db: DB, cartId: string, input: z.infer<typeof CheckoutInput>) {
  const customer = CheckoutInput.parse(input);

  return db.transaction(async (tx) => {
    const lines = await tx
      .select({
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        name: products.name,
        priceIdr: products.priceIdr,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.cartId, cartId))
      .orderBy(asc(cartItems.productId)); // stable lock order avoids deadlocks
    if (lines.length === 0) throw new ShopError("empty_cart", "Your cart is empty");

    for (const line of lines) {
      const reserved = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.quantity}` })
        .where(and(eq(products.id, line.productId), gte(products.stock, line.quantity)))
        .returning({ id: products.id });
      if (reserved.length === 0) {
        throw new ShopError("out_of_stock", `Sorry, "${line.name}" doesn't have enough stock left`);
      }
    }

    const totalIdr = lines.reduce((sum, l) => sum + l.priceIdr * l.quantity, 0);
    const [order] = await tx.insert(orders).values({ ...customer, totalIdr }).returning();
    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order!.id,
        productId: l.productId,
        name: l.name,
        unitPriceIdr: l.priceIdr,
        quantity: l.quantity,
      })),
    );
    await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
    return order!;
  });
}

export async function getOrder(db: DB, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { ...order, items };
}

// ---------- Admin ----------

export async function adminOverview(db: DB) {
  const [totals] = await db
    .select({
      revenueIdr: sql<number>`coalesce(sum(${orders.totalIdr}) filter (where ${orders.status} = 'paid'), 0)::int`,
      paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')::int`,
      pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${orders.status} = 'failed')::int`,
    })
    .from(orders);

  const topProducts = await db
    .select({
      name: orderItems.name,
      units: sql<number>`sum(${orderItems.quantity})::int`,
      revenueIdr: sql<number>`sum(${orderItems.quantity} * ${orderItems.unitPriceIdr})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orders.status, "paid"))
    .groupBy(orderItems.name)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(5);

  const lowStock = await db
    .select({ name: products.name, stock: products.stock })
    .from(products)
    .where(sql`${products.stock} <= 5`)
    .orderBy(asc(products.stock));

  const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(20);

  return { totals: totals!, topProducts, lowStock, recentOrders };
}
