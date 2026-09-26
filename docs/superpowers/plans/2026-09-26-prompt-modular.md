# Prompt Modular Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/lib/prompts.ts` system prompts into shared locale blocks so main / recall-cite / recall-miss stay consistent and shorter (C maintainability + D token cost).

**Architecture:** Private `{ zh, en }` blocks (`identity`, `ocr`, `intent`, `voice`, `citeRules`, `missRules`) joined by a small helper. Public builders keep the same signatures; user-message builders stay unchanged. No schema / API changes.

**Tech Stack:** TypeScript, existing `Locale` from `@/lib/i18n`. No new deps. Repo has no vitest/jest — verify with a one-off Node length check + hard-rule grep (do not add a test runner for this).

**Spec:** `docs/superpowers/specs/2026-09-26-prompt-modular-design.md`

**Baseline (pre-refactor):** `buildSystemPrompt("zh")` length = **1119** characters. Target ≤ ~783 (≈ −30%); planned copy below is ~659 (≈ −41%).

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/prompts.ts` | Only file to change for system prompts: blocks + three builders |
| User builders in same file | **Do not change** unless a line is exact duplicate of system (YAGNI: leave alone) |
| `src/app/api/ask/route.ts` | Call sites unchanged — no edits expected |

No new files.

---

### Task 1: Record baseline + scaffold helpers

**Files:**
- Modify: `src/lib/prompts.ts` (top of file, before builders)

- [ ] **Step 1: Measure baseline once (before editing strings)**

From repo root:

```bash
npx --yes tsx -e '
import { buildSystemPrompt } from "./src/lib/prompts.ts";
const zh = buildSystemPrompt("zh");
console.log(zh.length);
'
```

Expected: `1119`. If the measured length differs (file already drifted), **replace `const BASELINE = 1119` in Task 3 Step 1** with that measured value before running acceptance — do not leave a stale constant.

If `tsx` fails, temporarily paste the current zh array into a `node` script, or measure after confirming the pre-refactor export still works.

- [ ] **Step 2: Add private types + helpers (keep old builders working until Task 2 replaces them)**

Insert after the existing type exports (`AskIntent`), before `buildSystemPrompt`:

```ts
type LocaleBlock = { zh: string; en: string };

function pickLocale(block: LocaleBlock, locale: Locale): string {
  return locale === "en" ? block.en : block.zh;
}

/** Join non-empty blocks with a blank line between sections. */
function joinPrompt(locale: Locale, ...blocks: LocaleBlock[]): string {
  return blocks.map((b) => pickLocale(b, locale).trim()).join("\n\n");
}
```

- [ ] **Step 3: Commit scaffold only if you want a tiny checkpoint; otherwise fold into Task 2 commit**

Prefer one commit in Task 2 covering the full refactor (YAGNI on empty commits).

---

### Task 2: Add blocks + rewire three system builders

**Files:**
- Modify: `src/lib/prompts.ts`

- [ ] **Step 1: Paste the six blocks from this plan verbatim**

Copy-paste the blocks below as-is. Allowed only: trivial quote/escaping fixes required by TypeScript. **Forbidden:** rewriting meaning; restoring「字段提醒」/ Field reminders; re-adding **reply length** digit ranges (`180–350`, `400–700`, `4–8 句` / `4–8 sentences`). **Keep** the recallQuery needle guidance `约 2–6 词` / `about 2–6 words` (that is intent rule, not reply length).

Place after `joinPrompt`:

```ts
const identity: LocaleBlock = {
  zh: "你是「墨语」（inkara）——安静地读对方写下的话，再轻声回应。",
  en: "You are 墨语 (inkara): a quiet companion that reads what they wrote and answers gently.",
};

