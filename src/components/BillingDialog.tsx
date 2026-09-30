"use client";

import { useEffect, useId, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

type BillingMe = {
  anonymous?: boolean;
  email?: string | null;
  credits?: { purchased: number; daily: number; goodwill: number };
  subscription?: { active: boolean };
  usage?: number;
};

type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
};

const SKUS: {
  id: string;
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await fetch("/api/billing/anon", { method: "POST" });
        const res = await fetch("/api/billing/me");
        const data = (await res.json()) as BillingMe;
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
  }, [open]);

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
          </p>
        ) : (
          <p className="billing-status">{t(locale, "billingNeedLogin")}</p>
        )}

        {!loggedIn ? (
          <a className="text-action billing-login" href="/api/auth/signin">
            {t(locale, "billingSignIn")}
          </a>
        ) : null}

        <ul className="billing-sku-list">
          {SKUS.map((sku) => (
            <li key={sku.id} className="billing-sku-row">
              <span>{t(locale, sku.labelKey)}</span>
              <span className="billing-sku-price">{sku.price}</span>
              <button
                type="button"
                className="text-action"
                disabled
                title={t(locale, "billingPaymentSoon")}
              >
                {t(locale, "billingPaymentSoon")}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
