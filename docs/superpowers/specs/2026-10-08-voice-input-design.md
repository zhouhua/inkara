# 文字模式语音输入 — 设计规格

**日期：** 2026-10-08  
**状态：** 已评审待实现  
**范围：** 文字模式下的流式听写 + 松手后 LLM 轻润色

## 1. 背景与目标

墨语已有笔迹 / 文字两种输入。本功能在**文字模式**增加麦克风：边说边出字写入现有输入区，松手后做一次轻润色；提交仍走现有 Enter / 双击流程。

**成功标准**

- 中文流式识别可用，语气词由 ASR 侧过滤
- 松手后润色不改原意；失败时保留 ASR 原文
- 视觉与交互保持电子墨水克制风格（无聊天气泡、无厚重卡片）
- API Key 不进入浏览器

## 2. 决策摘要

| 项 | 选择 |
|----|------|
| 接入方式 | 文字模式增强（非第三种 `inputMode`） |
| ASR | 阿里云百炼 `paraformer-realtime-v2` 流式 WebSocket |
| 去语气词 | `disfluency_removal_enabled: true` |
| 润色 | 松手（或到点）后一次 LLM 轻润色 |
| 时长 | 软上限 **3 分钟**；第 **2 分钟** 提示「还剩约 1 分钟」 |
| 凭证 | 服务端 `DASHSCOPE_*` / `MODEL_*`；首版不做用户侧 STT BYOK |
| 存储 | 无需对象存储（流式直推，不经 R2/OSS） |

**明确不做（首版）**

- 语音直接自动提交问答
- 多语言切换 UI
- 设定面板「关闭润色」开关（润色默认开）
- 异步文件转写 / 非流式路径

## 3. 架构

```
[文字模式 textarea / typedText]
        ↑ 流式写入 / 润色覆盖「本次语音区间」
[麦克风控件] ──PCM 16kHz mono──► 浏览器
        │                              │
        │                   wss:///api/stt（鉴权 + 代理）
        │                              ▼
        │                   DashScope Paraformer realtime
        │
        └──结束──► POST /api/stt/polish ──► 现有 LLM ──► 覆盖区间
```

若 OpenNext on Cloudflare 不便挂长连接 WebSocket，用同账号**薄 Worker** 代理 `/api/stt`，主站签发短时票据；产品行为不变。

## 4. 交互与 UI

### 4.1 入口

- 仅 `inputMode === "type"` 且输入未锁定时显示淡墨麦克风（风格对齐现有 `ink-icon-btn`）
- 笔迹模式不出现麦克风

### 4.2 手势与状态

- **按住说话 / 松开关闭**（鼠标与触控）
- 录音中：按钮「录音中」态；底部 hint 可为「正在听…」；尊重 `prefers-reduced-motion`
- 录音中禁止切换笔迹/文字、禁止提交
- **3 分钟**软上限：第 **2 分钟**淡墨「还剩约 1 分钟」；满 3 分钟自动结束 → 同松手流程（保留已识别文字并润色）
- Paraformer 侧 `heartbeat: true`，降低长停顿误断风险

### 4.3 文字写入策略

- 流式 interim / final 写入与键盘同一 `typedText` 状态
- **本次语音区间**：录音开始时记录插入起点；流式过程只替换该区间，不冲掉区间外的已有手打文字
- 若开始时输入区为空，则整段为本次区间
- 松手或到点 → 极短「整理中」→ LLM 结果覆盖**本次区间**；失败保留 ASR 并淡墨提示
- 之后可继续键盘编辑，再按既有提交逻辑交卷

### 4.4 权限与失败

- 首次请求麦克风；拒绝 → 淡墨说明需权限
- 环境不支持 / STT 断线 → 纸上短句 + 可重试（保留已出字）
- 帮助文案补一句：文字模式下可按住麦克风说话

## 5. API 与数据流

### 5.1 `wss:///api/stt`（或等价 Worker）

1. 鉴权与 `/api/ask` 同档：服务端已配置 ASR/模型 Key 即可用；连接前由 HTTP 签发短时票据（避免把长期 Key 暴露给浏览器），有登录会话时可一并绑定
2. 建立至 DashScope 的 WebSocket；`Authorization` 仅服务端携带
3. `run-task`：`model: paraformer-realtime-v2`，`format: pcm`，`sample_rate: 16000`，`disfluency_removal_enabled: true`，`language_hints: ["zh"]`，`heartbeat: true`
4. 转发客户端二进制 PCM；回传 `result-generated` 文本事件
5. 客户端 `finish-task` 后等待 `task-finished` 再关连接

### 5.2 `POST /api/stt/polish`

- Body：`{ text, locale }`（可扩展可选上下文）
- 凭证：`resolveLlmCredentials`（与问答一致）
- System 约束：去掉语气词与口头禅、补标点、不改原意、**只输出正文**
- 超时或错误 → HTTP 错误；客户端保留 ASR 稿

### 5.3 计费与配额（首版）

- STT + 润色走服务端配置 Key，计入运营成本
- 不单独对用户开 STT BYOK；不另计「语音次数」产品配额（若日后与免费问答合并，另开变更）

## 6. 错误矩阵

| 情况 | 行为 |
|------|------|
| 无麦克风权限 | 提示；不开始录音 |
| STT 握手/中途失败 | 保留已识别文字；可再按住重试 |
| 润色失败 / 超时 | 保留 ASR；淡墨「未整理」 |
| 满 3 分钟 | 自动结束 + 润色，同松手 |
| 鉴权失败 | 不建立上游；客户端提示稍后重试 |

## 7. 测试计划

- **单测**：语音区间拼接/替换；润色 prompt 与响应清洗；错误码映射
- **集成**：mock WebSocket 与 `/api/stt/polish`
- **E2E**：文字模式可见麦克风；权限拒绝文案（stub `getUserMedia` 与 API）

## 8. 实现边界

| 纳入 | 不纳入 |
|------|--------|
| 麦克风控件 + 流式写入 + 润色 | 设定项、自动提交、多语 UI |
| STT 代理 + polish 路由 | R2/OSS 临时文件链路 |
| i18n / 帮助一句 | 第三方 Provider 抽象层（可后续） |

## 9. 参考

- [Paraformer 实时 WebSocket](https://help.aliyun.com/zh/model-studio/websocket-for-paraformer-real-time-service)
- [客户端事件（含 disfluency_removal / heartbeat）](https://help.aliyun.com/zh/model-studio/paraformer-client-events)
- 产品时长参照：Typeless 单次上限量级；本产品取 **3 分钟** 软上限以适应短问场景
