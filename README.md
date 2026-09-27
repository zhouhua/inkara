# 墨语 · inkara

用鼠标或手写笔在纸上书写。停笔片刻后，墨迹渗入纸中，页面思考，再以手写笔迹浮现回答。

**线上体验：** [https://inkara.zhouhua.site](https://inkara.zhouhua.site)

灵感来自 [riddle](https://github.com/MaximeRivest/riddle)，面向 Web，技术栈为 Next.js；模型走 OpenAI 兼容接口。

## 功能

- 鼠标 / 触控笔 / 触摸书写（压感影响线宽）；也可切换键盘输入
- 默认主动提交：双击空白或 Enter（笔迹 / 文字模式均可）；文字模式 Shift+Enter 换行
- 设定可选自动延迟提交（快 3.4s / 普通 4.5s / 慢 6s），底部环形进度提示
- 墨迹渗入 → 辨认内容以淡墨引用常驻 → **流式**生成 → 手写体在纸面中部逐字浮现
- 用墨迹召唤旧页（写「找失眠那页」等，淡墨重现）
- 失败 / 离线时把原因写在纸上，并以淡墨文字按钮「重试」或「去设定」给出下一步（不再轻触整纸重试）
- 纸张样式、同页「旧页」历史、导出本页 PNG
- 本地对话记忆（可遗忘）；PWA 可安装全屏
- 中英文界面（默认中文）；右上角「？」可打开使用帮助
- 设定中可填写自备 API Key / Endpoint / 模型（OpenAI 兼容），并可用「测试连接」校验；正式环境未配置时每天限 2 次免费问答（计数存本机，清站点数据会重置）

## 快速开始

```bash
cp .env.example .env.local
# 编辑 .env.local，填入模型 API Key 与 Endpoint
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

手机或桌面浏览器可通过「添加到主屏幕 / 安装应用」以独立窗口打开。

### 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `MODEL_API_KEY` | 服务端默认 API Key（用户未自备时使用） | — |
| `MODEL_BASE_URL` | OpenAI 兼容接口 Base URL | — |
| `MODEL_NAME` | 视觉模型名称 | — |

正式构建（`next start` / 生产部署）下，用户若未在设定中填写自己的 API Key，每天仅可免费问答 2 次；超出后需自行配置 Key。开发模式（`next dev`）不限次。

用户数据（设定、自备凭据、历史、配额）保存在浏览器 IndexedDB，不再使用 localStorage。

请使用支持识图的视觉模型。

## 部署到 Cloudflare Workers

本项目通过 [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) 部署到 Cloudflare Workers。

**线上地址**

- 自定义域名：<https://inkara.zhouhua.site>
- workers.dev：<https://inkara.zhouhuasjtu.workers.dev>（部分网络可能较慢或超时）

> 说明：客户端 embedding 依赖的 ONNX Runtime asyncify WASM 超过 Workers 单文件 25 MiB 限制，构建后会剔除该静态资源，运行时从 jsDelivr CDN 加载（见 `scripts/strip-cf-oversized-assets.mjs`）。

### 本地预览（Workers 运行时）

```bash
# 确保 .env.local 或 .dev.vars 中已配置 MODEL_*（preview 会按生产环境加载）
npm run preview
```

### 本机直接发布

```bash
npx wrangler login
npm run deploy
```

生产环境已配置 Worker Secrets：`MODEL_API_KEY` / `MODEL_BASE_URL` / `MODEL_NAME`，以及自定义域名 `inkara.zhouhua.site`。更新密钥：

```bash
printf '%s' '新值' | npx wrangler secret put MODEL_API_KEY
```

### GitHub 自动部署

Worker 已上线；若要推 `main` 自动构建，在 Dashboard 连接仓库即可（不会覆盖已绑域名与 Secrets）：

1. [inkara → Settings → Builds](https://dash.cloudflare.com/cfea794e1892010a07baac1bfd95fa22/workers/services/view/inkara/production/settings) → **Connect** GitHub 仓库 `zhouhua/inkara`
2. Worker 名称须为 `inkara`（与 [`wrangler.jsonc`](wrangler.jsonc) 中 `name` 一致）
3. 构建配置建议：
   - **Build command**：`npx opennextjs-cloudflare build && node scripts/strip-cf-oversized-assets.mjs`
   - **Deploy command**：`npx opennextjs-cloudflare deploy`
   - **Root directory**：仓库根目录
   - **Production branch**：`main`

本地日常开发仍用 `npm run dev`。

## 使用

1. 在纸面书写或输入  
2. **双击空白**或按 **Enter** 提交（文字模式用 Shift+Enter 换行）  
3. 墨迹渗入后，顶部可保留淡墨引用辨认内容；回答在纸面中部浮现  
4. 写「找××那页」可唤起旧页；轻触纸面回到今天  
5. 设定里可改为自动延迟提交，并选择快 / 普通 / 慢；也可填写自备 API Key / Endpoint / 模型  
6. 右上角：笔迹 / 文字、旧页、帮助、设定  

应用内也可点击右上角「？」打开帮助。

## 技术要点

- 前端：Canvas 笔迹、手写体浮现、SSE 流式、PWA shell、IndexedDB 本地数据
- 后端：`POST /api/ask` 将页面 PNG 发给视觉模型（支持用户 BYOK），SSE 推送 `delta` / `meta` / `done`（含 `intent` / `recallQuery`）

## License

MIT
