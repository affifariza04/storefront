import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { formatIdr } from "@/lib/format";
import { getProduct, MAX_QTY_PER_ITEM } from "@/lib/shop";
import { addToCartAction } from "../../actions";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(await getDb(), (await params).slug);
  return product ? { title: product.name, description: product.description } : {};
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct(await getDb(), (await params).slug);
  if (!product) notFound();
  const max = Math.min(product.stock, MAX_QTY_PER_ITEM);

  return (
    <article className="product-detail">
      <Link href="/" className="back">
        ← All products
      </Link>
      <div className="detail-grid">
        <div className="thumb large" aria-hidden>
          {product.emoji}
        </div>
        <div>
          <span className="category">{product.category}</span>
          <h1>{product.name}</h1>
          <p className="price">{formatIdr(product.priceIdr)}</p>
          <p>{product.description}</p>
          {product.stock > 0 ? (
            <form action={addToCartAction} className="add-form">
              <input type="hidden" name="productId" value={product.id} />
              <label>
                Qty
                <input type="number" name="quantity" defaultValue={1} min={1} max={max} />
              </label>
              <button className="btn primary">Add to cart</button>
              <span className="muted small">{product.stock} in stock</span>
            </form>
          ) : (
            <p className="stock out">Sold out</p>
          )}
        </div>
      </div>
    </article>
  );
}
