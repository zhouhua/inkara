# PRD-06 · Phase C：聚合支付 + 订阅 / 积分入账

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户可对锁定 SKU 下单（微信/支付宝聚合），webhook 验签幂等入账；订阅周期与积分包到账后可被 Phase B 闸门消费。

**Architecture:** `PaymentProvider` 接口隔离具体聚合商（虎皮椒 / PayJS / XorPay 等，实现时选一家）。`POST /api/billing/checkout` 建 `orders` 行并返回支付参数；`POST /api/billing/webhook` 验签后 `fulfillOrder`：积分包写入 `credit_lots(purchased)`，订阅写入/延长 `subscriptions`。BillingDialog 接通真购买。

**Tech Stack:** D1 orders、Node/Web Crypto 验签、现有 Auth session。

**Depends on:** Phase A + B  
**Spec:** design spec §4–§5

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/billing/catalog.ts` | SKU 常量与价格（分） |
| `src/lib/billing/fulfill.ts` | `fulfillOrder(orderId)` 幂等 |
| `src/lib/billing/fulfill.test.ts` | 入账单测 |
| `src/lib/billing/providers/types.ts` | Provider 接口 |
| `src/lib/billing/providers/<vendor>.ts` | 签名、下单、解析回调 |
| `src/app/api/billing/checkout/route.ts` | 需登录；建单 |
| `src/app/api/billing/webhook/route.ts` | 原始 body 验签 |
| `src/components/BillingDialog.tsx` | 接通 checkout |
| `README.md` | `PAY_*` 密钥与回调 URL |

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

### Task 1: Catalog + fulfill 幂等

**Files:**
- Create: `src/lib/billing/catalog.ts`
- Create: `src/lib/billing/fulfill.ts`
- Create: `src/lib/billing/fulfill.test.ts`

- [ ] **Step 1: 单测** — 同一 `order_id` fulfill 两次，积分只加一次；pack / sub 各一条  
- [ ] **Step 2: 实现 fulfill** — `orders.status` 从 `pending` → `paid`；写 `ledger_entries`  
- [ ] **Step 3: `npm test -- src/lib/billing/fulfill.test.ts` PASS**  
- [ ] **Step 4: Commit** `feat(billing): idempotent order fulfillment`

---

### Task 2: Provider 适配（选一家聚合）

**Files:**
- Create: `src/lib/billing/providers/types.ts`
- Create: `src/lib/billing/providers/<vendor>.ts`

- [ ] **Step 1: 选定 vendor并记下官方签名算法**（实现前读文档；密钥只进 env）  
- [ ] **Step 2: `createPayment({ orderId, amountFen, notifyUrl, returnUrl })`**  
- [ ] **Step 3: `verifyAndParseWebhook(req)` → `{ orderId, paid: true }`**  
- [ ] **Step 4: Commit** `feat(billing): add payment provider adapter`

**注意：** 不要把商户密钥写入仓库；README 只写变量名。

---

### Task 3: checkout + webhook 路由

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/webhook/route.ts`
- Modify: `migrations` 若 orders 缺字段则 `0002_*.sql`

- [ ] **Step 1: checkout** — session 必有；校验 sku；插入 order；返回支付 URL/参数  
- [ ] **Step 2: webhook** — 验签失败 401；成功则 fulfill；响应厂商要求的 success 字符串  
- [ ] **Step 3: 用厂商沙箱或模拟签名本地打一遍**  
- [ ] **Step 4: Commit** `feat(billing): checkout and payment webhook`

---

### Task 4: BillingDialog 接通 + 取消续费

**Files:**
- Modify: `src/components/BillingDialog.tsx`
- Create: `src/app/api/billing/cancel/route.ts`（`cancel_at_period_end=1`）

- [ ] **Step 1: 点击 SKU → checkout → 跳转/展示二维码**（按 provider）  
- [ ] **Step 2: 回跳页或轮询 `/api/billing/me` 直到余额变化**  
- [ ] **Step 3: 设定/对话框内「取消续费」**（已付周期保留）  
- [ ] **Step 4: Commit** `feat(billing): wire purchases and cancel-renew`

---

### Task 5: 生产清单与对账备忘

- [ ] README：回调 URL、`PAY_APP_ID` / `PAY_KEY`、D1 生产 migrate  
- [ ] 列入手动对账步骤（按日导 orders）— 不要求自动化  
- [ ] Commit `docs: billing production checklist`

---

## Phase C done when

- [x] 真实或沙箱支付成功 → 积分或订阅可查  
- [x] 重复 webhook 不双倍入账  
- [x] 用户可取消续费  
- [x] PRD-06 Acceptance 清单可勾完  

**之后可选 Phase D（不在本计划）：** 微信登录、官方商户迁移、上游 5xx 自动退次、异常限流仪表。
