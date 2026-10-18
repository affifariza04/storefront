import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { orderItems, orders, products, webhookEvents } from "@/db/schema";

/**
 * Payment webhooks, modelled on Stripe/Midtrans: the provider POSTs a JSON
 * event signed with HMAC-SHA256 over the raw body. The handler must be
 *   1. authentic   — reject anything not signed with our secret
 *   2. idempotent  — providers retry, so the same event can arrive many times
 *   3. consistent  — the paid amount must match the order total
 */

export const PaymentEvent = z.object({
  id: z.string().min(1),
  type: z.enum(["payment.succeeded", "payment.failed"]),
  orderId: z.uuid(),
  amountIdr: z.number().int().positive(),
});
export type PaymentEvent = z.infer<typeof PaymentEvent>;

export function sign(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(sign(rawBody, secret));
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function webhookSecret(): string {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("PAYMENT_WEBHOOK_SECRET must be set");
  return "dev-webhook-secret";
}

/** Builds a signed event exactly as the (mock) provider would send it. */
export function buildEvent(type: PaymentEvent["type"], orderId: string, amountIdr: number, secret: string) {
  const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, orderId, amountIdr });
  return { body, signature: sign(body, secret) };
}

export type WebhookResult =
  | { status: "processed"; orderStatus: "paid" | "failed" }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string }
  | { status: "rejected"; reason: string };

export async function handlePaymentWebhook(
  db: DB,
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<WebhookResult> {
  if (!verifySignature(rawBody, signature, secret)) return { status: "rejected", reason: "bad signature" };

  let event: PaymentEvent;
  try {
    event = PaymentEvent.parse(JSON.parse(rawBody));
  } catch {
    return { status: "rejected", reason: "malformed event" };
  }

  return db.transaction(async (tx) => {
    // Recording the event id first makes redeliveries a no-op.
    const inserted = await tx
      .insert(webhookEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (inserted.length === 0) return { status: "duplicate" } as const;

    const [order] = await tx.select().from(orders).where(eq(orders.id, event.orderId)).for("update");
    if (!order) return { status: "ignored", reason: "unknown order" } as const;
    if (order.status !== "pending") return { status: "ignored", reason: `order already ${order.status}` } as const;

    if (event.type === "payment.succeeded") {
      if (event.amountIdr !== order.totalIdr) {
        return { status: "ignored", reason: "amount mismatch" } as const;
      }
      await tx.update(orders).set({ status: "paid", paidAt: new Date() }).where(eq(orders.id, order.id));
      return { status: "processed", orderStatus: "paid" } as const;
    }

    // Failed payment: release the reserved stock back to the shelf.
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(and(eq(products.id, item.productId)));
    }
    await tx.update(orders).set({ status: "failed" }).where(eq(orders.id, order.id));
    return { status: "processed", orderStatus: "failed" } as const;
  });
}
