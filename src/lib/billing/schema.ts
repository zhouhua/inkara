export type CreditKind = "daily_grant" | "purchased" | "goodwill";

export type ConsumeVia = "subscription" | "purchased" | "daily_grant" | "goodwill";

export type ConsumeResult =
  | { ok: true; via: ConsumeVia }
  | { ok: false; code: "quota_exhausted" };

export type BalanceSnapshot = {
  purchased: number;
  daily: number;
  goodwill: number;
  usage: number;
  period: string;
  hasActiveSubscription: boolean;
  goodwillGrantedThisPeriod: boolean;
};

export type ActiveSubscription = {
  sku: string;
  periodStart: string;
  periodEnd: string;
};

export const SUBSCRIPTION_SOFT_CAP = 500;
export const DAILY_GRANT_AMOUNT = 2;
export const GOODWILL_AMOUNT = 5;

export type CreditLot = {
  id: string;
  subjectId: string;
  kind: CreditKind;
  amount: number;
  remaining: number;
  grantDate: string | null;
  expiresAt: string | null;
  createdAt: string;
};
