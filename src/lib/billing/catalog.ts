export const CATALOG = {
  sub_month: { kind: "subscription", priceFen: 1900, months: 1 },
  sub_quarter: { kind: "subscription", priceFen: 4900, months: 3 },
  sub_year: { kind: "subscription", priceFen: 18900, months: 12 },
  pack_50: { kind: "pack", priceFen: 990, credits: 50 },
  pack_150: { kind: "pack", priceFen: 2500, credits: 150 },
  pack_500: { kind: "pack", priceFen: 5900, credits: 500 },
} as const;

export type SkuId = keyof typeof CATALOG;

export function isSkuId(value: string): value is SkuId {
  return Object.prototype.hasOwnProperty.call(CATALOG, value);
}

export function skuLabelKey(sku: SkuId): `billingSku_${SkuId}` {
  return `billingSku_${sku}`;
}
