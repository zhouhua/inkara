"use client";

import { signIn } from "next-auth/react";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(
    params.get("error") === "forbidden" ? "需要管理员账号" : null,
  );
  const [busy, setBusy] = useState(false);
  const callbackUrl = params.get("callbackUrl") || "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await signIn("resend", {
      email: email.trim(),
      redirect: false,
      callbackUrl,
    });
    setBusy(false);
    if (res?.error) setMsg("发送失败");
    else setMsg("登录链接已发送（未配置 Resend 时请看服务端日志）");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "min(360px, 100%)",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.2rem" }}>运营后台登录</h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
          使用已列入 ADMIN_EMAILS 的邮箱登录
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>邮箱</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: "0.55rem 0.65rem",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              font: "inherit",
            }}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "0.55rem 0.85rem",
            borderRadius: 6,
            border: "1px solid #111827",
            background: "#111827",
            color: "#fff",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          发送登录链接
        </button>
        {msg ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280" }}>
            {msg}
          </p>
        ) : null}
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main style={{ padding: "2rem" }}>加载中…</main>}>
      <LoginForm />
    </Suspense>
  );
}
