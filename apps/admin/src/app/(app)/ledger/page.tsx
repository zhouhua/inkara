"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type LedgerData = {
  credits: { purchased: number; daily: number; goodwill: number };
  lots: {
    id: string;
    kind: string;
    amount: number;
    remaining: number;
    created_at: string;
  }[];
  entries: {
    id: string;
    delta: number;
    reason: string;
    created_at: string;
  }[];
};

function LedgerInner() {
  const params = useSearchParams();
  const [subjectId, setSubjectId] = useState(params.get("subjectId") ?? "");
  const [data, setData] = useState<LedgerData | null>(null);
  const [amount, setAmount] = useState("5");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load(id: string) {
    setMsg(null);
    const res = await fetch(`/api/ledger?subjectId=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setMsg("加载失败");
      setData(null);
      return;
    }
    setData((await res.json()) as LedgerData);
  }

  useEffect(() => {
    const id = params.get("subjectId");
    if (!id) return;
    queueMicrotask(() => {
      void load(id);
    });
  }, [params]);

  function onLookup(e: FormEvent) {
    e.preventDefault();
    if (subjectId.trim()) void load(subjectId.trim());
  }

  async function onGrant(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: subjectId.trim(),
        amount: Number(amount),
        note,
      }),
    });
    if (!res.ok) {
      setMsg("调账失败");
      return;
    }
    setMsg("已发放 goodwill");
    await load(subjectId.trim());
  }

  return (
    <div>
      <h1 className="admin-h1">账本</h1>
      <p className="admin-lead">查询余额 / 流水 · 人工发放 goodwill</p>
      <form className="admin-toolbar" onSubmit={onLookup}>
        <input
          className="admin-input"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          placeholder="subject / user id"
          style={{ minWidth: 280 }}
        />
        <button className="admin-btn" type="submit">
          查询
        </button>
      </form>
      {msg ? <p className="admin-muted">{msg}</p> : null}

      {data ? (
        <>
          <div className="admin-cards">
            <div className="admin-card">
              <p className="admin-card-label">日额度</p>
              <p className="admin-card-value">{data.credits.daily}</p>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">已购</p>
              <p className="admin-card-value">{data.credits.purchased}</p>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">goodwill</p>
              <p className="admin-card-value">{data.credits.goodwill}</p>
            </div>
          </div>

          <form className="admin-panel" onSubmit={onGrant}>
            <h2>人工发放 goodwill</h2>
            <div className="admin-toolbar">
              <input
                className="admin-input"
                type="number"
                min={1}
                max={10000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                className="admin-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="备注"
                style={{ minWidth: 180 }}
              />
              <button className="admin-btn" type="submit">
                发放
              </button>
            </div>
          </form>

          <div className="admin-panel">
            <h2>Lots</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>kind</th>
                    <th>amount</th>
                    <th>remaining</th>
                    <th>created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lots.map((l) => (
                    <tr key={l.id}>
                      <td>{l.kind}</td>
                      <td>{l.amount}</td>
                      <td>{l.remaining}</td>
                      <td>{l.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-panel">
            <h2>Ledger</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>delta</th>
                    <th>reason</th>
                    <th>created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.delta}</td>
                      <td>{e.reason}</td>
                      <td>{e.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminLedgerPage() {
  return (
    <Suspense fallback={<p className="admin-muted">加载中…</p>}>
      <LedgerInner />
    </Suspense>
  );
}
