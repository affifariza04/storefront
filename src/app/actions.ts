"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS, checkPassword, createSession } from "@/lib/admin-auth";
import { buildEvent, webhookSecret } from "@/lib/payments";
import * as shop from "@/lib/shop";

const CART_COOKIE = "cart_id";

async function cartId(create: boolean): Promise<string | undefined> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing || !create) return existing;
  const id = await shop.createCart(await getDb());
  jar.set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return id;
}

export async function currentCartId() {
  return cartId(false);
}

const ProductForm = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(0).max(shop.MAX_QTY_PER_ITEM),
});

export async function addToCartAction(formData: FormData) {
  const { productId, quantity } = ProductForm.parse(Object.fromEntries(formData));
  await shop.addToCart(await getDb(), (await cartId(true))!, productId, quantity || 1);
  revalidatePath("/", "layout");
  redirect("/cart");
}

export async function setQuantityAction(formData: FormData) {
  const { productId, quantity } = ProductForm.parse(Object.fromEntries(formData));
  const id = await cartId(false);
  if (id) await shop.setCartQuantity(await getDb(), id, productId, quantity);
  revalidatePath("/", "layout");
}

export type CheckoutState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Echoed back so React's post-submit form reset doesn't wipe what the shopper typed. */
  values?: Record<string, string>;
};

export async function checkoutAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const id = await cartId(false);
  if (!id) return { error: "Your cart is empty" };

  const values = Object.fromEntries(
    ["customerName", "email", "address"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = shop.CheckoutInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  let orderId: string;
  try {
    orderId = (await shop.checkout(await getDb(), id, parsed.data)).id;
  } catch (err) {
    if (err instanceof shop.ShopError) return { error: err.message, values };
    throw err;
  }
  revalidatePath("/", "layout");
  redirect(`/pay/${orderId}`);
}

/**
 * Stand-in for a hosted payment page (Midtrans Snap / Stripe Checkout). It
 * sends a signed webhook to our own endpoint over HTTP, so the real webhook
 * code path — signature check, idempotency, amount check — is exercised.
 */
export async function simulatePaymentAction(formData: FormData) {
  const orderId = z.uuid().parse(formData.get("orderId"));
  const outcome = formData.get("outcome") === "fail" ? "payment.failed" : "payment.succeeded";
  const order = await shop.getOrder(await getDb(), orderId);
  if (!order) redirect("/");

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const { body, signature } = buildEvent(outcome, order.id, order.totalIdr, webhookSecret());
  await fetch(`${origin}/api/webhooks/payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": signature },
    body,
  });
  redirect(`/orders/${order.id}`);
}

export async function adminLoginAction(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  if (!checkPassword(String(formData.get("password") ?? ""))) return { error: "Wrong password" };
  (await cookies()).set(ADMIN_COOKIE, createSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_TTL_SECONDS,
    path: "/admin",
  });
  redirect("/admin");
}

export async function adminLogoutAction() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin/login");
}