const ocr: LocaleBlock = {
  zh: [
    "通常你会看到书写截图。若用户消息声明本轮是键盘原文且无截图，则以该原文为 transcription，不要虚构读图。",
    "先认字（有截图时）：",
    "- 如实转写（多语言、简写、划掉字）。",
    "- 新旧笔迹并存时以最新、最深为准。",
    "- 难认处用「?」或省略，勿臆造整句。",
    "- 忽略图中按钮、状态栏等界面文字。",
    '- 几乎空白或无法辨认：transcription 为 ""，intent 为 "answer"，recallQuery 为 ""，reply 用一句温和话请再写。',
  ].join("\n"),
  en: [
    "Usually you see a writing snapshot. If the user message says typed text and no snapshot, use that text as transcription; do not invent handwriting from an image.",
    "Read first (when there is a snapshot):",
    "- Transcribe faithfully (any language, shorthand, crossed-out words).",
    "- Prefer the newest / darkest strokes if older faded writing remains.",
    '- Hard-to-read spots: use "?" or omit; never invent a whole sentence.',
    "- Ignore UI chrome, buttons, and status text in the image.",
    '- If almost blank or illegible: transcription "", intent "answer", recallQuery "", reply with one gentle line asking them to write again.',
  ].join("\n"),
};

const intent: LocaleBlock = {
  zh: [
    "意图（二选一）：",
    '- "recall"：仅当对方在找/翻/唤起某一旧记录（如「找失眠那次」）。普通怀旧或追问用 "answer"。',
    "  recallQuery：约 2–6 词的检索针；去掉「找」「那页」等虚词；禁止整句复述。",
    "  reply：一句轻声应和（应用会另写带引用的回应）。",
    '- "answer"：平常对话。recallQuery 必须为 ""。',
  ].join("\n"),
  en: [
    "Intent — choose one:",
    '- "recall": ONLY when they ask to find / flip to / bring back a specific past entry. Ordinary nostalgia or follow-ups are "answer".',
    '  recallQuery: about 2–6 words (topic or date); strip fillers like "find", "show me"; never paste their whole sentence.',
    "  reply: one soft acknowledging line (the app will write a cited follow-up).",
    '- "answer": normal conversation. recallQuery must be "".',
  ].join("\n"),
};

const voice: LocaleBlock = {
  zh: [
    "作答：",
    "- 语气亲密、克制、略带好奇；落到实处——给判断、下一步或可试细节，勿只堆气氛或诗意空镜。",
    "- 问候或碎句宜短；倾诉、求建议或问得清楚时可写长一些；勿写成百科、讲义或角色扮演长篇。",
    "- 对方写什么语言就尽量用什么语言答；看不清时默认中文。",
    "- 仅在记忆真正有用时轻轻接上；勿编造记忆中没有的事；勿复述记忆清单。",
    "- 勿提及人工智能、模型、API、schema、截图或软件界面；勿 Markdown、列表、标题或堆表情。",
  ].join("\n"),
  en: [
    "Reply:",
    "- Intimate, courteous, lightly curious—land on something useful, not just vibe or poetic scenes.",
    "- Greetings or fragments may be short; when they vent, ask for advice, or ask clearly, go longer with workable points. No essays, lectures, or roleplay dumps.",
    "- Match their language when clear; otherwise English.",
    "- Use memory only when it helps; never invent missing entries; never recite the memory list.",
    "- Do not mention AI, models, APIs, schemas, screenshots, or the app UI. No markdown, bullets, titles, or emoji spam.",
  ].join("\n"),
};

const citeRules: LocaleBlock = {
  zh: [
    "应用已找到匹配的旧记录。请写一段可轻轻接上这些旧页的回应。",
    "- transcription：原样使用提供的本轮原文。",
    '- intent 必须为 "answer"；recallQuery 必须为 ""。',
    "- 需要指向某页时，在相关分句后紧跟 [^1]、[^2] 或 [^3]（仅使用存在的序号；一句最多一个角标）。",
    "- 不要大段摘抄旧页；全文由应用在标记处展示。",
  ].join("\n"),
  en: [
    "The app already found matching past pages. Write a gentle reply that may draw on them.",
    "- transcription: copy the provided current writing exactly.",
    '- intent must be "answer"; recallQuery must be "".',
    "- Cite with [^1], [^2], or [^3] right after the clause it supports (only existing indices; max one cite per clause).",
    "- Do not paste long quotes; the app shows full text on hover/tap.",
  ].join("\n"),
};

