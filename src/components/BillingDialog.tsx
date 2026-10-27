"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import type { SkuId } from "@/lib/billing/catalog";

type BillingMe = {
  anonymous?: boolean;
  email?: string | null;
  credits?: { purchased: number; daily: number; goodwill: number };
  subscription?: { active: boolean; cancelAtPeriodEnd?: boolean };
  usage?: number;
};

type PayChannel = "alipay" | "wechat" | "mock";

type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
};

const PLANS: {
  id: SkuId;
  price: string;
  labelKey:
    "billingSku_sub_month" | "billingSku_sub_quarter" | "billingSku_sub_year";
  termKey: "billingTermMonth" | "billingTermQuarter" | "billingTermYear";
  asideKey: "billingAsideQuarter" | "billingAsideYear" | null;
  featured?: boolean;
}[] = [
  {
    id: "sub_month",
    price: "19",
    labelKey: "billingSku_sub_month",
    termKey: "billingTermMonth",
    asideKey: null,
  },
  {
    id: "sub_quarter",
    price: "49",
    labelKey: "billingSku_sub_quarter",
    termKey: "billingTermQuarter",
    asideKey: "billingAsideQuarter",
  },
  {
    id: "sub_year",
    price: "189",
    labelKey: "billingSku_sub_year",
    termKey: "billingTermYear",
    asideKey: "billingAsideYear",
    featured: true,
  },
];

const PACKS: {
  id: SkuId;
  price: string;
  labelKey:
    "billingSku_pack_50" | "billingSku_pack_150" | "billingSku_pack_500";
  asideKey:
    "billingAsidePack50" | "billingAsidePack150" | "billingAsidePack500";
}[] = [
  {
    id: "pack_50",
    price: "9.9",
    labelKey: "billingSku_pack_50",
    asideKey: "billingAsidePack50",
  },
  {
    id: "pack_150",
    price: "25",
    labelKey: "billingSku_pack_150",
    asideKey: "billingAsidePack150",
  },
  {
    id: "pack_500",
    price: "59",
    labelKey: "billingSku_pack_500",
    asideKey: "billingAsidePack500",
  },
];

const ALLOW_MOCK =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_PAY_ALLOW_MOCK === "1";

