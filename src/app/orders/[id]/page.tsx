import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { formatIdr } from "@/lib/format";
import { getOrder } from "@/lib/shop";

export const metadata = { title: "Order" };

const COPY = {
  paid: { title: "Thank you! Payment received.", tone: "ok" },
  pending: { title: "Waiting for payment", tone: "warn" },
  failed: { title: "Payment failed — your items were released", tone: "bad" },
} as const;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const order = await getOrder(await getDb(), (await params).id);
  if (!order) notFound();
  const copy = COPY[order.status];

  return (
    <div className="order card">
      <p className={`status ${copy.tone}`}>{order.status.toUpperCase()}</p>
      <h1>{copy.title}</h1>
      <p className="muted small">
        Order <code>{order.id}</code> · {order.customerName} · {order.email}
      </p>
      <ul className="summary-lines">
        {order.items.map((i) => (
          <li key={i.productId}>
            <span>
              {i.quantity} × {i.name}
            </span>
            <span>{formatIdr(i.unitPriceIdr * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="summary-row total">
        <span>Total</span>
        <strong>{formatIdr(order.totalIdr)}</strong>
      </div>
      {order.status === "pending" && (
        <Link href={`/pay/${order.id}`} className="btn primary">
          Complete payment
        </Link>
      )}
      <Link href="/" className="back">
        ← Continue shopping
      </Link>
    </div>
  );
}
