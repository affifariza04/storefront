import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db";
import { orders, products } from "@/db/schema";
import { seedIfEmpty } from "@/db/seed";
import { createSession, verifySession } from "@/lib/admin-auth";
import { buildEvent, handlePaymentWebhook, sign } from "@/lib/payments";
import {
  addToCart,
  adminOverview,
  checkout,
  createCart,
  getCart,
  getOrder,
  listProducts,
  MAX_QTY_PER_ITEM,
  setCartQuantity,
  ShopError,
} from "@/lib/shop";

const SECRET = "test-secret";
const CUSTOMER = { customerName: "Rina", email: "rina@example.com", address: "Jl. Merdeka No. 10, Bandung" };

let db: DB;
const product = async (slug: string) => (await db.select().from(products).where(eq(products.slug, slug)))[0]!;

beforeAll(async () => {
  db = await createDb(); // in-memory Postgres (PGlite), real SQL semantics
}, 60_000);

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE products, carts, cart_items, orders, order_items, webhook_events RESTART IDENTITY CASCADE`,
  );
  await seedIfEmpty(db);
});

describe("catalogue", () => {
  it("filters by category and searches name/description", async () => {
    expect((await listProducts(db, { category: "Tea" })).map((p) => p.slug)).toContain("teh-melati-100g");
    expect((await listProducts(db, { q: "gayo" })).map((p) => p.slug)).toEqual(["arabika-gayo-250g", "v60-dripper"]); // name or description
    expect(await listProducts(db, { q: "%" })).toEqual([]); // LIKE wildcards are escaped
  });
});

describe("cart", () => {
  it("accumulates quantities and computes the subtotal", async () => {
    const cart = await createCart(db);
    const gayo = await product("arabika-gayo-250g");
    await addToCart(db, cart, gayo.id, 2);
    await addToCart(db, cart, gayo.id, 1);
    const c = await getCart(db, cart);
    expect(c.items).toHaveLength(1);
    expect(c.count).toBe(3);
    expect(c.subtotalIdr).toBe(3 * 95_000);
  });

  it("clamps to available stock and the per-item cap, and removes at zero", async () => {
    const cart = await createCart(db);
    const dripper = await product("v60-dripper"); // stock 3
    expect(await setCartQuantity(db, cart, dripper.id, 50)).toBe(3);
    const tea = await product("wedang-jahe-sachet"); // stock 50
    expect(await setCartQuantity(db, cart, tea.id, 99)).toBe(MAX_QTY_PER_ITEM);
    await setCartQuantity(db, cart, dripper.id, 0);
    expect((await getCart(db, cart)).items.map((i) => i.slug)).toEqual(["wedang-jahe-sachet"]);
  });
});

describe("checkout", () => {
  it("creates a pending order, reserves stock, snapshots prices, empties the cart", async () => {
    const cart = await createCart(db);
    const gayo = await product("arabika-gayo-250g");
    await addToCart(db, cart, gayo.id, 2);

    const order = await checkout(db, cart, CUSTOMER);
    expect(order).toMatchObject({ status: "pending", totalIdr: 190_000 });
    expect((await product("arabika-gayo-250g")).stock).toBe(gayo.stock - 2);
    expect((await getCart(db, cart)).items).toHaveLength(0);

    // A later price change must not rewrite the order.
    await db.update(products).set({ priceIdr: 1 }).where(eq(products.id, gayo.id));
    const saved = await getOrder(db, order.id);
    expect(saved!.items[0]).toMatchObject({ unitPriceIdr: 95_000, quantity: 2 });
  });

  it("rolls back completely when any line is out of stock", async () => {
    const cart = await createCart(db);
    const gayo = await product("arabika-gayo-250g");
    const lapis = await product("kue-lapis-legit");
    await addToCart(db, cart, gayo.id, 1);
    await addToCart(db, cart, lapis.id, 6);
    await db.update(products).set({ stock: 2 }).where(eq(products.id, lapis.id)); // sold elsewhere

    await expect(checkout(db, cart, CUSTOMER)).rejects.toMatchObject({ code: "out_of_stock" });
    expect((await product("arabika-gayo-250g")).stock).toBe(gayo.stock); // not decremented
    expect(await db.select().from(orders)).toHaveLength(0);
    expect((await getCart(db, cart)).items).toHaveLength(2); // cart kept for the shopper to fix
  });

  it("never oversells the last unit to two shoppers", async () => {
    const dripper = await product("v60-dripper");
    await db.update(products).set({ stock: 1 }).where(eq(products.id, dripper.id));
    const [a, b] = [await createCart(db), await createCart(db)];
    await setCartQuantity(db, a, dripper.id, 1);
    await setCartQuantity(db, b, dripper.id, 1);

    const results = await Promise.allSettled([checkout(db, a, CUSTOMER), checkout(db, b, CUSTOMER)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await product("v60-dripper")).stock).toBe(0);
  });

  it("validates customer details and rejects an empty cart", async () => {
    const cart = await createCart(db);
    await expect(checkout(db, cart, CUSTOMER)).rejects.toBeInstanceOf(ShopError);
    await addToCart(db, cart, (await product("pisang-sale")).id);
    await expect(checkout(db, cart, { ...CUSTOMER, email: "nope" })).rejects.toThrow(/valid email/);
  });
});

describe("payment webhook", () => {
  async function pendingOrder() {
    const cart = await createCart(db);
    await addToCart(db, cart, (await product("teh-melati-100g")).id, 3);
    return checkout(db, cart, CUSTOMER);
  }

  it("marks the order paid for a correctly signed event", async () => {
    const order = await pendingOrder();
    const { body, signature } = buildEvent("payment.succeeded", order.id, order.totalIdr, SECRET);
    expect(await handlePaymentWebhook(db, body, signature, SECRET)).toEqual({
      status: "processed",
      orderStatus: "paid",
    });
    expect((await getOrder(db, order.id))!.status).toBe("paid");
  });

  it("rejects forged or tampered events", async () => {
    const order = await pendingOrder();
    const { body } = buildEvent("payment.succeeded", order.id, order.totalIdr, SECRET);
    expect((await handlePaymentWebhook(db, body, sign(body, "attacker"), SECRET)).status).toBe("rejected");
    const tampered = body.replace(String(order.totalIdr), "1");
    expect((await handlePaymentWebhook(db, tampered, sign(body, SECRET), SECRET)).status).toBe("rejected");
    expect((await getOrder(db, order.id))!.status).toBe("pending");
  });

  it("is idempotent under redelivery", async () => {
    const order = await pendingOrder();
    const { body, signature } = buildEvent("payment.succeeded", order.id, order.totalIdr, SECRET);
    await handlePaymentWebhook(db, body, signature, SECRET);
    expect(await handlePaymentWebhook(db, body, signature, SECRET)).toEqual({ status: "duplicate" });
  });

  it("ignores a payment for the wrong amount", async () => {
    const order = await pendingOrder();
    const { body, signature } = buildEvent("payment.succeeded", order.id, order.totalIdr - 1000, SECRET);
    expect(await handlePaymentWebhook(db, body, signature, SECRET)).toMatchObject({ reason: "amount mismatch" });
    expect((await getOrder(db, order.id))!.status).toBe("pending");
  });

  it("releases reserved stock when payment fails", async () => {
    const before = (await product("teh-melati-100g")).stock;
    const order = await pendingOrder();
    expect((await product("teh-melati-100g")).stock).toBe(before - 3);
    const { body, signature } = buildEvent("payment.failed", order.id, order.totalIdr, SECRET);
    await handlePaymentWebhook(db, body, signature, SECRET);
    expect((await product("teh-melati-100g")).stock).toBe(before);
    expect((await getOrder(db, order.id))!.status).toBe("failed");
  });
});

describe("admin", () => {
  it("reports revenue from paid orders only", async () => {
    const cart = await createCart(db);
    await addToCart(db, cart, (await product("tumbler-500ml")).id, 2);
    const paid = await checkout(db, cart, CUSTOMER);
    const e = buildEvent("payment.succeeded", paid.id, paid.totalIdr, SECRET);
    await handlePaymentWebhook(db, e.body, e.signature, SECRET);

    const cart2 = await createCart(db);
    await addToCart(db, cart2, (await product("pisang-sale")).id, 1);
    await checkout(db, cart2, CUSTOMER); // stays pending

    const o = await adminOverview(db);
    expect(o.totals).toMatchObject({ revenueIdr: 298_000, paid: 1, pending: 1, failed: 0 });
    expect(o.topProducts[0]).toMatchObject({ name: "Insulated Tumbler 500 ml", units: 2 });
  });

  it("signs sessions that expire and can't be forged", () => {
    const now = 1_700_000_000_000;
    const token = createSession(now, "k");
    expect(verifySession(token, now + 1000, "k")).toBe(true);
    expect(verifySession(token, now + 9 * 3600_000, "k")).toBe(false); // expired
    expect(verifySession(token, now, "other-key")).toBe(false);
    expect(verifySession(`${now + 10 ** 9}.${token.split(".")[1]}`, now, "k")).toBe(false); // extended expiry
  });
});