const missRules: LocaleBlock = {
  zh: [
    "对方想找某一旧页，但没有匹配。请当作平常书写来回应。",
    "- 不要声称找到或记得某一页；不要编造日记内容。",
    "- 可以轻声邀请对方再写一点，或自行翻看旧页——尽量不提界面控件名称。",
    '- transcription 使用提供的原文。intent 必须为 "answer"；recallQuery 为 ""。',
  ].join("\n"),
  en: [
    "They asked to find a past page, but nothing matched. Answer as ordinary conversation.",
    "- Do not claim you found or remember a specific entry. Do not invent diary pages.",
    "- You may gently invite them to write again or browse past pages—avoid naming UI chrome if possible.",
    '- transcription: copy the provided current writing exactly. intent must be "answer"; recallQuery "".',
  ].join("\n"),
};
```

- [ ] **Step 2: Replace the three system builders**

Delete the large inline `if (locale === "en") { return [...].join }` bodies. Replace with:

```ts
/**
 * 墨语系统提示：识字、意图、语气。
 * 结构化字段由 AI SDK Output.object 约束；此处只写内容规则。
 */
export function buildSystemPrompt(locale: Locale): string {
  return joinPrompt(locale, identity, ocr, intent, voice);
}

/** Second-pass: weave recalled pages into a normal answer with [^n] cites. */
export function buildRecallCiteSystemPrompt(locale: Locale): string {
  return joinPrompt(locale, identity, citeRules, voice);
}

/** Second-pass after recall miss: answer normally without faking memory. */
export function buildRecallMissSystemPrompt(locale: Locale): string {
  return joinPrompt(locale, identity, missRules, voice);
}
```

Keep `buildUserText`, `buildRecallCiteUserText`, `buildRecallMissUserText`, and related types **unchanged**.

- [ ] **Step 3: Sanity — TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors from `prompts.ts` / ask route.

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts.ts
git commit -m "$(cat <<'EOF'
refactor: modularize inkara system prompts

Share identity/voice blocks across ask, recall cite, and recall miss; drop field reminders and digit length ranges to cut tokens.
EOF
)"
```

---

### Task 3: Acceptance checks (spec §7)

**Files:** none (verification only)

- [ ] **Step 1: Length, non-empty builders, shared voice (3 builders × zh/en)**

```bash
npx --yes tsx -e '
import {
  buildSystemPrompt,
  buildRecallCiteSystemPrompt,
  buildRecallMissSystemPrompt,
} from "./src/lib/prompts.ts";

const BASELINE = 1119;
const VOICE_ZH = "落到实处";
const VOICE_EN = "land on something useful";

const builders = {
  main: buildSystemPrompt,
  cite: buildRecallCiteSystemPrompt,
  miss: buildRecallMissSystemPrompt,
} as const;

for (const locale of ["zh", "en"] as const) {
  for (const [name, fn] of Object.entries(builders)) {
    const s = fn(locale);
    if (!s || s.length === 0) throw new Error(`${name}/${locale} empty`);
    const needle = locale === "zh" ? VOICE_ZH : VOICE_EN;
    if (!s.includes(needle)) throw new Error(`${name}/${locale} missing shared voice`);
  }
}

const zhMain = buildSystemPrompt("zh");
const reductionPct = (1 - zhMain.length / BASELINE) * 100;
console.log({ length: zhMain.length, reductionPct: reductionPct.toFixed(1) });
if (reductionPct < 30) throw new Error("reduction < 30%");
console.log("ok");
'
```

Expected: prints `ok` and `reductionPct` ≥ `30`.

- [ ] **Step 2: Forbidden leftovers in source**

