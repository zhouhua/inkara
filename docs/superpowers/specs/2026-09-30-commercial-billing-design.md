# 墨语 · 商业化计费设计定稿

**日期：** 2026-09-30  
**状态：** Accepted（grilling 达成共识）  
**取代：** PRD-05 所依赖的「本机配额 + BYOK」长期路径（PRD-05 UX 若已实现可保留纸面错误动作模式，但计费模型作废）

---

## 1. 产品决策摘要

| 决策 | 定稿 |
|------|------|
| 模型供给 | 平台统一提供；**彻底移除**面向用户的 BYOK（Key / Endpoint / 模型） |
| 变现 | **单档会员**（月/季/年）+ **积分包**；无多档权益差异 |
| 市场 | 中国大陆；官方直连微信支付 + 支付宝（无聚合） |
| 计量 | 每次成功回答 = **1 积分**（召回整轮也只扣 1） |
| 身份 | 匿名可用当日免费积分；**购买 / 订阅必须登录** |
| 免费 | 每日发放 **2** 点「**当天有效**」积分（统一账本，不再单独 `quota` 计数器） |
| 会员 | ¥19 / ¥49 / ¥189；月软顶 **500**；按自然月重置；未触顶无日上限 |
| 积分包 | ¥9.9（50）/ ¥25（150）/ ¥59（500）；**永不过期**；**不限日消耗** |
| 退款 | 可取消续费；**已扣周期不退**；积分包**购买不退** |
| 顶满顺序 | 会员用量 → 购买积分 → 善意 5（每月一次）→ 硬停 → **次日再发 2 点日免** |

---

## 2. 账本模型

### 2.1 积分类型

| 类型 | `kind` | 来源 | 有效期 |
|------|--------|------|--------|
| 日免 | `daily_grant` | 每日发放 2 | 当天 23:59:59（用户时区默认 `Asia/Shanghai`） |
| 购买 | `purchased` | 积分包入账 | 永不过期 |
| 善意 | `goodwill` | 触顶且无购买余额时 | 该计费月仅发一次；用完即止 |

会员用量不是「积分余额」，而是周期计数器：`subscription_usage.period` + `count`，软顶 500。

### 2.2 扣减优先级

**有有效订阅且本月 `count < 500`：**  
只增加 `subscription_usage`，不扣任何积分余额。

**有有效订阅且本月 `count >= 500`：**  
1. 扣 `purchased`  
2. 若无 → 若本月未发过 goodwill → 入账 5 点 `goodwill` 再扣  
3. 若 goodwill 也无 → 拒绝（`quota_exhausted`）

**无有效订阅：**  
1. 扣 `purchased`（若有）  
2. 否则扣未过期的 `daily_grant`  
3. 都无 → 拒绝；**不**在同一次请求里自动发 goodwill（善意仅挂在「会员软顶后」路径；无订阅用户依赖日免 + 购买包）

> Grill 原文善意挂在「池空」。定稿解释：无订阅时「池」= 购买积分 + 当日日免；日免次日恢复即软着陆。会员软顶后的善意 5 是额外体恤，避免刚办会员的人顶满后立刻羞辱感。

### 2.3 日免发放

- 触发：用户首次在当日发起需计费的 ask（或打开账户页）时，幂等 upsert：`user_id + date → grant 2`。  
- 匿名：用弱身份（见 §3）同样可领当日 2 点；清数据可重生匿名身份 → 接受少量套利，靠成本与限流消化。  
- 硬停次日：再发 2 点日免（同一规则）。

---

## 3. 身份

| 角色 | 能力 |
|------|------|
| 匿名（可选 cookie / 设备 token） | 仅消耗当日 `daily_grant` |
| 已登录未付费 | 同日免；可打开购买/订阅 |
| 已登录 + 订阅或购买积分 | 走 §2.2 |

**V1 Auth 选型（工程默认，可替换）：**  
Auth.js（或 Clerk）+ **邮箱魔法链接** 先行；微信 OAuth 列为 Phase 2（大陆转化更优，但申请成本高）。

登录后须支持：把匿名当日剩余日免 **合并** 到用户账本（一次性，防刷）。

