"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import "./login.css";

function loginErrorMessage(err: string | null): string | null {
  if (!err) return null;
  if (err === "banned") return "账号已停用";
  if (err === "wechat_not_configured") return "微信登录未配置";
  return "登录失败，请重试";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<"email" | "phone" | "wechat">("email");
  const [msg, setMsg] = useState<string | null>(() =>
    loginErrorMessage(params.get("error")),
  );
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    const ticket = params.get("ticket");
    if (!ticket) return;
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        setBusy(true);
        const res = await signIn("ticket", { ticket, redirect: false });
        if (cancelled) return;
        if (res?.ok) router.replace("/");
        else setMsg("登录票据无效或已过期");
        setBusy(false);
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await signIn("resend", {
      email: email.trim(),
      redirect: false,
      callbackUrl: "/",
    });
    setBusy(false);
    if (res?.error) setMsg("发送失败，请检查邮箱");
    else setMsg("登录链接已发送，请查收邮件（本地未配置时请看服务端日志）");
  }

  async function onSendOtp() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = (await res.json()) as {
      message?: string;
      loggedOnly?: boolean;
    };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.message ?? "发送失败");
      return;
    }
    setOtpSent(true);
    setMsg(
      data.loggedOnly ? "验证码已写入服务端日志（短信未配置）" : "验证码已发送",
    );
  }

  async function onPhone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await signIn("sms", {
      phone,
      code,
      redirect: false,
      callbackUrl: "/",
    });
    setBusy(false);
    if (res?.ok) router.replace("/");
    else setMsg("验证码错误或已过期");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <p className="login-kicker">inkara</p>
        <h1 className="login-title">登录墨语</h1>
        <p className="login-lead">轻量登录，写完还能找回来。</p>

        <div className="login-tabs" role="tablist">
          {(
            [
              ["email", "邮箱"],
              ["phone", "手机"],
              ["wechat", "微信"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`login-tab${tab === id ? " is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "email" ? (
          <form className="login-form" onSubmit={onEmail}>
            <label className="login-label">
              邮箱
              <input
                className="login-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="login-submit" type="submit" disabled={busy}>
              发送登录链接
            </button>
          </form>
        ) : null}

        {tab === "phone" ? (
          <form className="login-form" onSubmit={onPhone}>
            <label className="login-label">
              手机号
              <input
                className="login-input"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="11 位手机号"
              />
            </label>
            <div className="login-otp-row">
              <label className="login-label login-otp-grow">
                验证码
                <input
                  className="login-input"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="login-secondary"
                disabled={busy || !phone}
                onClick={() => void onSendOtp()}
              >
                {otpSent ? "重发" : "获取验证码"}
              </button>
            </div>
            <button className="login-submit" type="submit" disabled={busy}>
              登录
            </button>
          </form>
        ) : null}

        {tab === "wechat" ? (
          <div className="login-form">
            <p className="login-hint">
              使用微信扫码登录（需配置开放平台网站应用）。
            </p>
            <Link
              className="login-submit login-link-btn"
              href="/api/auth/wechat/start"
            >
              打开微信登录
            </Link>
          </div>
        ) : null}

        {msg ? <p className="login-msg">{msg}</p> : null}

        <p className="login-foot">
          <Link href="/">返回纸面</Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-page">加载中…</main>}>
      <LoginForm />
    </Suspense>
  );
}
