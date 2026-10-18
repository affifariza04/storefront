import Link from "next/link";
import { getDb } from "@/db";
import { formatIdr } from "@/lib/format";
import { getCart, MAX_QTY_PER_ITEM } from "@/lib/shop";
import { currentCartId, setQuantityAction } from "../actions";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  const cart = await getCart(await getDb(), await currentCartId());

  if (cart.items.length === 0) {
    return (
      <div className="empty-state">
        <h1>Your cart is empty</h1>
        <Link href="/" className="btn primary">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="cart">
      <h1>Cart</h1>
      <ul className="cart-lines">
        {cart.items.map((item) => (
          <li key={item.productId} className="card cart-line">
            <span className="thumb small" aria-hidden>
              {item.emoji}
            </span>
            <div className="grow">
              <Link href={`/products/${item.slug}`}>{item.name}</Link>
              <div className="muted small">{formatIdr(item.priceIdr)} each</div>
            </div>
            <form action={setQuantityAction} className="qty-form">
              <input type="hidden" name="productId" value={item.productId} />
              <input
                type="number"
                name="quantity"
                defaultValue={item.quantity}
                min={0}
                max={Math.min(item.stock, MAX_QTY_PER_ITEM)}
                aria-label={`Quantity of ${item.name}`}
              />
              <button className="btn">Update</button>
            </form>
            <form action={setQuantityAction}>
              <input type="hidden" name="productId" value={item.productId} />
              <input type="hidden" name="quantity" value={0} />
              <button className="btn ghost" aria-label={`Remove ${item.name}`}>
                Remove
              </button>
            </form>
            <strong className="line-total">{formatIdr(item.priceIdr * item.quantity)}</strong>
          </li>
        ))}
      </ul>
      <div className="summary card">
        <div className="summary-row">
          <span>Subtotal ({cart.count} items)</span>
          <strong>{formatIdr(cart.subtotalIdr)}</strong>
        </div>
        <Link href="/checkout" className="btn primary block">
          Checkout
        </Link>
      </div>
    </div>
  );
}