export function BillingDialog({ open, locale, onClose }: Props) {
  const titleId = useId();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(false);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<PayChannel>("alipay");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const payBaselineRef = useRef<{
    purchased: number;
    subActive: boolean;
  } | null>(null);

  // Reset checkout UI when the dialog opens (adjust state while rendering).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLoading(true);
      setError(null);
      setQrCodeUrl(null);
      setPendingOrderId(null);
    }
  }

  const refreshMe = useCallback(async () => {
    await fetch("/api/billing/anon", { method: "POST" });
    const res = await fetch("/api/billing/me");
    const data = (await res.json()) as BillingMe;
    setMe(data);
    return data;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await refreshMe();
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, refreshMe]);

  // After Alipay return (?billing=return), poll briefly for balance.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") !== "return") return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      void refreshMe();
      if (n >= 8) window.clearInterval(id);
    }, 1500);
    return () => window.clearInterval(id);
  }, [open, refreshMe]);

  // Poll while WeChat QR is showing.
  useEffect(() => {
    if (!open || !pendingOrderId || !qrCodeUrl) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      void (async () => {
        const data = await refreshMe();
        const baseline = payBaselineRef.current;
        if (!baseline) return;
        const purchased = data.credits?.purchased ?? 0;
        const active = data.subscription?.active ?? false;
        if (purchased > baseline.purchased || (active && !baseline.subActive)) {
          setQrCodeUrl(null);
          setPendingOrderId(null);
          payBaselineRef.current = null;
        }
      })();
      if (n >= 40) window.clearInterval(id);
    }, 2000);
    return () => window.clearInterval(id);
  }, [open, pendingOrderId, qrCodeUrl, refreshMe]);

  const onBuy = async (sku: SkuId) => {
    setError(null);
    setBusySku(sku);
    setQrCodeUrl(null);
    setPendingOrderId(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, channel }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        mode?: string;
        payUrl?: string | null;
        codeUrl?: string | null;
        orderId?: string;
      };
      if (!res.ok) {
        setError(
          data.message ?? data.error ?? t(locale, "billingCheckoutFailed"),
        );
        return;
      }
      if (data.mode === "qrcode" && data.codeUrl) {
        payBaselineRef.current = {
          purchased: me?.credits?.purchased ?? 0,
          subActive: me?.subscription?.active ?? false,
        };
        setQrCodeUrl(data.codeUrl);
        setPendingOrderId(data.orderId ?? null);
        return;
      }
      if (data.payUrl) {
        window.location.assign(data.payUrl);
        return;
      }
      setError(t(locale, "billingCheckoutFailed"));
    } catch {
      setError(t(locale, "billingCheckoutFailed"));
    } finally {
      setBusySku(null);
    }
  };

  const onCancelRenew = async () => {
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (!res.ok) {
        setError(t(locale, "billingCancelFailed"));
        return;
      }
      await refreshMe();
    } catch {
      setError(t(locale, "billingCancelFailed"));
    }
  };

  if (!open) return null;

  const loggedIn = me && me.anonymous === false;

  const onPick = (sku: SkuId) => {
    if (!loggedIn) {
      window.location.assign("/login");
      return;
    }
    void onBuy(sku);
  };

  return (
    <div className="billing-layer" role="presentation">
      <div className="billing-backdrop" onClick={onClose} role="presentation" />
      <div
        className="billing-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="billing-mast">
          <header className="billing-header">
            <div>
              <p className="billing-kicker">{t(locale, "brandEn")}</p>
              <h3 id={titleId}>{t(locale, "billingTitle")}</h3>
            </div>
            <button type="button" className="text-action" onClick={onClose}>
              {t(locale, "close")}
            </button>
          </header>
          <p className="billing-lead">{t(locale, "billingLead")}</p>
        </div>

        {loading ? (
          <div className="billing-slip">
            <p className="billing-status">{t(locale, "billingLoading")}</p>
          </div>
        ) : loggedIn ? (
          <div className="billing-slip">
            <p className="billing-status">
              {me?.email ? `${me.email} · ` : ""}
              {t(locale, "billingCreditsLine")
                .replace("{daily}", String(me?.credits?.daily ?? 0))
                .replace("{purchased}", String(me?.credits?.purchased ?? 0))}
              {me?.subscription?.active
                ? ` · ${t(locale, "billingSubActive")}`
                : ""}
              {me?.subscription?.cancelAtPeriodEnd
                ? ` · ${t(locale, "billingCancelAtEnd")}`
                : ""}
            </p>
          </div>
        ) : (
          <a className="billing-slip is-login" href="/login">
            <span className="billing-status">
              {t(locale, "billingNeedLogin")}
            </span>
            <span className="billing-login">{t(locale, "billingSignIn")}</span>
          </a>
        )}

        {error ? <p className="billing-error">{error}</p> : null}

        {qrCodeUrl ? (
          <div className="billing-qr">
            <p className="billing-status">{t(locale, "billingScanWechat")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="billing-qr-img"
              alt=""
              width={200}
              height={200}
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`}
            />
            <p className="billing-status">{t(locale, "billingWaitingPay")}</p>
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setQrCodeUrl(null);
                setPendingOrderId(null);
              }}
            >
              {t(locale, "close")}
            </button>
          </div>
        ) : (
          <>
            <section
              className="billing-section"
              aria-labelledby={`${titleId}-plans`}
            >
              <div className="billing-section-head">
                <h4 id={`${titleId}-plans`}>
                  {t(locale, "billingPlansLabel")}
                </h4>
                <p>{t(locale, "billingPlansNote")}</p>
              </div>
              <div className="billing-plans">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={`billing-plan${plan.featured ? " is-featured" : ""}`}
                    disabled={busySku !== null}
                    onClick={() => onPick(plan.id)}
                  >
                    <span className="billing-plan-name">
                      {t(locale, plan.labelKey)}
                    </span>
                    {plan.featured ? (
                      <span className="billing-plan-mark" aria-hidden="true">
                        {t(locale, "billingMark")}
                      </span>
                    ) : null}
                    <span className="billing-plan-price">
                      <span className="billing-yen">¥</span>
                      {plan.price}
                    </span>
                    <span className="billing-plan-term">
                      {t(locale, plan.termKey)}
                    </span>
                    <span className="billing-plan-aside">
                      {plan.asideKey ? t(locale, plan.asideKey) : "\u00a0"}
                    </span>
                    <span
                      className={`billing-plan-cta${plan.featured ? " is-primary" : ""}`}
                    >
                      {busySku === plan.id
                        ? t(locale, "billingLoading")
                        : plan.featured
                          ? t(locale, "billingChooseYear")
                          : t(locale, "billingChoosePlan")}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section
              className="billing-section"
              aria-labelledby={`${titleId}-packs`}
            >
              <div className="billing-section-head">
                <h4 id={`${titleId}-packs`}>
                  {t(locale, "billingPacksLabel")}
                </h4>
                <p>{t(locale, "billingPacksNote")}</p>
              </div>
              <div className="billing-packs" role="group">
                {PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    className="billing-pack"
                    disabled={busySku !== null}
                    onClick={() => onPick(pack.id)}
                  >
                    <span className="billing-pack-name">
                      {t(locale, pack.labelKey)}
                    </span>
                    <span className="billing-pack-price">¥{pack.price}</span>
                    <span className="billing-pack-aside">
                      {t(locale, pack.asideKey)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {loggedIn && !qrCodeUrl ? (
          <div
            className="billing-channels"
            role="radiogroup"
            aria-label={t(locale, "billingPayChannel")}
          >
            <span className="billing-channels-label">
              {t(locale, "billingPayChannel")}
            </span>
            <button
              type="button"
              role="radio"
              aria-checked={channel === "alipay"}
              className={`billing-channel${channel === "alipay" ? " is-active" : ""}`}
              onClick={() => setChannel("alipay")}
            >
              {t(locale, "billingChannelAlipay")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={channel === "wechat"}
              className={`billing-channel${channel === "wechat" ? " is-active" : ""}`}
              onClick={() => setChannel("wechat")}
            >
              {t(locale, "billingChannelWechat")}
            </button>
            {ALLOW_MOCK ? (
              <button
                type="button"
                role="radio"
                aria-checked={channel === "mock"}
                className={`billing-channel${channel === "mock" ? " is-active" : ""}`}
                onClick={() => setChannel("mock")}
              >
                {t(locale, "billingChannelMock")}
              </button>
            ) : null}
          </div>
        ) : null}

        {loggedIn &&
        me?.subscription?.active &&
        !me.subscription.cancelAtPeriodEnd ? (
          <button
            type="button"
            className="text-action billing-cancel"
            onClick={() => void onCancelRenew()}
          >
            {t(locale, "billingCancelRenew")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
