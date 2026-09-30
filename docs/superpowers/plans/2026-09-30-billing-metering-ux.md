# PRD-06 · Phase B：计费闸门 + 移除 BYOK UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/api/ask` 在成功调度上游前服务端 `consumeOne`；客户端删除 BYOK 与本机配额；用尽时纸面引导「续订/补充」（购买 UI 可先做静态价目 +「即将开放」或深链到 Phase C checkout）。

**Architecture:** Ask 路由解析 session/匿名 subject → `consumeOne` → 仅使用 Worker `MODEL_*`（忽略 body 内 BYOK 字段）。InkPage 去掉 `usesFreeQuota` / BYOK headers。新 `BillingDialog` 取代 `ByokDialog`。`ask-errors` 将 `quota_exhausted` 映射为打开 billing 层。

**Tech Stack:** 现有 Next API、Zustand UI store、Vitest、i18n、globals.css。

**Depends on:** Phase A（ledger + auth + `/api/billing/me`）  
**Spec / PRD:** 同 Phase A 文档。

---

## File map

| File | Responsibility |
|------|----------------|
| `src/app/api/ask/route.ts` | 计费闸门；弃用 request BYOK |
| `src/app/api/recall-rank/route.ts` | 校验同一 subject；不单独扣次 |
| `src/lib/llm.ts` | 生产路径仅环境凭据 |
| `src/components/InkPage.tsx` | 去本机配额/BYOK；错误开 BillingDialog |
| `src/lib/quota.ts` | 删除或改为废弃 no-op + 测试删除 |
| `src/components/ByokDialog.tsx` | **删除** |
| `src/app/api/probe/route.ts` | **删除** |
| `src/components/BillingDialog.tsx` | 价目 + 登录入口（checkout 按钮可先 disabled） |
| `src/components/SettingsPanel.tsx` | 账户/订阅摘要；去自备模型 |
| `src/lib/ask-errors.ts` | `quota_exhausted` → `open_billing` |
| `src/lib/i18n.ts` | 新文案；删 byok 键或保留兼容 |
| `src/app/globals.css` | `.billing-*` 复用淡墨 dialog 气质；删 `.byok-*` |
| `src/lib/byok.ts` / `byok.test.ts` | 删除或仅留内部 |

---

### Task 1: Ask 路由接入 consume

**Files:**
- Modify: `src/app/api/ask/route.ts`
- Modify: `src/lib/llm.ts`
- Test: 可补 `src/app/api/ask/billing-gate.test.ts` 若可抽纯函数

- [ ] **Step 1: 在流式开始前调用 `consumeOne`**

失败返回 JSON/SSE 错误码 `quota_exhausted`（与现有错误风格一致）。成功记录 `ledger_entries.ref` 便于审计。

- [ ] **Step 2: `resolveLlmCredentials` 忽略 body.apiKey**（或仅 `NODE_ENV=development` 且显式 `ALLOW_BYOK=1` 时允许，默认关）

- [ ] **Step 3: 上游失败是否退款**

V1 定稿：**不自动退次**（避免刷退）；文档注明。可选后续「上游 5xx 退次」。

- [ ] **Step 4: 手动验收**

给测试用户 0 余额 → ask 被拒；`wrangler d1 execute` 插入 purchased → ask 成功且 remaining-1。

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(billing): gate /api/ask with server-side consume"
```

---

### Task 2: 客户端去配额 / 去 BYOK 传参

**Files:**
- Modify: `src/components/InkPage.tsx`
- Modify: `src/lib/settings.ts`, `src/stores/settings-store.ts`
- Delete/stop using: `src/lib/quota.ts`

- [ ] **Step 1: 移除 `canUseFreeAsk` / `recordFreeAsk` / BYOK body 字段**  
- [ ] **Step 2: settings 类型去掉 apiKey/baseUrl/model；迁移：读到旧字段则忽略**  
- [ ] **Step 3: 跑相关 vitest，删 `quota.test.ts` 或改写**  
- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove client quota and BYOK request fields"
```

---

### Task 3: 删除 ByokDialog / probe；错误动作改开 Billing

**Files:**
- Delete: `src/components/ByokDialog.tsx`
- Delete: `src/app/api/probe/route.ts`
- Modify: `src/lib/ask-errors.ts`
- Modify: `src/components/SettingsPanel.tsx`, `HelpPanel.tsx`（若提及自备 Key）
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: `PaperErrorAction` 增加 `open_billing`；`quota_exhausted` 用它**  
- [ ] **Step 2: 文案 `quotaExceeded` 改为「纸需要歇一歇…」类；按钮「续订或补充次数」  
- [ ] **Step 3: 设定页去掉自备模型行；改为账户摘要（调 `/api/billing/me`）  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(billing): replace BYOK UX with billing entry points"
```

---

### Task 4: BillingDialog（价目展示 + 登录）

**Files:**
- Create: `src/components/BillingDialog.tsx`
- Modify: `src/stores/ui-store.ts`（`billingOpen`）
- Modify: `src/app/globals.css`
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: UI 展示 SKU 与价格（锁定价目）**；气质对齐原 byok-dialog（克制）  
- [ ] **Step 2: 未登录显示「先登录」→ Auth 流程  
- [ ] **Step 3: 购买按钮 Phase B 可显示「支付接入中」或调用尚未实现的 checkout（404 时纸面友好错误）  
- [ ] **Step 4: 手动点通：用尽 → 按钮 → 对话框  
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(billing): add BillingDialog with locked price list"
```

---

### Task 5: README / Help 文案同步

- [ ] 删除 README 中 BYOK 主路径说明；改为会员/积分与 `MODEL_*` 运维说明  
- [ ] HelpPanel 去掉「自备 Key」教学  
- [ ] Commit: `docs: update help and README for platform billing`

---

## Phase B done when

- [x] 无 BYOK UI；probe 路由不存在  
- [x] 服务端无余额时无法 ask  
- [x] 有测试积分时可完整手写问答  
- [x] 纸面用尽 → BillingDialog  

**Next:** Phase C — 聚合支付真正入账。
