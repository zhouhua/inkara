# PRD：首次书写提示（First-run Hint）

**产品：** 墨语 · inkara  
**文档编号：** PRD-01  
**日期：** 2026-09-24  
**状态：** Accepted（经 grilling 定稿）  
**设计原则对齐：** `.impeccable.md`（纸面即产品、克制留白）

---

## 1. Summary

新用户打开墨语时，底栏虽有提交说明，但与日常状态文案混在一起，缺少「教一次」的节奏，交卷手势（双击空白 / Enter）不够醒目。本功能在底栏用**首次专用文案**说明「写下 → 交给纸」；用户**一旦进入交卷（`fading`）即毕业**，之后永久回到现有日常提示。无 Modal、无纸面注解、不改提交手势。

---

## 2. Contacts

| 角色 | 说明 |
|------|------|
| 产品 / 设计 | 文案语气与显隐边界 |
| 工程 | `hasCommittedOnce` 持久化、`dockHint` 分支、i18n |

---

## 3. Background

### 上下文

- 默认**主动提交**：双击纸面空白或 Enter；文字模式 Shift+Enter 换行。  
- 底栏已有 `submitHintManual` / `submitHintAuto*` 等，在 `ready` / `writing` 常驻。  
- 缺口不是「完全没有提示」，而是**首次与日常无差异**，用户难以建立「写完要交卷」的因果。

### 为什么现在做

主闭环已可用；降低第一次成功交卷的认知成本，否则后续能力接触不到用户。

### Grill 结论（问题诊断）

主因定为：**首次节奏不清（C）+ 必须讲清交卷手势（A）**。不把「以为不能写」当作 MVP 主因（避免强制示例句）。

---

## 4. Objective

**目标：** 第一次打开的人能明白「写一点，再交卷」，并在第一次真正交卷后不再被新手文案打扰。

### Key Results

| KR | 指标 | 目标 |
|----|------|------|
| KR1 | 未毕业时底栏展示首次文案 | 100%（ready/writing 且无 statusExtra） |
| KR2 | 进入 `fading` 后 `hasCommittedOnce === true` 并持久化 | 100% |
| KR3 | 毕业后仅使用现有 `submitHint*` | 100% |
| KR4 | 无纸面提示层、无 Modal | 验收通过 |
| KR5 | 尊重 `prefers-reduced-motion` | 本功能无强制动画（仅换文案） |

---

## 5. Market Segment(s)

| 细分 | Jobs to be done | 约束 |
|------|-----------------|------|
| 第一次打开的好奇者 | 「写完怎么问？」 | 不读说明书 |
| 回访用户（含已有 memory） | 上线后仍看到一次首次文案 | **不**因已有 memory 自动毕业（Grill Q4=B） |
| 毕业后用户 | 安静日常提示 | 本机标志位；清站点数据可再现 |

---

## 6. Value Proposition(s)

| 维度 | 内容 |
|------|------|
| 获得 | 一次说清「写下 → 交卷」 |
| 避免 | 写完干等、以为坏了 |
| 差异 | 只换底栏句子，不像 onboarding 卡片 |

---

## 7. Solution

### 7.1 决策锁定（Grill）

| # | 决策 | 选择 |
|---|------|------|
| Q1 | 主因 | 首次节奏 + 交卷手势 |
| Q2 | 位置 | **仅底栏** |
| Q3/Q5 | 毕业 | **进入 `fading` 即毕业**（含随后报错/配额失败） |
| Q4 | 迁移 | 老用户也再看一次；有 memory **不**自动毕业 |
| Q6 | 差异手段 | **只换文案**，不加粗/新样式 |
| Q7 | writing | 换更短的交卷句 |
| Q8 | 自动模式 | 主讲停笔提交，兼提双击/Enter |
| Q9 | 错误 | `statusExtra` / error **优先**，不与首次句拼接 |
| Q10 | 字段名 | `hasCommittedOnce` |
| Q11 | 文案 | 见下表 |
| Q12 | 设定重置 | **不进 MVP**（留 v1.1） |
| Q13 | phase | 与今日日常提示相同：仅 `ready` / `writing` |

### 7.2 UX / 流程

```text
打开 App（hasCommittedOnce === false）
  → ready/writing 且无 statusExtra
  → dockHint = 首次文案（随 submitMode / inputMode / 是否有内容）

用户双击 / Enter / 自动停笔到期 → 进入 fading
  → 立即 hasCommittedOnce = true 并写入 IndexedDB
  → 此后（含本次后续 thinking/error/成功）不再用首次文案

statusExtra 或 error 占用 dock 时
  → 只显示错误/附加状态（首次句让路）
```

**视觉约束：**

