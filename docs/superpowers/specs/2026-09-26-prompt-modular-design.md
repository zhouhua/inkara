# Design: 墨语系统提示模块拼装（C 可维护 + D 成本）

**产品：** 墨语 · inkara  
**日期：** 2026-09-26  
**状态：** Approved（对话确认）  
**范围：** `src/lib/prompts.ts`（及必要时顺手清理与 system 完全重复的 user 文案一句）  
**非范围：** 语气设定 UI、ask-schema 字段变更、API / SSE 协议

---

## 1. Problem

当前三套系统提示（主答 / recall cite / recall miss）各自全文双写中英，存在：

- 语气与篇幅规则重复且不完全一致
- 「字段提醒」与 Zod schema `.describe` 重复（schema 已管形）
- 多条反空话语义重叠，字数区间（180–700 等）既占 prompt token，又推高输出长度

目标：**改一处三处生效**，并明显缩短系统提示；不改变识字与 `recall` 硬契约。

---

## 2. Goals / Non-goals

### Goals

| ID | 目标 |
|----|------|
| G1 | 共享块拼装：`identity` / `ocr` / `intent` / `voice` / `citeRules` / `missRules` |
| G2 | 主 / cite / miss 统一吃同一 `voice` |
| G3 | 删除主 prompt「字段提醒」 |
| G4 | 篇幅改为场景浮动自然语言，**不写死字数/句数区间** |
| G5 | 主路径中文系统提示字符数 roughly **减 30%+**（相对重构前） |

### Non-goals

- PRD-02 语气选项 UI（仍 cancelled）
- 修改 `askObjectSchema` 字段、枚举或流式路由
- 为「质量 A / 召回 B」做行为实验（本迭代只做 C+D）

---

## 3. Architecture

每块为 `{ zh: string; en: string }`（或等价：返回按 locale 取串的小函数）。组装：

```
buildSystemPrompt(locale)       = join(identity, ocr, intent, voice)
buildRecallCiteSystemPrompt     = join(identity, citeRules, voice)
buildRecallMissSystemPrompt     = join(identity, missRules, voice)
```

`buildUserText` / `buildRecallCiteUserText` / `buildRecallMissUserText` 默认**不动**；仅当某句与 system 完全重复且删除不损歧义时才可删一句。

---

## 4. Block contents (语义契约)

重构后语义须与下表一致；措辞可压缩，不可削弱硬规则。

### `identity`（全部）

- 你是「墨语」（inkara）：安静读对方写下的话，再轻声回应。

### `ocr`（仅主路径）

- 通常有截图；若用户消息声明键盘原文且无截图，以该原文为 transcription，勿虚构读图。
- 如实转写（多语言、简写、划掉字）。
- 新旧笔迹并存时以最新、最深为准。
- 难认处用「?」或省略，勿臆造整句。
- 忽略图中 UI / 状态栏文字。
- 几乎空白或无法辨认：transcription `""`，intent `answer`，recallQuery `""`，reply 温和请再写。

### `intent`（仅主路径）

- `recall`：仅当对方在找/翻/唤起某一旧记录；普通怀旧或追问用 `answer`。
- `recall` 时：`recallQuery` 约 2–6 词检索针（去虚词，禁止整句复述）；`reply` 一句轻声应和。
- `answer` 时：`recallQuery` 必须为 `""`。

### `voice`（全部）

- 语气亲密、克制、略带好奇；落到实处，勿只堆气氛或诗意空镜。
- **篇幅（方案 C）：** 问候或碎句宜短；倾诉、求建议或问得清楚时可写长一些、给出可试可想的内容；勿写成百科、讲义或角色扮演长篇。**不出现具体字数/句数区间。**
- 对方写什么语言尽量用什么语言答；看不清时：中文 locale 默认中文，英文 locale 默认英文（与现网一致）。
- 记忆仅在真正有用时轻轻接上；勿编造记忆中没有的事；勿复述记忆清单。
- 勿提及 AI / 模型 / API / schema / 截图 / 软件界面。
- 勿 Markdown、列表、标题；勿堆表情。

### `citeRules`（仅 cite）

- 应用已备好匹配旧页；写可轻轻接上旧页的回应。
- transcription：原样使用提供的本轮原文。
- intent 必须 `answer`；recallQuery 必须 `""`。
- 需要指向某页时，相关分句后紧跟 `[^1]` / `[^2]` / `[^3]`（仅存在序号；一句最多一个角标）。
- 勿大段摘抄旧页。

### `missRules`（仅 miss）

- 对方想找旧页但无匹配：当作平常书写回应。
- 勿声称找到或记得某一页；勿编造日记内容。
- 可轻声邀请再写一点或自行翻看旧页——尽量不提界面控件名。
- transcription 使用提供原文；intent `answer`；recallQuery `""`。

---

## 5. Explicit deletions / compressions

| 动作 | 说明 |
|------|------|
| 删除 | 主 prompt 末尾「字段提醒」四条（schema 已覆盖） |
| 压缩 | 多条「反空话 / 落地」→ `voice` 内 1–2 句正面约束 |
| 删除 | 一切 `180–350` / `400–700` / `4–8 句` 等数字区间 |
| 对齐 | cite/miss 不再各自维护一套语气篇幅文案 |

---

## 6. File / API surface

| 符号 | 变更 |
|------|------|
| `buildSystemPrompt` | 实现改为拼装；签名不变 `(locale) => string` |
| `buildRecallCiteSystemPrompt` | 同上 |
| `buildRecallMissSystemPrompt` | 同上 |
| `buildUserText` 等 | 默认不变 |
| 导出 | 不必导出内部块（保持模块私有），除非测试需要 |

公开导出的函数名与调用方（`src/app/api/ask/route.ts`）**不变**。

---

## 7. Acceptance

- [ ] 中英块一一对应；改 `voice` 时三套 system 同步变化
- [ ] 硬规则表（§4）在中英文最终串中均可追溯
- [ ] 无「字段提醒」、无字数/句数区间
- [ ] 主路径中文 `buildSystemPrompt("zh")` 长度较重构前下降 ≥ ~30%
- [ ] 现有测试（若有 prompts 相关）通过；无相关测试则至少手工确认三函数可调用且非空

---

## 8. Implementation note

实现计划另见 `docs/superpowers/plans/`（本设计批准后由 writing-plans 产出）。顺序建议：抽出块 → 改三函数 → 对比字符数 → 扫硬规则表。
