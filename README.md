# storefront: Kedai Nusantara

**A production-style e-commerce app built with Next.js 16 and PostgreSQL: catalogue and search, a server-side cart, checkout that can't oversell, signed and idempotent payment webhooks, and an admin dashboard.**

![next](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![react](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![postgres](https://img.shields.io/badge/PostgreSQL-Drizzle%20ORM-4169E1?logo=postgresql&logoColor=white)
![tests](https://img.shields.io/badge/tests-14%20passing-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)

| Shop | Admin |
|---|---|
| ![catalogue](docs/catalog.jpg) | ![admin dashboard](docs/admin.jpg) |

Most e-commerce demos stop at "add to cart." The hard parts of a real shop are **money and inventory under concurrency**, and that's what this project focuses on.

## The flow

```
browse ─▶ cart (server-side, cookie id) ─▶ checkout ──────────────────────────────┐
                                              │ ONE transaction:                    │
                                              │  · UPDATE stock … WHERE stock >= qty│ ← conditional decrement:
                                              │  · insert order + price snapshots   │   no overselling, no locks held
                                              │  · empty cart                       │   across requests
                                              ▼                                     │
                                       pending order ─▶ payment page ─▶ provider ───┘
                                                                          │
                                                         POST /api/webhooks/payment
                                                         x-signature: sha256=HMAC(body)
                                                                          │
                              verify signature → record event id (dedupe) → check amount
                                          │                                   │
                                   payment.succeeded                   payment.failed
                                   order → paid                        order → failed, stock released
```

## What's worth looking at

| Problem | Solution | Where |
|---|---|---|
| Two shoppers buy the last item at the same time | Conditional `UPDATE … WHERE stock >= qty RETURNING`, all lines in one transaction, plus a `CHECK (stock >= 0)` in the database as a backstop | [`lib/shop.ts`](src/lib/shop.ts) `checkout` |
| Price changes rewrite old orders | Order lines snapshot name and unit price | `order_items` |
| Forged payment notifications | HMAC-SHA256 over the raw body, constant-time compare | [`lib/payments.ts`](src/lib/payments.ts) |
| Providers retry webhooks | Event IDs stored with `ON CONFLICT DO NOTHING`, so redelivery is a no-op | `webhook_events` |
| Paid amount differs from order total | Rejected, and the order stays pending | `handlePaymentWebhook` |
| Abandoned or failed payments lock up stock | `payment.failed` returns reserved units to the shelf | `handlePaymentWebhook` |
| Floating-point money bugs | All amounts are integer rupiah | schema |
| Search injection | `ILIKE` with escaped wildcards through parameterised Drizzle queries | `listProducts` |
| Admin access | Stateless HMAC-signed, expiring session in an `httpOnly`, `SameSite=Strict` cookie scoped to `/admin` | [`lib/admin-auth.ts`](src/lib/admin-auth.ts) |

The payment page is a **mock provider** ("MockPay") that stands in for Midtrans Snap or Stripe Checkout. It sends a real signed HTTP webhook to the app, so the production webhook code path is what runs. Moving to a real provider means swapping the redirect target and the signature scheme.

## Stack

- **Next.js 16 App Router:** React Server Components for data fetching, Server Actions for mutations, `useActionState` for progressive-enhancement forms (they work without JavaScript)
- **PostgreSQL + Drizzle ORM:** typed schema, generated SQL migrations in [`drizzle/`](drizzle)
- **PGlite** (Postgres compiled to WASM) for zero-setup local development and tests: the same SQL dialect, constraints, and transactions as production, with no Docker required
- **Zod** validation on every input boundary

## Run it

```bash
git clone https://github.com/affifariza04/storefront && cd storefront
npm install
npm run dev            # http://localhost:3000, embedded Postgres, auto-migrated and seeded
```

Admin is at `/admin`. In development the password defaults to `admin`. In production, set the variables from [`.env.example`](.env.example):

```bash
DATABASE_URL=postgres://user:pass@host:5432/shop   # real Postgres; migrations run on boot
PAYMENT_WEBHOOK_SECRET=…  ADMIN_PASSWORD=…  ADMIN_SESSION_SECRET=…
```

Docker:

```bash
docker build -t storefront .
docker run -p 3000:3000 -e PAYMENT_WEBHOOK_SECRET=… -e ADMIN_PASSWORD=… -e ADMIN_SESSION_SECRET=… storefront
```

## Tests

```bash
npm test     # 14 tests against a real (in-memory) Postgres, ~4 s
```

The tests cover:

- the last-unit race: two concurrent checkouts, exactly one succeeds, and stock ends at 0
- all-or-nothing checkout when one line runs out of stock
- price snapshots surviving later price edits
- webhooks: valid, forged, tampered body, redelivered, wrong amount, and failed payment releasing stock
- admin revenue that counts only paid orders, and session expiry and forgery

I also ran the whole flow by hand on the production build: browse, cart, a checkout validation error, pay, the order page, a forged webhook rejected with `401`, admin login, and the dashboard.

## Project layout

```
src/
├── app/                    routes (RSC) + actions.ts (Server Actions)
│   ├── api/webhooks/payment/route.ts
│   ├── products/[slug]  cart  checkout  pay/[orderId]  orders/[id]  admin
├── db/                     schema, connection (Postgres | PGlite), seed
└── lib/                    shop.ts (domain) · payments.ts · admin-auth.ts
drizzle/                    SQL migrations
test/                       Vitest suite
```

## Roadmap

- Real Midtrans Snap integration (sandbox), and expiring unpaid orders after 30 minutes with a scheduled job
- Product images via object storage, plus an admin CRUD for products
- Customer accounts and order history
- Playwright end-to-end tests in CI

MIT licensed.
