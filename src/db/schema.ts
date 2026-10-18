import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Money is stored as integer rupiah: no floating-point rounding anywhere.

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priceIdr: integer("price_idr").notNull(),
    stock: integer("stock").notNull(),
    emoji: text("emoji").notNull().default("📦"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("price_positive", sql`${t.priceIdr} > 0`),
    // Last line of defence against overselling, even if app logic regresses.
    check("stock_non_negative", sql`${t.stock} >= 0`),
    index("products_category_idx").on(t.category),
  ],
);

export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.productId] }), check("qty_positive", sql`${t.quantity} > 0`)],
);

export const orderStatus = pgEnum("order_status", ["pending", "paid", "failed"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: orderStatus("status").notNull().default("pending"),
    customerName: text("customer_name").notNull(),
    email: text("email").notNull(),
    address: text("address").notNull(),
    totalIdr: integer("total_idr").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("orders_status_idx").on(t.status)],
);

export const orderItems = pgTable(
  "order_items",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    // Snapshots: later price or name changes must not rewrite past orders.
    name: text("name").notNull(),
    unitPriceIdr: integer("unit_price_idr").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.productId] })],
);

/** Every processed payment event id, so webhook redeliveries are no-ops. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
