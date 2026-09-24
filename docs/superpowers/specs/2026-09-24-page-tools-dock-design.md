# 清页 / 导出底栏显隐

日期：2026-09-24  
状态：已确认

## 问题

顶部菜单里的「清页」「导出」属于页面级操作，不该一直占着顶栏。它们只在纸答已经完整浮现、用户还没开始下一轮书写时才有意义。

## 目标

- 顶栏只保留模式切换、旧页、设定
- 清页、导出移到页面底栏右侧
- 仅在「本轮回复完全出现后」显示；用户再开始书写时隐藏

## 非目标

- 不改导出 PNG 的实现
- 不做自定义 tooltip 组件（继续用 `title` + `aria-label`）
- 不在回顾旧页（`recalling`）流程里显示这两个按钮

## 布局

采用 **同一底栏两端（方案 B）**：

- 左：现有状态文案 / 提交提示（`submit-dock-main`）
- 右：清页、导出图标按钮（水平一排）
- 底栏用 `justify-content: space-between`，右侧控件 `pointer-events: auto`

顶栏 `paper-actions` 移除清页、导出按钮。

## 显隐规则

| 时机 | 行为 |
|------|------|
| `answering` 动画正常结束 → `ready` | 显示 |
| 用户落笔 / 输入文字 → `writing` | 隐藏 |
| 用户点击清页 | 隐藏（并清纸） |
| `fading` / `thinking` / `answering` / `recalling` / `error` | 不显示 |
| 空白 `ready`（尚未有本轮回复） | 不显示 |
| 提交被取消 / 出错 | 不显示（保持或恢复为隐藏） |

### 状态模型

新增布尔状态，例如 `pageToolsVisible`（命名可在实现时微调）：

- **置 true**：普通回复路径里，`animateAnswer` 成功结束后、`appendMemory` 之后、即将/刚切到 `ready` 时
- **置 false**：
  - 进入 `writing`（笔或字）
  - `clearPage`
  - 开始新一轮提交（进入 `fading`）
  - `resetToReady` / 错误回退等会清掉「已完成回复」语境的路径

不依赖读取 reply canvas 像素。

### 动画

显示/隐藏可用短 opacity 过渡（约 180ms，沿用现有 ink 缓动）。尊重 `prefers-reduced-motion: reduce` 时直接切换、无过渡。

## 组件与改动面

| 文件 | 改动 |
|------|------|
| `src/components/InkPage.tsx` | 状态位；顶栏移除两按钮；底栏右侧渲染；在 answering 完成 / writing / clear / fade 等处开关 |
| `src/app/globals.css` | `submit-dock` 两端对齐；右侧工具组样式（复用 `ink-icon-btn`） |

无需新依赖、无 i18n 文案变更（继续用现有 `clearPage` / `exportPage`）。

## 边界情况

- **回顾召回成功**：不置 `pageToolsVisible`（仅普通 `animateAnswer` 后开启）
- **busy 期间**：按钮本就不渲染；若实现为条件渲染，无需额外 `disabled`
- **双击提交 / 自动提交**：进入 `fading` 时隐藏
- **导出**：不改变显隐；导出后按钮仍可见，直到用户再写或清页

## 验收

1. 空白纸面：右下无清页/导出；顶栏无这两项
2. 写完并提交，回复字迹全部浮现后：底栏右侧出现两图标
3. 再落笔或输入：按钮消失
4. 点清页：纸面清空且按钮消失
5. 回答过程中（渗墨/思考/浮现）：按钮不可见
6. 移动端底栏不被 safe-area 挡住，且不与左侧状态重叠

## 测试建议

手动走一遍主路径即可；无需新增自动化测试（当前仓库无对应 UI 测试基建）。
