"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Detail = {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string | null;
    status: string;
    role: string;
    ban_reason: string | null;
    created_at: string;
  };
  accounts: { provider: string; provider_account_id: string; type: string }[];
  orders: {
    id: string;
    sku: string;
    amount_fen: number;
    status: string;
    created_at: string;
  }[];
  credits: {
    purchased: number;
    daily: number;
    goodwill: number;
  };
};

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) {
      setMsg("加载失败");
      return;
    }
    setData((await res.json()) as Detail);
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg("操作失败");
      return;
    }
    setMsg("已更新");
    await load();
  }

  if (!data) {
    return <p className="admin-muted">{msg ?? "加载中…"}</p>;
  }

  const { user, accounts, orders, credits } = data;

  return (
    <div>
      <p className="admin-muted">
        <Link href="/users">← 用户列表</Link>
      </p>
      <h1 className="admin-h1">{user.email || user.phone || user.id}</h1>
      <p className="admin-lead">
        {user.id} · {user.status} · {user.role}
      </p>
      {msg ? <p className="admin-muted">{msg}</p> : null}

      <div className="admin-toolbar">
        {user.status === "banned" ? (
          <button
            type="button"
            className="admin-btn"
            onClick={() => void patch({ status: "active" })}
          >
            解封
          </button>
        ) : (
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => void patch({ status: "banned", banReason: "admin" })}
          >
            封禁
          </button>
        )}
        {user.role === "admin" ? (
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => void patch({ role: "user" })}
          >
            取消管理员
          </button>
        ) : (
          <button
            type="button"
            className="admin-btn"
            onClick={() => void patch({ role: "admin" })}
          >
            设为管理员
          </button>
        )}
        <Link
          className="admin-btn admin-btn-ghost"
          href={`/ledger?subjectId=${user.id}`}
        >
          账本
        </Link>
        <Link
          className="admin-btn admin-btn-ghost"
          href={`/content?subjectId=${user.id}`}
        >
          内容
        </Link>
      </div>

      <div className="admin-cards">
        <div className="admin-card">
          <p className="admin-card-label">日额度</p>
          <p className="admin-card-value">{credits.daily}</p>
        </div>
        <div className="admin-card">
          <p className="admin-card-label">已购</p>
          <p className="admin-card-value">{credits.purchased}</p>
        </div>
        <div className="admin-card">
          <p className="admin-card-label">goodwill</p>
          <p className="admin-card-value">{credits.goodwill}</p>
        </div>
      </div>

      <div className="admin-panel">
        <h2>关联账号</h2>
        {accounts.length === 0 ? (
          <p className="admin-muted">无 OAuth 关联</p>
        ) : (
          <ul className="admin-muted">
            {accounts.map((a) => (
              <li key={`${a.provider}:${a.provider_account_id}`}>
                {a.provider} · {a.provider_account_id}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-panel">
        <h2>最近订单</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>金额</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.sku}</td>
                  <td>¥{(o.amount_fen / 100).toFixed(2)}</td>
                  <td>{o.status}</td>
                  <td>{o.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
