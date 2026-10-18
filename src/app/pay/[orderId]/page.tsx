import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { formatIdr } from "@/lib/format";
import { getOrder } from "@/lib/shop";
import { simulatePaymentAction } from "../../actions";

export const metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const order = await getOrder(await getDb(), (await params).orderId);
  if (!order) notFound();
  if (order.status !== "pending") redirect(`/orders/${order.id}`);

  return (
    <div className="pay card">
      <p className="badge">MockPay sandbox</p>
      <h1>{formatIdr(order.totalIdr)}</h1>
      <p className="muted">
        Order <code>{order.id.slice(0, 8)}</code> · {order.items.length} item(s)
      </p>
      <p className="small muted">
        This page stands in for a hosted payment page such as Midtrans Snap or Stripe Checkout. Either
        button sends a signed webhook to <code>/api/webhooks/payment</code>, the same path a real provider
        would call.
      </p>
      <form action={simulatePaymentAction} className="pay-actions">
        <input type="hidden" name="orderId" value={order.id} />
        <button className="btn primary" name="outcome" value="success">
          Pay now
        </button>
        <button className="btn ghost" name="outcome" value="fail">
          Simulate failed payment
        </button>
      </form>
    </div>
  );
}
