"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ContentData = {
  settings: Record<string, unknown> | null;
  pages: {
    id: string;
    created_at: number;
    transcription: string;
    reply: string;
  }[];
};

function ContentInner() {
  const params = useSearchParams();
  const [subjectId, setSubjectId] = useState(params.get("subjectId") ?? "");
  const [data, setData] = useState<ContentData | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load(id: string) {
    setMsg(null);
    const res = await fetch(`/api/content?subjectId=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setMsg("加载失败");
      setData(null);
      return;
    }
    setData((await res.json()) as ContentData);
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

  async function onNote(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId: subjectId.trim(), note }),
    });
    setMsg(res.ok ? "备注已记入审计日志" : "写入失败");
    if (res.ok) setNote("");
  }

  return (
    <div>
      <h1 className="admin-h1">内容</h1>
      <p className="admin-lead">按 subject 只读浏览设定与页面</p>
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
          <div className="admin-panel">
            <h2>Settings</h2>
            <pre className="admin-pre">
              {JSON.stringify(data.settings, null, 2)}
            </pre>
          </div>
          <form className="admin-panel" onSubmit={onNote}>
            <h2>运营备注（仅审计日志）</h2>
            <div className="admin-toolbar">
              <input
                className="admin-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="备注"
                style={{ minWidth: 240 }}
                required
              />
              <button className="admin-btn" type="submit">
                记录
              </button>
            </div>
          </form>
          <div className="admin-panel">
            <h2>Pages（最近 50）</h2>
            {data.pages.length === 0 ? (
              <p className="admin-muted">无内容</p>
            ) : (
              data.pages.map((p) => (
                <div key={p.id} style={{ marginBottom: "1rem" }}>
                  <p className="admin-muted">
                    {p.id} · {new Date(p.created_at).toISOString()}
                  </p>
                  <p>
                    <strong>写：</strong>
                    {p.transcription || "—"}
                  </p>
                  <p>
                    <strong>回：</strong>
                    {p.reply || "—"}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <Suspense fallback={<p className="admin-muted">加载中…</p>}>
      <ContentInner />
    </Suspense>
  );
}
