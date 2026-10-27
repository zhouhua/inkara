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
- 设定中可查看会员与积分入口；正式环境由平台提供模型，匿名每天 2 次免费问答（服务端账本）

## 快速开始

```bash
cp .env.example .env.local
# 编辑 .env.local，填入模型 API Key、Endpoint，以及 AUTH_SECRET（匿名 cookie / 登录）
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

手机或桌面浏览器可通过「添加到主屏幕 / 安装应用」以独立窗口打开。

### 测试与代码质量

```bash
pnpm test          # Vitest：src/lib 单测 + API route 集成测
pnpm test:e2e      # Playwright：主路径 E2E（自动启动 next dev，并 stub 模型 API）
pnpm test:all      # 上述两者串行
pnpm lint          # ESLint
pnpm format        # Prettier 写回
pnpm format:check  # Prettier 只检查
pnpm typecheck     # TypeScript（tsc --noEmit）
pnpm ci:local      # 本地近似 CI：lint + 单测
```

Git hooks（[Husky](https://typicode.github.io/husky/)）在 `pnpm install` 后自动启用：

| Hook         | 作用                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| `pre-commit` | lint-staged：对暂存文件跑 Prettier + ESLint `--fix`                                          |
| `commit-msg` | [Conventional Commits](https://www.conventionalcommits.org/)（`feat:` / `fix:` / `docs:` …） |
| `pre-push`   | `pnpm test`（对齐 CI 中会阻塞的单测；E2E 仍只在 CI 跑）                                      |

提交说明示例：`feat: add STT ticket endpoint`、`fix(billing): debit race`。

GitHub Actions 见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)：在 PR / push 上跑 lint（阻塞）、单测与 E2E。CI 失败**不阻塞**生产部署；推到 `main` 会另外跑 [`.github/workflows/deploy-ecs.yml`](.github/workflows/deploy-ecs.yml)，把 Node 独立包发到阿里云 ECS。

E2E 会设置 `SKIP_OPENNEXT_CLOUDFLARE_DEV=1`，跳过 `next.config.ts` 里较慢的 Cloudflare 开发初始化。

### 环境变量

| 变量                                                                     | 说明                                                 | 默认                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| `MODEL_API_KEY`                                                          | 服务端默认 API Key（用户未自备时使用）               | —                              |
| `MODEL_BASE_URL`                                                         | OpenAI 兼容接口 Base URL                             | —                              |
| `MODEL_NAME`                                                             | 视觉模型名称                                         | —                              |
| `AUTH_SECRET`                                                            | Auth.js 会话加密密钥（必填才能登录）                 | —                              |
| `AUTH_RESEND_KEY`                                                        | Resend API Key；**未设时魔法链接只打印到服务端日志** | —                              |
| `AUTH_EMAIL_FROM`                                                        | 发信地址                                             | `onboarding@resend.dev`        |
| `AUTH_TRUST_HOST`                                                        | 反代后信任 Host（Workers 建议 `true`）               | Auth.js 内已 `trustHost: true` |
| `NEXT_PUBLIC_APP_URL`                                                    | 站点绝对 URL（支付回调/回跳）                        | 请求 Origin                    |
| `WECHAT_PAY_APP_ID` / `MCH_ID` / `SERIAL` / `PRIVATE_KEY` / `API_V3_KEY` | 微信商户 APIv3 Native                                | —                              |
| `WECHAT_PAY_PLATFORM_PUBLIC_KEY`                                         | 微信平台公钥（**生产必填**，用于回调验签）           | —                              |
| `ALIPAY_APP_ID` / `PRIVATE_KEY` / `PUBLIC_KEY`                           | 支付宝开放平台应用                                   | —                              |
| `ALIPAY_GATEWAY`                                                         | 支付宝网关                                           | 正式网关                       |
| `PAY_ALLOW_MOCK` / `NEXT_PUBLIC_PAY_ALLOW_MOCK`                          | 允许 `channel=mock`（本地）                          | 开发环境默认可 mock            |
| `PAY_MOCK_SECRET`                                                        | mock 支付校验串                                      | `inkara-mock-pay`              |

**计费 / 登录 / 内容：** D1 绑定名 `DB`（库 `inkara`，见 `wrangler.jsonc`）。本地迁移：

```bash
npx wrangler d1 migrations apply inkara --local
# 生产：
npx wrangler d1 migrations apply inkara --remote
```

登录：打开 `/login`（邮箱魔法链接 / 手机短信 OTP / 微信网站扫码）。未配置 Resend / 阿里云短信时，链接与验证码只打服务端日志。

运营后台是独立应用 `apps/admin`（默认 `http://localhost:3001`），不是产品站子路由。`pnpm dev:admin` 启动；需配置 `DATABASE_URL`（或与产品相同的 DB）与 `ADMIN_EMAILS`，用管理员邮箱在后台 `/login` 登录。

