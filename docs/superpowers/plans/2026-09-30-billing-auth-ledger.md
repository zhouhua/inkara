# PRD-06 · Phase A：Auth + D1 账本

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立登录身份与 Cloudflare D1 积分/订阅账本，暴露只读余额 API 与可单测的 `consume` 核心——尚不接支付、不改纸面主路径。

**Architecture:** Auth.js（邮箱魔法链接）发 session cookie；D1 存 users / credit_lots / subscription / usage / orders 骨架。`src/lib/billing/ledger.ts` 实现扣减优先级（与 design spec §2 一致）。本地用 `wrangler d1`；生产绑定 inkara D1。

**Tech Stack:** Next.js App Router、Auth.js、Cloudflare D1、Vitest、现有 i18n。

**Spec:** `docs/superpowers/specs/2026-09-30-commercial-billing-design.md`  
**PRD:** `docs/prd/2026-09-30-06-commercial-billing.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `wrangler.jsonc` | D1 binding `DB` |
| `migrations/0001_billing.sql` | Schema |
| `src/lib/billing/schema.ts` | 类型 |
| `src/lib/billing/ledger.ts` | `ensureDailyGrant` / `consumeOne` / `getBalance` |
| `src/lib/billing/ledger.test.ts` | 优先级与幂等单测（可用更好的内存 fake 或 miniflare） |
| `src/lib/db-server.ts` | `getDb()` → D1 |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js handlers（路径随选型调整） |
| `src/app/api/billing/me/route.ts` | GET 余额摘要 |
| `src/lib/i18n.ts` | 账户相关最小文案（可 Phase B 补齐 UI） |
| `README.md` | D1 / Auth 环境变量说明 |

**Non-goals：** checkout、webhook、删 BYOK、改 `/api/ask` 扣费（Phase B）。

---

## Locked rules (copy into ledger)

```ts
// consumeOne 伪代码 — 实现必须与此一致
// 1) ensureDailyGrant(userOrAnon, today Asia/Shanghai)
// 2) if activeSub && usage[yyyy-mm] < 500 → usage++; return { ok: true, via: "subscription" }
// 3) if activeSub && usage >= 500:
//      if purchased remaining > 0 → debit purchased; return via purchased
//      else if !goodwillGrantedThisMonth → grant 5 goodwill, debit 1; return via goodwill
//      else return { ok: false, code: "quota_exhausted" }
// 4) if !activeSub:
//      debit purchased else daily_grant else fail quota_exhausted
```

日免：`INSERT OR IGNORE` per `(subject_id, date)` amount=2, expires end of day Shanghai。

---

### Task 1: D1 schema + wrangler binding

**Files:**
- Create: `migrations/0001_billing.sql`
- Modify: `wrangler.jsonc`

- [ ] **Step 1: 写 migration**

表至少包含：`users`, `credit_lots`, `subscriptions`, `subscription_usage`, `goodwill_grants`, `orders`, `ledger_entries`（字段见 design spec §6）。`credit_lots.kind` ∈ `daily_grant|purchased|goodwill`。

- [ ] **Step 2: 绑定 D1**

`wrangler.jsonc` 增加：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "inkara-billing",
    "database_id": "<create via wrangler d1 create>"
  }
]
```

- [ ] **Step 3: 本地 apply**

```bash
npx wrangler d1 create inkara-billing
npx wrangler d1 migrations apply inkara-billing --local
```

Expected: 成功、无 SQL 错误。

- [ ] **Step 4: Commit**

```bash
git add migrations/0001_billing.sql wrangler.jsonc
git commit -m "chore(billing): add D1 schema and wrangler binding"
```

---

### Task 2: Ledger core + tests

**Files:**
- Create: `src/lib/billing/schema.ts`
- Create: `src/lib/billing/ledger.ts`
- Create: `src/lib/billing/ledger.test.ts`
- Create: `src/lib/db-server.ts`（或 `src/lib/billing/db.ts`）

- [ ] **Step 1: 写失败单测骨架**（Vitest）

覆盖：
1. 无订阅无积分 → ensureDailyGrant 后可 consume 2 次，第 3 次 fail  
2. 有订阅 usage&lt;500 → 不扣 purchased  
3. usage 已 500 + purchased 10 → 扣 purchased  
4. usage 500 + 无 purchased → 发 goodwill 5 并可再扣  
5. goodwill 已发且用尽 → fail  
6. 同日 ensureDailyGrant 幂等  

- [ ] **Step 2: 跑测确认失败**

```bash
npm test -- src/lib/billing/ledger.test.ts
```

Expected: FAIL（未实现或断言失败）。

- [ ] **Step 3: 实现 `ledger.ts` 最小通过**

优先 FIFO 扣 `expires_at` 最早的 lot；`purchased` 的 `expires_at` 为 null。

- [ ] **Step 4: 测试通过**

```bash
npm test -- src/lib/billing/ledger.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(billing): ledger consume rules with tests"
```

---

### Task 3: Auth.js 邮箱魔法链接（最小）

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`（或 Auth.js v5 等价）
- Modify: `package.json`（依赖）
- Modify: `README.md`

- [ ] **Step 1: 安装 Auth.js + 适配**

选择与 Next 16 / OpenNext Cloudflare 兼容的安装方式；session 策略 JWT 或 database（users 表）。若 Cloudflare 邮件难发，开发环境允许「固定测试 OTP / 控制台打印链接」。

- [ ] **Step 2: 登录回调写入 `users`**

首次登录 upsert `users(id, email, created_at)`。

- [ ] **Step 3: 手动验收**

本地打开登录 → 收链（或看日志）→ session cookie 存在。

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(auth): magic-link sign-in for billing subjects"
```

---

### Task 4: `GET /api/billing/me`

**Files:**
- Create: `src/app/api/billing/me/route.ts`

- [ ] **Step 1: 实现**

已登录：返回 `{ subscription, usage, credits: { purchased, daily, goodwill }, period }`。  
未登录：若有匿名 subject cookie 则返回日免剩余；否则 `{ anonymous: true, credits: { daily: 0 } }`（客户端可触发 grant）。

- [ ] **Step 2: 手动 curl / 浏览器验收**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(billing): expose GET /api/billing/me"
```

---

### Task 5: 匿名 subject + 登录合并（最小）

**Files:**
- Modify: `src/lib/billing/ledger.ts`
- Create: `src/app/api/billing/anon/route.ts`（签发匿名 id cookie）可选

- [ ] **Step 1: 匿名 `subject_id` cookie**（httpOnly, 随机 uuid）  
- [ ] **Step 2: 登录时将匿名未过期 `daily_grant` remaining 合并到 user，删匿名 lots（事务）  
- [ ] **Step 3: 单测合并一次成功、二次无双倍  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(billing): anonymous daily grant and merge on login"
```

---

## Phase A done when

- [x] D1 migration 可 apply  
- [x] ledger 单测全绿  
- [x] 可登录并 `GET /api/billing/me` 看到结构  
- [x] README 写明 `AUTH_*`、`DB` 绑定  

**Next:** Phase B — ask 闸门 + 去 BYOK UX（可用 SQL/`wrangler d1 execute` 给测试用户塞 `purchased` 积分验收）。
