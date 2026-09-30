# 墨语 · 后续迭代 PRD 索引

**日期：** 2026-09-30（更新）  
**说明：** 以下 PRD 相互独立，可分迭代实施；**PRD-06 为当前主线**。

| 编号 | 文档 | 主题 | 状态 | 建议工期（MVP） |
|------|------|------|------|-----------------|
| PRD-01 | [2026-09-24-01-first-run-hint.md](./2026-09-24-01-first-run-hint.md) | 首次书写提示 | **Accepted / 已实现** | 0.5–1 天 |
| PRD-02 | [2026-09-24-02-reply-tone.md](./2026-09-24-02-reply-tone.md) | 回复语气微调 | **Cancelled** | — |
| PRD-03 | [2026-09-24-03-history-recall.md](./2026-09-24-03-history-recall.md) | 旧页与续写会话 | **Accepted** | 3–5 天 |
| PRD-04 | [2026-09-24-04-ink-feel.md](./2026-09-24-04-ink-feel.md) | 书写与浮现手感 | Draft | 2–3 天 |
| PRD-05 | [2026-09-24-05-quota-byok.md](./2026-09-24-05-quota-byok.md) | 配额与自备 Key 体验 | **Superseded by PRD-06** | — |
| PRD-06 | [2026-09-30-06-commercial-billing.md](./2026-09-30-06-commercial-billing.md) | 平台模型 + 会员/积分商业化 | **Accepted** | 8–14 天（分 A/B/C） |

**建议实施顺序：** 01（已完成）→ **06-A → 06-B → 06-C** → 03（若未做完）→ 04  

**PRD-06 计划拆分：**

| 期 | 计划 | 内容 |
|----|------|------|
| A | [billing-auth-ledger](../superpowers/plans/2026-09-30-billing-auth-ledger.md) | Auth + D1 账本 + `/api/billing/me` |
| B | [billing-metering-ux](../superpowers/plans/2026-09-30-billing-metering-ux.md) | ask 闸门 + 去 BYOK + BillingDialog |
| C | [billing-payments](../superpowers/plans/2026-09-30-billing-payments.md) | 聚合支付 + 入账 |

**设计定稿：** [commercial-billing-design](../superpowers/specs/2026-09-30-commercial-billing-design.md)

**明确不在本批：** PRD-02 语气、多本日记、账号云同步（记忆仍本地）、真笔迹回放、微信登录（06 Phase D）、BYOK 后门。

**设计总纲：** 仓库根目录 `.impeccable.md`
