import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { formatIdr } from "@/lib/format";
import { getCart } from "@/lib/shop";
import { currentCartId } from "../actions";
import { CheckoutForm } from "./checkout-form";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const cart = await getCart(await getDb(), await currentCartId());
  if (cart.items.length === 0) redirect("/cart");

  return (
    <div className="checkout">
      <div>
        <h1>Checkout</h1>
        <CheckoutForm />
      </div>
      <aside className="card summary">
        <h2>Order summary</h2>
        <ul className="summary-lines">
          {cart.items.map((i) => (
            <li key={i.productId}>
              <span>
                {i.quantity} × {i.name}
              </span>
              <span>{formatIdr(i.priceIdr * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="summary-row total">
          <span>Total</span>
          <strong>{formatIdr(cart.subtotalIdr)}</strong>
        </div>
      </aside>
    </div>
  );
}
