"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import type { SkuId } from "@/lib/billing/catalog";

type BillingMe = {
  anonymous?: boolean;
  email?: string | null;
  credits?: { purchased: number; daily: number; goodwill: number };
  subscription?: { active: boolean; cancelAtPeriodEnd?: boolean };
  usage?: number;
};

type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
};

const SKUS: {
  id: SkuId;
  price: string;
  labelKey:
    | "billingSku_sub_month"
    | "billingSku_sub_quarter"
    | "billingSku_sub_year"
    | "billingSku_pack_50"
    | "billingSku_pack_150"
    | "billingSku_pack_500";
}[] = [
  { id: "sub_month", price: "¥19", labelKey: "billingSku_sub_month" },
  { id: "sub_quarter", price: "¥49", labelKey: "billingSku_sub_quarter" },
  { id: "sub_year", price: "¥189", labelKey: "billingSku_sub_year" },
  { id: "pack_50", price: "¥9.9", labelKey: "billingSku_pack_50" },
  { id: "pack_150", price: "¥25", labelKey: "billingSku_pack_150" },
  { id: "pack_500", price: "¥59", labelKey: "billingSku_pack_500" },
];

export function BillingDialog({ open, locale, onClose }: Props) {
  const titleId = useId();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(false);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    await fetch("/api/billing/anon", { method: "POST" });
    const res = await fetch("/api/billing/me");
    const data = (await res.json()) as BillingMe;
    setMe(data);
    return data;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
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

  // After mock/xunhu return (?billing=return), poll briefly for balance.
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

  const onBuy = async (sku: SkuId) => {
    setError(null);
    setBusySku(sku);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        payUrl?: string;
      };
      if (!res.ok || !data.payUrl) {
        setError(data.message ?? data.error ?? t(locale, "billingCheckoutFailed"));
        return;
      }
      window.location.href = data.payUrl;
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

  return (
    <div className="billing-layer" role="presentation">
      <div
        className="billing-backdrop"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="billing-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="billing-header">
          <h3 id={titleId}>{t(locale, "billingTitle")}</h3>
          <button type="button" className="text-action" onClick={onClose}>
            {t(locale, "close")}
          </button>
        </header>

        <p className="billing-lead">{t(locale, "billingLead")}</p>

        {loading ? (
          <p className="billing-status">{t(locale, "billingLoading")}</p>
        ) : loggedIn ? (
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
        ) : (
          <p className="billing-status">{t(locale, "billingNeedLogin")}</p>
        )}

        {!loggedIn ? (
          <a className="text-action billing-login" href="/api/auth/signin">
            {t(locale, "billingSignIn")}
          </a>
        ) : null}

        {error ? <p className="billing-error">{error}</p> : null}

        <ul className="billing-sku-list">
          {SKUS.map((sku) => (
            <li key={sku.id} className="billing-sku-row">
              <span>{t(locale, sku.labelKey)}</span>
              <span className="billing-sku-price">{sku.price}</span>
              <button
                type="button"
                className="text-action"
                disabled={!loggedIn || busySku === sku.id}
                onClick={() => void onBuy(sku.id)}
              >
                {busySku === sku.id
                  ? t(locale, "billingLoading")
                  : t(locale, "billingBuy")}
              </button>
            </li>
          ))}
        </ul>

        {loggedIn && me?.subscription?.active && !me.subscription.cancelAtPeriodEnd ? (
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
