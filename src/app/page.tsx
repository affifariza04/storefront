import Link from "next/link";
import { getDb } from "@/db";
import { formatIdr } from "@/lib/format";
import { listCategories, listProducts } from "@/lib/shop";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category = "" } = await searchParams;
  const db = await getDb();
  const [items, categories] = await Promise.all([
    listProducts(db, { q: q.slice(0, 100), category: category || undefined }),
    listCategories(db),
  ]);

  const href = (c: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (c) p.set("category", c);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      <section className="hero">
        <h1>From Indonesian farms to your cup</h1>
        <p className="muted">Small-batch coffee, tea and snacks from independent producers.</p>
      </section>

      <div className="toolbar">
        <form className="search" role="search">
          {category && <input type="hidden" name="category" value={category} />}
          <input name="q" defaultValue={q} placeholder="Search products…" aria-label="Search products" />
          <button className="btn">Search</button>
        </form>
        <nav className="chips" aria-label="Categories">
          <Link href={href("")} className={!category ? "chip active" : "chip"}>
            All
          </Link>
          {categories.map((c) => (
            <Link key={c} href={href(c)} className={c === category ? "chip active" : "chip"}>
              {c}
            </Link>
          ))}
        </nav>
      </div>

      {items.length === 0 ? (
        <p className="empty">No products match “{q}”.</p>
      ) : (
        <ul className="grid">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/products/${p.slug}`} className="card product-card">
                <div className="thumb" aria-hidden>
                  {p.emoji}
                </div>
                <div className="product-info">
                  <span className="category">{p.category}</span>
                  <h2>{p.name}</h2>
                  <div className="price-row">
                    <strong>{formatIdr(p.priceIdr)}</strong>
                    {p.stock === 0 ? (
                      <span className="stock out">Sold out</span>
                    ) : p.stock <= 5 ? (
                      <span className="stock low">Only {p.stock} left</span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