- 无 Modal、无遮罩、无「下一步」、无纸面中下部注解  
- 不新增 CSS 强调 class；复用现有 `.submit-hint`  
- 不挡纸面垂直中心书写带（因不在纸面画字）

### 7.3 文案定稿（i18n）

| 状态 | 中文 | English |
|------|------|---------|
| 首次 · 手动 · 空白 | 写下一点，然后双击空白或按 Enter | Write something, then double-tap empty or press Enter |
| 首次 · 手动 · 书写中（有内容） | 双击空白或按 Enter 交给纸 | Double-tap empty or press Enter to send |
| 首次 · 手动 · 文字模式 · 空白 | （空白句）· Shift+Enter 换行 | （空白句）· Shift+Enter for a new line |
| 首次 · 自动 · 空白 | 写下一点，停笔后将提交 · 也可双击或 Enter | Write something; it sends when you pause · or double-tap / Enter |
| 首次 · 自动 · 书写中 | 停笔后将提交 · 也可双击或 Enter | Sends when you pause · or double-tap / Enter |

毕业后：继续使用现有 `submitHintManual` / `submitHintTypeExtra` / `submitHintAuto*`。

「书写中 / 有内容」判定与现有 `contentPresent` 一致：`typedText.trim()` 有字或 `phase === "writing"`。

### 7.4 Key Features

| ID | 功能 | 说明 |
|----|------|------|
| F1 | `hasCommittedOnce` | 写入 `AppSettings`（或同等 settings 持久化）；默认 `false` |
| F2 | 首次 `dockHint` 分支 | `!hasCommittedOnce` 时用上表；否则现有逻辑 |
| F3 | 毕业写入 | 进入 `fading` 的同一路径里置 `true` 并 persist（笔迹/文字/自动提交均覆盖） |
| F4 | 错误优先 | 保持 `if (statusExtra) return statusExtra` 在首次分支之前 |
| F5 | i18n | 新增首次文案 key（中英） |

### 7.5 User Stories & Acceptance Criteria

**Story A** — 首次交卷说明  

- [ ] `hasCommittedOnce === false` 且 ready/writing、无 statusExtra → 显示首次文案  
- [ ] 手动空白 / 书写中 / 自动空白 / 自动书写中 / 文字模式空白 五种组合符合上表  
- [ ] 文案不含「AI」「模型」等  

**Story B** — 毕业  

- [ ] 第一次进入 `fading` 后标志为 true 并持久化  
- [ ] 刷新后不再出现首次文案  
- [ ] 该次请求随后配额错误 / 网络错误 → 仍保持已毕业  
- [ ] 本机已有 memory 的老用户：升级后仍会看到首次文案，直到自己交卷一次  

**Story C** — 让路  

- [ ] 有 `statusExtra` 或 busy/error 相时，不拼接首次句  
- [ ] 清页不重置 `hasCommittedOnce`

### 7.6 Non-Goals

- 纸面注解、多步导览、示范动画、强制示例句  
- 改双击 / Enter / 自动停笔手势本身  
- 设定中「再次显示使用提示」（v1.1）  
- 账号级新手状态  
- 因 memory ≥ 1 自动毕业  

### 7.7 Technology

- `src/lib/settings.ts`：字段 + 默认值 + 读盘兼容（缺省 = `false`）  
- `src/components/InkPage.tsx`：`dockHint` 首次分支；进入 `fading` 时 persist  
- `src/lib/i18n.ts`：新 key  
- 无需新依赖；无新浮层组件  

### 7.8 Assumptions

- 用户卡点主要是「如何交卷」，不是「能否落笔」。  
- 仅换文案足以制造首次节奏；若上线后仍大量「看不见」，再单独立项考虑纸面淡字（需新 PRD）。

---

## 8. Release

| 阶段 | 范围 | 相对工期 |
|------|------|----------|
| **MVP（本周期）** | F1–F5 | 约 0.5–1 天 |
| v1.1 | 设定中重置 `hasCommittedOnce` | 约 0.5 天 |
| 不做 | 互动教程、埋点看板 | — |

**验收清单（手工）：**

1. 清站点数据 → 见首次空白文案  
2. 写一字进入 writing → 见首次短句  
3. 双击提交进入 fading → 刷新后为日常 `submitHint*`  
4. 无 Key/配额导致纸面错误 → 仍保持已毕业  
5. 切文字模式空白 → 含 Shift+Enter  
6. 切自动提交空白 → 含停笔将提交  
7. 有旧 memory 的配置升级后 → 仍先见首次文案，交卷后消失  

**实现建议顺序：** settings 字段 → i18n → dockHint 分支 → fading 时写入 → 手工验收。
