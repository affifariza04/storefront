import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { formatIdr } from "@/lib/format";
import { adminOverview } from "@/lib/shop";
import { adminLogoutAction } from "../actions";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  if (!verifySession((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/admin/login");
  const { totals, topProducts, lowStock, recentOrders } = await adminOverview(await getDb());

  return (
    <div className="admin">
      <div className="admin-head">
        <h1>Dashboard</h1>
        <form action={adminLogoutAction}>
          <button className="btn ghost">Sign out</button>
        </form>
      </div>

      <section className="stats">
        <div className="card stat">
          <span className="muted small">Revenue (paid)</span>
          <strong>{formatIdr(totals.revenueIdr)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Paid orders</span>
          <strong>{totals.paid}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Awaiting payment</span>
          <strong>{totals.pending}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Failed</span>
          <strong>{totals.failed}</strong>
        </div>
      </section>

      <div className="admin-grid">
        <section className="card">
          <h2>Top sellers</h2>
          {topProducts.length === 0 ? (
            <p className="muted small">No paid orders yet.</p>
          ) : (
            <ul className="summary-lines">
              {topProducts.map((p) => (
                <li key={p.name}>
                  <span>
                    {p.name} <span className="muted">× {p.units}</span>
                  </span>
                  <span>{formatIdr(p.revenueIdr)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Low stock</h2>
          {lowStock.length === 0 ? (
            <p className="muted small">Everything is well stocked.</p>
          ) : (
            <ul className="summary-lines">
              {lowStock.map((p) => (
                <li key={p.name}>
                  <span>{p.name}</span>
                  <span className={p.stock === 0 ? "stock out" : "stock low"}>{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Recent orders</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.id.slice(0, 8)}</code>
                  </td>
                  <td>{o.customerName}</td>
                  <td>
                    <span className={`status ${o.status === "paid" ? "ok" : o.status === "failed" ? "bad" : "warn"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="num">{formatIdr(o.totalIdr)}</td>
                  <td className="muted small">{o.createdAt.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