CI（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）会 typecheck + build admin。推到 `main` 且触及 admin/共享 lib/迁移时，[`.github/workflows/deploy-ecs-admin.yml`](.github/workflows/deploy-ecs-admin.yml) 会把后台独立包发到 ECS（也可手动 **Deploy ECS Admin**）。

与产品共用同一份环境文件 `/etc/inkara.env`（同一数据库；admin 迁移只补新表）以及 `ECS_HOST` / `ECS_USER` / `ECS_SSH_KEY`。后台进程目录默认 `/opt/inkara-admin`，systemd `inkara-admin`，端口 `3001`；公网地址默认 [https://admin.inkara.zhouhua.site](https://admin.inkara.zhouhua.site)（systemd 覆盖 `AUTH_URL` / `NEXTAUTH_URL`，不改动产品的 `NEXT_PUBLIC_APP_URL`）。

**支付（官方直连，无聚合）：**

- **支付宝**：电脑网站支付；异步通知 `{NEXT_PUBLIC_APP_URL}/api/billing/webhook/alipay`。
- **微信**：Native 扫码；异步通知 `{NEXT_PUBLIC_APP_URL}/api/billing/webhook/wechat`。
- **本地**：`channel=mock`（开发默认可用，或设 `PAY_ALLOW_MOCK=1`）→ `/api/billing/mock-pay` 直接入账。
- 下单时用户在对话框选择渠道；订单表 `orders.channel` 记录渠道。
- 手动对账：按日导出 D1 `orders`（`status` / `sku` / `amount_fen` / `channel` / `provider_trade_no`），与微信/支付宝商户后台流水核对；重复 webhook 由 `fulfillOrder` 幂等消化。

正式构建下由平台 `MODEL_*` 提供模型；匿名用户每天 2 次日免积分（服务端 D1）。额度用尽后登录购买会员或积分包。

**用户数据（无 IndexedDB）：** 设定、日记页存 D1（`user_settings` / `pages`）。向量存 **Cloudflare Vectorize** 索引 `inkara-pages`（1024 维，cosine；namespace = subject）。embedding 由 Workers AI `@cf/baai/bge-m3` 生成；召回 `POST /api/recall` = 词法 ∪ Vectorize ANN。匿名用 `inkara_anon`；登录合并时页与向量一并迁入账号。启动时若检测到旧 IndexedDB，会一次性上传后删除本地库。

请使用支持识图的视觉模型。

### 语音输入本地联调

文字模式的麦克风不把 DashScope Key 交给浏览器。Next 签发 120 秒票据（`expMs.32hexHmac`），浏览器连到本机的 STT Worker，由 Worker 转发到 Paraformer。

```bash
# workers/stt-proxy/.dev.vars（勿提交）
# DASHSCOPE_API_KEY=sk-...
# STT_TICKET_SECRET=   # 与 Next 的 STT_TICKET_SECRET 相同；未设时两边都用 AUTH_SECRET

pnpm stt-proxy
# 等价：cd workers/stt-proxy && npx wrangler dev
```

Worker 监听 `ws://127.0.0.1:8787`。`.env.local` 里设置 `NEXT_PUBLIC_STT_WS_URL=ws://127.0.0.1:8787`，并保证票据密钥与 Worker 一致。该端口与 `pnpm preview` 冲突，联调时只开其中一个。

生产密钥：

```bash
cd workers/stt-proxy
npx wrangler secret put DASHSCOPE_API_KEY
npx wrangler secret put STT_TICKET_SECRET
```

## 部署到阿里云 ECS

生产环境是 Node 独立服务，不是 Cloudflare Worker。推送到 `main`（或在 GitHub 上手动触发 **Deploy ECS**）会：

1. `pnpm build:node` 打出 Next.js standalone
2. 打成 `.deploy/standalone`（含静态资源、`public`、MySQL 迁移）
3. 经 SSH 用 tar 同步到 ECS 的临时目录，用机器上的环境文件跑尚未记录的 `migrations/mysql/*.sql`
4. `systemctl restart` 重启服务

GitHub 仓库密钥：

| 密钥           | 说明                                                         |
| -------------- | ------------------------------------------------------------ |
| `ECS_HOST`     | 服务器地址                                                   |
| `ECS_USER`     | SSH 用户                                                     |
| `ECS_SSH_KEY`  | 私钥（可用真实换行，或一行里的 `\n`）                        |
| `ECS_PORT`     | 可选，默认 22                                                |
| `ECS_APP_DIR`  | 可选，默认 `/opt/inkara`                                     |
| `ECS_ENV_FILE` | 可选，默认 `/etc/inkara.env`（在应用目录外，不会被同步删掉） |
| `ECS_SERVICE`  | 可选，默认 `inkara`                                          |

运营后台额外密钥（均可选，有默认值）：

| 密钥                   | 说明                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `ECS_ADMIN_APP_DIR`    | 默认 `/opt/inkara-admin`                                      |
| `ECS_ADMIN_SERVICE`    | 默认 `inkara-admin`                                           |
| `ECS_ADMIN_APP_PORT`   | 默认 `3001`                                                   |
| `ECS_ADMIN_PUBLIC_URL` | 默认 `https://admin.inkara.zhouhua.site`（systemd 覆盖 AUTH） |

服务器上需要 Node 22、`sudo systemctl` 免密，以及**与产品共用**的 `/etc/inkara.env`（含 `DATABASE_URL`、`AUTH_SECRET`、`ADMIN_EMAILS`、模型与登录变量）。Admin 与产品连同一库，部署时跑 MySQL 迁移补新表；systemd drop-in 单独覆盖 `AUTH_URL`/`NEXTAUTH_URL`/`PORT`。若机器装了 nginx，会写入 `admin.inkara…` 反代到 `:3001`。发布失败会回滚上一版。

**DNS：** Cloudflare 为 `admin.inkara.zhouhua.site` 增加与 `inkara.zhouhua.site` 相同目标的记录（建议橙云）。本地打包：`pnpm build:admin && pnpm pack:admin`。

Cloudflare Worker 仍可用本机命令发布：`pnpm deploy:cloudflare`。

## 测试

```bash
pnpm test          # Vitest：src/lib 单测 + API route 集成测
pnpm test:e2e      # Playwright：主路径 E2E（stub 外部 API）
pnpm test:all      # 上述两者
```

GitHub Actions 有独立 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)（`lint` + unit + e2e）。**CI 失败不会挡住** ECS 部署（[`deploy-ecs.yml`](.github/workflows/deploy-ecs.yml) 仍独立运行）。

## 使用

1. 在纸面书写或输入
2. **双击空白**或按 **Enter** 提交（文字模式用 Shift+Enter 换行）
3. 墨迹渗入后，顶部可保留淡墨引用辨认内容；回答在纸面中部浮现
4. 写「找××那页」可唤起旧页；轻触纸面回到今天
5. 设定里可改为自动延迟提交，并选择快 / 普通 / 慢；也可填写自备 API Key / Endpoint / 模型
6. 右上角：笔迹 / 文字、旧页、帮助、设定

应用内也可点击右上角「？」打开帮助。

## 技术要点

- 前端：Canvas 笔迹、手写体浮现、SSE 流式、PWA shell；设定/日记/向量同步至 D1
- 后端：`POST /api/ask` 将页面 PNG 发给平台视觉模型，SSE 推送 `delta` / `meta` / `done`（含 `intent` / `recallQuery`）；Workers AI 生成 embedding

## License

MIT
