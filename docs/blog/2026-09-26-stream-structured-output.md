# 结构化也能流式：`streamText` + `Output.object` → `partialOutputStream`

**TL;DR：** 产品要「结构化字段」（识字、意图、检索针）又要纸面尽早逐字浮现。手写扫 `"reply":"` 能跑，但 escape / 半截 unicode / 乱序都得自己扛。我们改成 Vercel AI SDK 的现行写法：`streamText` + `Output.object({ schema })`，用 `partialOutputStream` 拿 DeepPartial 对象，再映射成自家 SSE（`delta` / `meta` / `done`）。传输层本来就是 SSE；成熟方案解决的是**模型侧假 JSON 怎么边生成边读**，不是「要不要 SSE」。

默认读者写过一点 chat stream；把 Structured Output 想成「模型按 schema 吐对象」即可。

---

## 场景与约束

典型需求：一轮问答要同时给出——

| 字段 | 用途 | 何时要到 UI |
|------|------|-------------|
| `transcription` | 识出手写 / 权威键盘原文 | 尽早（淡墨引用） |
| `reply` | 写在纸上的回应 | **边生成边浮现** |
| `intent` | `answer` / `recall` | 结束时够用 |
| `recallQuery` | 召回检索针 | 结束时够用 |

如果等完整 JSON 再 `JSON.parse`，纸面会空很久。如果改成纯文本流，意图和召回又要另开一轮或靠脆弱的后处理。

更实际的目标是：**结构化契约交给 schema；可朗读字段交给 partial 流；前端协议保持简单。**

---

## 思路：三层各干一件事

```
上游 chat（OpenAI 兼容，可 BYOK）
  → AI SDK：streamText + Output.object(schema)
  → partialOutputStream（DeepPartial）
  → 路由层：reply 增量 → SSE delta；transcription → meta；完整对象 → done
  → 前端：原有 askPageStream，不感知模型 JSON
```

| 层 | 职责 |
|----|------|
| Schema（Zod） | 字段形状、枚举、`.describe` 给模型的提示 |
| `partialOutputStream` | 半截 JSON 也能读出已出现的字段 |
| 自家 SSE | 产品事件模型，和厂商 delta 解耦 |

注意：AI SDK 7 里旧的 `streamObject` 已标 `@deprecated`，官方继任者就是上面这套——名字变了，心智模型没变。

---

## 亮点一：Schema 替代「字段顺序契约」

以前靠 prompt 写死「只输出 JSON，且按 `transcription → reply → …`」，再在服务端用字符串状态机抠 `reply`。能流，但属于重复造轮子。

现在用 Zod 描述对象；属性顺序仍建议把**要先展示的字符串字段放前面**（不少模型按 schema / 提示顺序生成，有利于 partial 尽早变长）：

```ts
export const askObjectSchema = z.object({
  transcription: z.string().describe("…"),
  reply: z.string().describe("…"),
  intent: z.enum(["answer", "recall"]).describe("…"),
  recallQuery: z.string().describe("…"),
});
```

调用侧：

```ts
const result = streamText({
  model,
  system,
  messages: [{ role: "user", content: userContent }], // 可含 image
  temperature: 0.75,
  maxOutputTokens: 1600,
  output: Output.object({
    name: "InkAsk",
    description: "…",
    schema: askObjectSchema,
  }),
});
```

系统提示里可以删掉大段「只输出 JSON / 字段顺序」示例，改成行为与语气规则；JSON 形状交给 SDK 注入的 schema 引导。内容规则（何时 `recall`、禁止脑补手写）仍写在 prompt 里——**schema 管形，prompt 管义**。

---

## 亮点二：`partialOutputStream` 代替手写抽取器

消费方式很直白：每次得到一个可能不完整的对象，自己算字符串增量即可。

```ts
let emittedReply = "";

for await (const partial of result.partialOutputStream) {
  if (typeof partial.transcription === "string" && !metaSent) {
    metaSent = true;
    send({ type: "meta", transcription: partial.transcription });
  }

  if (typeof partial.reply === "string" && partial.reply.length > emittedReply.length) {
    const deltas = partial.reply.slice(emittedReply.length);
    emittedReply = partial.reply;
    if (deltas) send({ type: "delta", text: deltas });
  }
}

const output = await result.output; // 结束时再做校验后的完整对象
```

要点：