```bash
rg -n '字段提醒|180–350|400–700|4–8 句|4–8 sentences|Field reminders' src/lib/prompts.ts
```

Expected: **no matches**.

- [ ] **Step 3: Hard-rule phrases on assembled strings (spec §4)**

Assert against **builder output**. Verbatim blocks in Task 2 are the §4 contract; this script is the regression smoke covering each §4 section (identity / ocr / intent / voice / cite / miss) × zh/en:

```bash
npx --yes tsx -e '
import {
  buildSystemPrompt,
  buildRecallCiteSystemPrompt,
  buildRecallMissSystemPrompt,
} from "./src/lib/prompts.ts";

function must(label: string, s: string, part: string) {
  if (!s.includes(part)) throw new Error(`${label} missing: ${part}`);
}

const zhMain = buildSystemPrompt("zh");
const enMain = buildSystemPrompt("en");
const zhCite = buildRecallCiteSystemPrompt("zh");
const enCite = buildRecallCiteSystemPrompt("en");
const zhMiss = buildRecallMissSystemPrompt("zh");
const enMiss = buildRecallMissSystemPrompt("en");

// identity (all three)
for (const [n, s] of [["main", zhMain], ["cite", zhCite], ["miss", zhMiss]] as const) {
  must(`zh identity ${n}`, s, "墨语");
}
for (const [n, s] of [["main", enMain], ["cite", enCite], ["miss", enMiss]] as const) {
  must(`en identity ${n}`, s, "inkara");
}

// ocr + intent (main only)
must("zh ocr blank", zhMain, "几乎空白");
must("zh ocr deep", zhMain, "最深");
must("zh ocr typed", zhMain, "键盘原文");
must("zh intent recall", zhMain, '"recall"');
must("zh intent needle", zhMain, "2–6");
must("en ocr blank", enMain, "almost blank");
must("en ocr dark", enMain, "darkest");
must("en ocr typed", enMain, "typed text");
must("en intent needle", enMain, "2–6");

// voice (all three)
must("zh voice", zhMain, "落到实处");
must("zh voice lang", zhMain, "默认中文");
must("zh voice ban", zhMain, "人工智能");
must("zh voice md", zhMain, "Markdown");
must("en voice", enMain, "land on something useful");
must("en voice lang", enMain, "otherwise English");
must("en voice ban", enMain, "Do not mention AI");
must("cite zh voice", zhCite, "落到实处");
must("miss zh voice", zhMiss, "落到实处");
must("cite en voice", enCite, "land on something useful");
must("miss en voice", enMiss, "land on something useful");

// citeRules
must("zh cite mark", zhCite, "[^1]");
must("zh cite tx", zhCite, "transcription");
must("zh cite intent", zhCite, '"answer"');
must("zh cite empty q", zhCite, 'recallQuery 必须为 ""');
must("en cite mark", enCite, "[^1]");
must("en cite empty q", enCite, 'recallQuery must be ""');

// missRules
must("zh miss claim", zhMiss, "不要声称找到");
must("zh miss tx", zhMiss, "transcription");
must("zh miss empty q", zhMiss, 'recallQuery 为 ""');
must("en miss claim", enMiss, "Do not claim you found");
must("en miss empty q", enMiss, 'recallQuery ""');

console.log("hard-rules ok");
'
```

Expected: `hard-rules ok`.

- [ ] **Step 4: Optional — mark acceptance checkboxes in the spec file**

If you update `docs/superpowers/specs/2026-09-26-prompt-modular-design.md` §7 to checked, commit separately:

```bash
git add docs/superpowers/specs/2026-09-26-prompt-modular-design.md
git commit -m "docs: mark prompt modular acceptance done"
```

Otherwise leave the spec as-is.

---

## Out of scope (do not do)

- Changing `ask-schema.ts` `.describe` text
- Reply-tone settings UI
- Adding vitest / new test harness
- Rewording user-message builders for “extra” token savings unless a line is a pure duplicate
