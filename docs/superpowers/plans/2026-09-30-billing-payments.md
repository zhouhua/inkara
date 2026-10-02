# PRD-06 · Phase C：官方微信 / 支付宝 + 订阅 / 积分入账

> **Update:** 不使用聚合平台；仅企业商户直连微信支付（Native 扫码）与支付宝（电脑网站支付）。

**Goal:** 用户可对锁定 SKU 下单（选微信或支付宝），webhook 验签幂等入账；订阅周期与积分包到账后可被 Phase B 闸门消费。

**Architecture:** `PaymentProvider` 按 `channel`（`wechat` | `alipay` | `mock`）解析。`POST /api/billing/checkout` 建 `orders`（含 `channel`）并返回 `payUrl` 或 `codeUrl`；`POST /api/billing/webhook/[channel]` 验签后 `fulfillOrder`。BillingDialog 选择支付方式。

**Tech Stack:** D1 orders、Node Crypto（RSA / AES-GCM）、现有 Auth session。

**Depends on:** Phase A + B  
**Spec:** design spec §4–§5

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/billing/catalog.ts` | SKU 常量与价格（分） |
| `src/lib/billing/fulfill.ts` | `fulfillOrder(orderId)` 幂等 |
| `src/lib/billing/providers/wechat.ts` | 微信 APIv3 Native |
| `src/lib/billing/providers/alipay.ts` | 支付宝 page.pay |
| `src/app/api/billing/checkout/route.ts` | 需登录；建单 + channel |
| `src/app/api/billing/webhook/[channel]/route.ts` | 渠道验签 |
| `src/components/BillingDialog.tsx` | 渠道选择 + 扫码 / 跳转 |
| `README.md` | `WECHAT_PAY_*` / `ALIPAY_*` 与回调 URL |

---

### Locked catalog

```ts
export const CATALOG = {
  sub_month: { kind: "subscription", priceFen: 1900, months: 1 },
  sub_quarter: { kind: "subscription", priceFen: 4900, months: 3 },
  sub_year: { kind: "subscription", priceFen: 18900, months: 12 },
  pack_50: { kind: "pack", priceFen: 990, credits: 50 },
  pack_150: { kind: "pack", priceFen: 2500, credits: 150 },
  pack_500: { kind: "pack", priceFen: 5900, credits: 500 },
} as const;
```

`fulfill` 订阅：若已有 active，则从 `max(now, current_period_end)` 起延长 `months`；usage 不重置到未来月以外的规则——**每个自然月独立 500**，以 `yyyy-mm` 为 key。

---

### Notify URLs

- WeChat: `{NEXT_PUBLIC_APP_URL}/api/billing/webhook/wechat`
- Alipay: `{NEXT_PUBLIC_APP_URL}/api/billing/webhook/alipay`

### Phase C done when

- [x] 官方或 mock 支付成功 → 积分或订阅可查  
- [x] 重复 webhook 不双倍入账  
- [x] 用户可取消续费  
- [x] 无聚合依赖（虎皮椒等已移除）

**之后可选 Phase D（不在本计划）：** 微信登录、H5/JSAPI、上游 5xx 自动退次、异常限流仪表。