1. **Partial 不做严格校验**——半截对象可能还不满足 schema；完整结果看 `result.output`。  
2. **增量自己切**——`partial.reply` 是累计值，用 `slice(emitted)` 得到本轮 delta，和旧抽取器对外行为一致。  
3. **`intent` / `recallQuery` 可以等 done**——不必在 partial 里抢跑业务分支。

原先几十行 escape / `\uXXXX` 状态机可以删掉；边界情况交给库。

---

## 亮点三：BYOK 与「假 Structured Outputs」要分清

墨语服务端是薄代理：用户可填自己的 Key / Base URL / 模型（OpenAI 兼容）。厂商是否支持严格的 `json_schema` 参差不齐。

做法是用 `@ai-sdk/openai-compatible`，并显式关掉严格结构化输出，让 SDK 走更宽的 JSON mode + schema 引导：

```ts
const provider = createOpenAICompatible({
  name: "inkara",
  apiKey,
  baseURL,
  supportsStructuredOutputs: false, // 兼容 DashScope 等非标端点
});
```

这很重要：

- **Structured Outputs（严格）** 保证最终形状，不等于 partial 解析本身。  
- **关严格模式** 不等于放弃 schema——SDK 仍会引导模型吐 JSON，并用 partial 解析喂给 `partialOutputStream`。  
- 锁死单一官方 SDK、且端点支持 strict 时，可以把开关打开；做 BYOK 薄代理时，宁可先宽后严。

同一套 `createLlmModel` / 凭据解析，也可以给非流式路由复用：探测连接用 `generateText`，召回重排用 `generateText` + `Output.object`——流式与非流式共享 schema 心智。

---

## 亮点四：前端协议可以不动

浏览器 ↔ `/api/ask` 仍是 SSE：

| 事件 | 含义 |
|------|------|
| `meta` | transcription 就绪 |
| `delta` | reply 增量 |
| `done` | 四字段齐全（含 intent） |
| `error` | 上游鉴权失败等 |

换的是**服务端怎么从模型 token 得到这些事件**；`askPageStream` 与纸面浮现逻辑不用跟着厂商格式改。

这是刻意的边界：成熟方案吃在「解析与校验」层，产品事件模型保持稳定。

---

## 刻意不做的

- **直接把 AI SDK UI 流推到浏览器**——纸面产品要自己的 `delta` / `meta` / `gateReveal`，薄一层映射更可控。  
- **继续维护手写 JSON 抽取器**——除非 schema 极简且要零依赖；否则 escape 与半截文档会反复咬人。  
- **为了流式把字段拆成多次模型调用**——识字一轮、回答一轮会加倍延迟与费用；单对象 + partial 通常更划算。  
- **假设所有 BYOK 端点都支持 strict `json_schema`**——兼容面比「正确性上限」更优先时，关掉 `supportsStructuredOutputs`。

---

## 工程上值得记下的

- Partial 流里的字符串是**累计快照**，发 UI 前记得做 delta，避免整段重绘或重复追加。  
- `result.output` 可能因解析/校验失败 reject：有 partial `reply` 时仍可降级展示；完全空则产品侧给一句安静的 fallback。  
- 视觉输入用 AI SDK 的 `{ type: "image", image: dataUrl }`，不要死抱旧的 `image_url` chat 拼装（交给 provider 适配）。  
- Prompt 与 schema 职责拆开后，少在系统提示里重复贴一整份 JSON 示例，减少「两套契约互相打架」。

---

## 小结

这套方案对准三件事：

1. **形**靠 `Output.object({ schema })`，少写字段顺序咒语  
2. **流**靠 `partialOutputStream`，结构化也能边生成边展示  
3. **边界**靠自家 SSE + 可选关闭 strict，BYOK 与纸面 UX 不被厂商细节绑死  

需要「对象里的长文本尽早上屏」，又不愿手写假 JSON 解析时，`streamText` + `Output.object` → `partialOutputStream` 是一条已经产品化的中间道路：比等完整 `JSON.parse` 跟手，比纯文本流更好接业务字段，比自研抽取器少一类长期 bug。

---

## 延伸阅读

- [Generating Structured Data（AI SDK）](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — `Output.object` 与 `partialOutputStream`  
- [OpenAI Compatible Providers](https://ai-sdk.dev/providers/openai-compatible-providers) — 自定义 baseURL / BYOK  
- 同系列：[客户端混合召回](./2026-09-25-hybrid-recall.md) — 召回侧如何用同一对话模型做小集合重排