---

## 4. 商品 SKU

| SKU | 类型 | 价格 | 权益 |
|-----|------|-----:|------|
| `sub_month` | 订阅 | ¥19 | 当月起 1 个自然月；软顶 500/月 |
| `sub_quarter` | 订阅 | ¥49 | 3 个自然月 |
| `sub_year` | 订阅 | ¥189 | 12 个自然月 |
| `pack_50` | 一次性 | ¥9.9 | +50 `purchased` |
| `pack_150` | 一次性 | ¥25 | +150 `purchased` |
| `pack_500` | 一次性 | ¥59 | +500 `purchased` |

订阅续费：V1 做「到期前提醒 + 手动续」；取消后续费停，**已付周期用满**。

---

## 5. API 合约（草）

| 方法 | 路径 | 作用 |
|------|------|------|
| POST | `/api/ask` | 计费闸门：鉴权/匿名 → `consume(1)` 成功后再调上游；失败回滚或标记 |
| POST | `/api/recall-rank` | **不单独扣次**（成本计入同轮 ask）；但须同一用户会话 |
| GET | `/api/billing/me` | 余额、订阅、本月用量、是否已发 goodwill |
| POST | `/api/billing/checkout` | 创建支付单（sku + channel）→ 跳转/二维码 |
| POST | `/api/billing/webhook/[channel]` | 微信/支付宝回调；验签；幂等入账 |
| GET/PUT | `/api/sync/settings` | 云端设定 |
| GET/POST | `/api/sync/pages` | 日记页列表 / 追加（写页后 Workers AI → Vectorize） |
| DELETE | `/api/sync/pages/[id]` | 删页 + 删向量 |
| POST | `/api/recall` | 词法 ∪ Vectorize ANN |
| GET/POST | `/api/auth/*` | 登录登出回调 |

错误码（纸面映射）：

| code | 纸面动作 |
|------|----------|
| `quota_exhausted` | 打开「续订 / 补充次数」层（取代「去设定」） |
| `login_required` | 打开登录（购买前） |
| `payment_required` | 同 exhausted，文案偏引导购买 |

移除：`missing_api_key` / BYOK `unauthorized` 作为用户路径（上游 401 改为 `upstream_busy` 或运维告警）。

---

## 6. 存储（Cloudflare）

Worker 无本地库。V1 绑定 **D1**：

- `users`  
- `credit_lots`（按批：kind, amount, remaining, expires_at, created_at）  
- `subscription`（user_id, sku, status, current_period_start/end, cancel_at_period_end）  
- `subscription_usage`（user_id, period_yyyy_mm, count）  
- `goodwill_grants`（user_id, period_yyyy_mm, unique）  
- `orders`（id, user_id, sku, amount, status, provider_trade_no, raw）  
- `ledger_entries`（审计：delta, reason, ref_order / ref_ask）

客户端不再使用 IndexedDB；设定 / 日记页存 D1 `inkara`，向量存 Vectorize `inkara-pages`（Workers AI bge-m3），匿名与登录共用 `subject_id` / namespace。

---

## 7. UI 影响

- **删除** `ByokDialog`、设定内自备模型段、`/api/probe`（或改内部健康检查）。  
- **新增** 克制的「纸需要歇一歇」层：登录 / 会员价目 / 积分包（非运营弹窗堆叠；对齐 `.impeccable.md`）。  
- 设定改为：语言、账户、订阅状态、购买入口——不是 Key 表单。

---

## 8. 明确不做（V1）

多档模型售卖、BYOK 后门、海外 Stripe、发票对公、积分日上限 UI、免费余量「还剩 n 次」预告（可在账户页静默展示余额，纸面仍克制）。

---

## 9. 成功标准

1. 无用户 Key 时生产环境仍可用（平台 `MODEL_*`）。  
2. 未登录用户每天恰好能成功回答 2 次（服务端强制）。  
3. 支付成功后积分/订阅在 1 分钟内可查、可消费。  
4. 设定与纸面不再出现 API Key / Endpoint / 模型输入。  
5. 单测覆盖：扣减优先级、日免幂等、软顶→购买积分→善意→拒绝。  
