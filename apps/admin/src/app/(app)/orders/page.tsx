"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

type Order = {
  id: string;
  user_id: string;
  sku: string;
  amount_fen: number;
  status: string;
  channel: string | null;
  provider_trade_no: string | null;
  created_at: string;
  raw: string | null;
};

export default function AdminOrdersPage() {
  const [status, setStatus] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    void fetch(`/api/orders${q}`)
      .then((r) => r.json())
      .then((d: { orders: Order[] }) => setOrders(d.orders ?? []));
  }, [status]);

  return (
    <div>
      <h1 className="admin-h1">订单</h1>
      <p className="admin-lead">筛选状态 · 展开查看 raw</p>
      <div className="admin-toolbar">
        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部</option>
          <option value="pending">pending</option>
          <option value="paid">paid</option>
          <option value="failed">failed</option>
          <option value="refunded">refunded</option>
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>用户</th>
              <th>金额</th>
              <th>状态</th>
              <th>渠道</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.id}>
                <tr>
                  <td>
                    <button
                      type="button"
                      className="admin-btn admin-btn-ghost"
                      onClick={() =>
                        setExpanded(expanded === o.id ? null : o.id)
                      }
                    >
                      {o.sku}
                    </button>
                  </td>
                  <td>
                    <Link href={`/users/${o.user_id}`}>
                      {o.user_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>¥{(o.amount_fen / 100).toFixed(2)}</td>
                  <td>
                    <span
                      className={`admin-badge${o.status === "pending" ? " is-danger" : ""}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td>{o.channel ?? "—"}</td>
                  <td>{o.created_at}</td>
                </tr>
                {expanded === o.id ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="admin-pre">
                        {o.provider_trade_no
                          ? `trade_no: ${o.provider_trade_no}\n`
                          : ""}
                        {o.raw ?? "(no raw)"}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
