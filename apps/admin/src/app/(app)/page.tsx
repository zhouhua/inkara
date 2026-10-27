"use client";

import { useEffect, useState } from "react";

type Stats = {
  users: number;
  banned: number;
  paidOrders: number;
  revenueFen: number;
  pendingOrders: number;
  registrations7d: { day: string; c: number }[];
  paid7d: { day: string; c: number; fen: number }[];
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Stats>;
      })
      .then(setStats)
      .catch(() => setError("加载失败"));
  }, []);

  return (
    <div>
      <h1 className="admin-h1">看板</h1>
      <p className="admin-lead">近况总览 · 数据来自实时查询</p>
      {error ? <p className="admin-muted">{error}</p> : null}
      {!stats && !error ? <p className="admin-muted">加载中…</p> : null}
      {stats ? (
        <>
          <div className="admin-cards">
            <div className="admin-card">
              <p className="admin-card-label">用户</p>
              <p className="admin-card-value">{stats.users}</p>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">封禁</p>
              <p className="admin-card-value">{stats.banned}</p>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">已付订单</p>
              <p className="admin-card-value">{stats.paidOrders}</p>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">收入（元）</p>
              <p className="admin-card-value">
                {(stats.revenueFen / 100).toFixed(2)}
              </p>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">待支付</p>
              <p className="admin-card-value">{stats.pendingOrders}</p>
            </div>
          </div>
          <div className="admin-panel">
            <h2>近 7 日注册</h2>
            {stats.registrations7d.length === 0 ? (
              <p className="admin-muted">暂无</p>
            ) : (
              <ul className="admin-muted">
                {stats.registrations7d.map((d) => (
                  <li key={d.day}>
                    {d.day} · {d.c}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="admin-panel">
            <h2>近 7 日付费</h2>
            {stats.paid7d.length === 0 ? (
              <p className="admin-muted">暂无</p>
            ) : (
              <ul className="admin-muted">
                {stats.paid7d.map((d) => (
                  <li key={d.day}>
                    {d.day} · {d.c} 单 · ¥{(d.fen / 100).toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
