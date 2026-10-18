import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { getCart } from "@/lib/shop";
import { currentCartId } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kedai Nusantara", template: "%s · Kedai Nusantara" },
  description: "Indonesian coffee, tea and snacks — a full-stack Next.js storefront demo.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cart = await getCart(await getDb(), await currentCartId());
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-row">
            <Link href="/" className="brand">
              Kedai <span>Nusantara</span>
            </Link>
            <nav>
              <Link href="/">Shop</Link>
              <Link href="/cart" className="cart-link">
                Cart{cart.count > 0 && <span className="pill">{cart.count}</span>}
              </Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="container footer">
          Demo store — payments are simulated. <Link href="/admin">Admin</Link>
        </footer>
      </body>
    </html>
  );
}
