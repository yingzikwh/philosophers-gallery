# PVE 思辨闯关对话框 · UX 改进规格

> 文档类型：UX 规格（仅规格，不写组件代码）
> 适用范围：`src/components/CampaignChallenge.tsx`（闯关对谈对话框）、`src/routes/campaign.tsx`（关卡地图页）
> 后端改动：无。对谈本身无状态，草稿持久化完全在前端 `localStorage` 完成。
> 关联文档：`design/gdd/*`（游戏设计基线，本规格不与其冲突）

---

## 0. 现状问题（基于源码核对）

| 来源 | 现状 | 问题 |
|---|---|---|
| `CampaignChallenge.tsx` L73-89 | 打开即 `setMessages([opening])`，`useEffect` 依赖 `isOpen + stage.id` | 关闭再开永远从零开始，误关即丢内容 |
| `CampaignChallenge.tsx` L92-101 | 自动滚动每次 `scrollContainer.scrollTop = scrollHeight` | 无「是否贴底」判断，长对谈时用户无法向上浏览历史；超长对话重渲染卡顿 |
| `CampaignChallenge.tsx` L162-198 `handleJudge` | 「提交评判」直接 `requestJudge`→`submitProgress` | 评分即锁分/发奖，无任何二次确认，易误提交 |
| `CampaignChallenge.tsx` L210-451 | 关闭仅 X；`onOpenChange` 关闭即卸载 | 无「返回关卡」，无保存，无「清空重来」 |
| `campaign.tsx` L99-155 | sticky header 只有进度/货币 | 无「返回主页」，只能 X 关对话框 |
| `philosopherAI.ts` L89-136 | 已存在 `philosopher-chat-history`（按 `philosopherId`） | 是「自由请教」模块，**不能**复用于按 `stageId` 的闯关草稿，否则串台 |

---

## 1. 设计目标与四项需求映射

- **支柱 1 · 不丢失思考**：任何关闭/刷新/误触都不应让用户丢失已写的对谈。
- **支柱 2 · 可控可预期**：评分、清空这类不可逆动作必须有显式确认；滚动浏览不被强制打断。
- **支柱 3 · 低阻力返回**：随时能回到地图与主页，且不影响草稿。

| 用户需求 | 解决手段 |
|---|---|
| ① 对话可滑动 + 保留自动滚底 | 贴底检测 + 「回到底部」浮钮 + 消息行 memo 化 |
| ② 保存上次对谈 + 重新答复 | 按 `stageId` 草稿持久化 +「清空重来」 |
| ③ 避免误点 | 关闭即存草稿（不丢）+「提交评判」二次确认 |
| ④ 返回主页/关卡 | header「返回主页」+ 对话框「返回关卡」（均不清除草稿） |

---

## 2. 交互流程

### 2.1 打开对谈（恢复优先）
1. 地图页点击关卡卡片 / 「挑战」/「再战」→ `openChallenge(stage)`。
2. 对话框 `isOpen=true` 时，**先**读 `localStorage[ campaign-draft-{stageId} ]`：
   - 命中且 `schemaVersion` 匹配、`stageId`/`topic`/`philosopherId` 一致 → `setMessages(draft.messages)`（含开场题），`setInput(draft.input ?? '')`，若草稿含 `judgeResult` 则 `setJudgeResult(draft.judgeResult)`（**仅展示，不触发发奖**，见 §3）；**不**重新注入开场。
   - 未命中或校验失败 → 维持现状：注入开场挑战题 `[opening]`。
3. `justCleared` 不持久化 → 打开时一律为 `false`（见 §4）；`judgeResult` 现可随草稿轻量恢复（见决策 A）。

### 2.2 发送与流式
- 同现状：`handleSend` → 追加 user 消息 → `requestPhilosopherChat` SSE 流式 → 追加 assistant 消息。
- **新增写盘时机**：追加 user 消息后**立即**防抖写盘（保证刷新时用户本轮问题不丢）；assistant 完成后再次写盘。

### 2.3 滚动浏览（长对谈）
- 维护 `isPinnedToBottom`：监听 viewport `scroll` 事件，`distance = scrollHeight - scrollTop - clientHeight < 48px` 视为贴底。
- 仅当 `isPinnedToBottom === true` 时自动 `scrollTop = scrollHeight`；用户上滑查看历史时**不**强制拉回。
- 未贴底时显示右下「↓ 回到底部」浮钮；点击 → 置 `isPinnedToBottom=true` 并滚到底。
- 性能：消息行用 `React.memo` 包裹，流式更新只重渲染流式节点；消息数 > 40 时评估虚拟列表（可选）。

### 2.4 关闭（保留草稿）
- X / Esc /「返回关卡」均触发 `onOpenChange(false)`：
  - 关闭前**同步写盘**当前 `messages` 与 `input`（覆盖式，非追加）。
  - `abort` 在途请求（同现状）。**不**注入任何提示、不重置。
  - 下次同关打开即恢复（§2.1）。

### 2.5 重开恢复草稿
- 见 §2.1。恢复后滚动定位到底部并 `isPinnedToBottom=true`，焦点回到输入框。
- 恢复成功时同步展示顶部「已恢复上次对谈」金色药丸（见 §3 草稿恢复提示）。

### 2.6 清空重来 / 重新开始
- 显式重置控件，对话框内以 **「重新开始」** 命名（与地图页「再战」呼应；若文案偏好亦可写作「清空重来」，二者**等价、同一动作**）：
  - 触发确认（见 §6.1 两态按钮 + 5s 撤销 toast）→ 确认后 `removeItem(campaign-draft-{stageId})`，`setMessages([opening])`，清空 `input/judgeResult/streamingText/error`（含已轻量持久的 `judgeResult`）。
  - 清空后首次关闭会重新写入仅含开场题的草稿（幂等）。
  - 与「提交评判」解耦：重置只清空本地对谈，不影响服务器 `bestScores` / 已通关状态。

### 2.7 提交评判（二次确认）
- 点击「提交评判」→ **不**直接调用 `requestJudge`：
  - 先弹 `AlertDialog`（或按钮态切换为「确认提交？」3s 窗口，见 §7）→ 用户确认 → 才执行 `handleJudge` 原逻辑。
  - 确认文案明确：「提交后评委模型将五维打分并锁分发奖，且可继续对谈再次提交（取最高分），确定提交吗？」
  - 每次提交都需确认（已通关再战亦同）。

### 2.8 返回关卡
- 对话框内「返回关卡」按钮 = 关闭对话框（保留草稿），视觉回到地图页。等价于 X / Esc，但意图更明确，避免用户以为「退出即丢」。

### 2.9 返回主页
- `campaign.tsx` sticky header 左侧（logo 旁）新增「返回主页」按钮 → 路由跳 `/`（`navigate({ to: '/' })`）。
- **不**清除任何草稿（草稿在 `localStorage`，跨路由持久）；重进 `/campaign` 后按 §2.1 恢复。

---

## 3. 状态要点

| 状态 | 是否持久化到草稿 | 恢复时机 | 说明 |
|---|---|---|---|
| `messages`（含开场+用户+助手） | ✅ 是 | 打开时从 `campaign-draft-{stageId}` 恢复 | 草稿核心 |
| `input`（半写内容） | ✅ 是 | 同 `messages` | 避免误关丢失正在输入的答案 |
| `judgeResult` | ✅ 轻量持久（仅展示） | 打开时随草稿恢复（`schemaVersion` 校验） | **仅用于重新展示评分面板**；绝不触发 `submitProgress`、不影响服务器 `bestScores` 与已通关状态；恢复后 `justCleared` 仍为 `false`（不显示「已解锁」徽标） |
| `justCleared` | ❌ 否 | 恒 `false` | 一次性解锁提示，不持久 |
| `isStreaming` / `streamingText` | ❌ 否 | 恒 `false` / `''` | 在途流不入库（未提交即中断则不保存残片） |
| `error` | ❌ 否 | 恒 `null` | 瞬时错误 |
| `abortControllerRef` | ❌ 否 | — | 关闭即 abort，不恢复 |

> 决策点 A（**已签 · 轻量持久化**）：`judgeResult` 纳入草稿轻量持久，重开时仅恢复展示评分面板，不触发发奖、不与服务器 `bestScores` 冲突。控件层面新增「重新开始」（≡ 清空重来，见 §2.6）。

### 草稿恢复提示（可选增强）
- 命中并恢复草稿时，对话框顶部可展示一枚一次性金色药丸提示「已恢复上次对谈」（`History` 图标，约 3s 自动消失，不阻断操作）。纯反馈性质，不持久化、不阻塞。视觉样式见 art 规格 §8「草稿恢复提示」。

---

## 4. localStorage 草稿规范

### 4.1 Key 规则
- 单一草稿：`campaign-draft-{stageId}`（例：`campaign-draft-stage-1-a`）。
- **与现有 `philosopher-chat-history`（按 `philosopherId`，自由请教模块）完全隔离**，不混用、不复用其读写函数，避免串台与容量互相挤占。

### 4.2 数据结构（建议）
```ts
type CampaignDraft = {
  schemaVersion: 1;            // 结构版本，便于迁移/失效
  stageId: string;             // 一致性校验
  philosopherId: string;       //  sanity 校验
  topic: string;               // 与当前 stage.topic 比对，不符则失效
  messages: ChatMessage[];     // 含开场题，结构同 services/philosopherAI.ChatMessage
  input?: string;              // 半写输入框内容（可选）
  judgeResult?: JudgeResult;   // 轻量持久：仅展示，绝不触发发奖（见 §3 决策 A）
  updatedAt: number;           // 写盘时间戳
};
// ChatMessage = { role: 'user'|'assistant'; content: string; timestamp?: number }
// JudgeResult = { dimensions: JudgeDimensions; total: number; comment: string }
//               （结构同 services/campaign.JudgeResult）
```

### 4.3 写入 / 读取 / 清除时机
- **写入**：① 追加 user 消息后（防抖 ~300ms）；② assistant 流式完成后；③ `requestJudge` 成功返回后（连同 `judgeResult` 一并落盘，供仅展示恢复）；④ 关闭对话框前（同步覆盖）。
- **读取**：对话框 `isOpen` 置 true 且 `stage.id` 变化/首开时，优先于开场注入；命中则恢复 `messages` / `input` / `judgeResult`（后者仅展示）。
- **清除**：仅「重新开始 / 清空重来」确认后 `removeItem`（同时清空内存态 `judgeResult`）；其余一律覆盖写，不主动删。

### 4.4 生命周期 / 失效条件
- `schemaVersion` 不匹配 → 丢弃，重新开场。
- `stageId` / `philosopherId` / `topic` 与当前关不符 → 丢弃（题目后端有变动）。
- JSON 解析异常 / 字段缺失 → 丢弃并落空键。
- **软过期**：`updatedAt` 距今 > 30 天可视为过期（可选，懒清理）。
- **孤儿草稿**：`openChallenge` 时若 `stage` 在 `stages` 列表中不存在 → 丢弃对应草稿。
- **容量护栏**：单草稿消息数建议 ≤ 200 条（超出截断最旧），避免逼近 `localStorage` 5MB 上限；写入失败（QuotaExceeded）时静默降级（不阻塞对谈）。

---

## 5. 边界情况

| # | 场景 | 行为 |
|---|---|---|
| 1 | **跨关切换** A→（返回关卡）→B | 每关独立 key，关闭 A 存 A、打开 B 恢复 B；互不影响。切换中若是 A 流式在途，关闭即 abort 并写 A 已提交部分 |
| 2 | **已通关再战** | `stage.status==='cleared'` 仍按 §2.1 恢复草稿；可继续对谈与再次提交 |
| 3 | **清空后重开** | 清空删键 → 再开注入全新开场题；首次关闭重写仅含开场的草稿（幂等） |
| 4 | **页面刷新** | `localStorage` 持久；重进 `/campaign` 打开同关即恢复 `messages`（含已提交 user 消息，因 §2.2 即时写盘）。刷新瞬间在途流式残片不可恢复（设计预期） |
| 5 | **同关多次进出** | 每次关闭覆盖写、每次打开覆盖恢复；永不重复追加，幂等 |
| 6 | **提交后继续对谈再提交** | 每次提交均走二次确认；服务端 `bestScores` 取 `max`（已知行为，`submitProgress` 已支持）；仅首次 `newlyCleared` 为真，之后 toast「已刷新最佳成绩」。`justCleared` 提示只出现一次。草稿不清空，可继续 |

---

## 6. 防误点 & 无障碍细节

### 6.1 防误点
- **关闭不丢**：X / Esc /「返回关卡」统一走「写盘 + 关闭」，不再重置。
- **提交二次确认**（评分=锁分/发奖，后果重）：
  - 首选 `AlertDialog`（Radix）：焦点陷阱、Esc 取消、确认后焦点回到触发按钮；`aria-describedby` 指向警告文案。
  - 轻量备选：按钮两态切换——首点变「确认提交？」（3s 内二次点击生效，超时回弹）。
  - 两种方案均要求：流式/评判中禁用（沿用 `disabled={isStreaming||isJudging}`）。
- **清空重来**（破坏性、但可短时撤销）：采用**两态按钮 + 撤销 toast**——首点变「确认清空？」（3s 窗口，超时回弹）；二次点击确认 → `removeItem` 并重置；确认后顶部出现 5s「撤销」toast，点击撤销即从备份恢复草稿（清空前先快照 `messages` 到内存，撤销时回写）。相比全屏 `AlertDialog`，清空属用户主动发起的本地操作，两态+撤销更轻、不打断心流，且 5s 内可补救。
- **决策点 B（已拍板 · 设计策略师建议，待主理人最终签字）**：**提交用 `AlertDialog`（后果最重，锁分/发奖，需正式弹窗 + Esc 取消 + 焦点陷阱）；清空用两态按钮 + 5s 撤销 toast（较轻，可补救）。** 视觉样式见 art 规格 §8。

### 6.2 无障碍
- 对谈容器 `role="log"`；流式节点 `aria-live` 处理：流式期间用 `aria-live="off"`（避免逐字播报），完成后整条以 `aria-live="polite"` 播报一次。
- 视口可键盘滚动（确保 Radix viewport `tabIndex` 可达，方向键/PageUp/Down 可用）。
- 「回到底部」浮钮可聚焦、`aria-label="回到底部"`。
- 提交/清空确认弹窗具备正确 `role="alertdialog"`、`aria-labelledby`、`aria-describedby`。
- 「返回主页 / 返回关卡」为真实 `<button>`，含 `aria-label`。
- 遵循 `prefers-reduced-motion`：流式光标脉冲在减弱动效时降级为静态。
- 文本与按钮配色需满足 WCAG AA（具体色板见 art-director 视觉规格，本规格不定义颜色）。

---

## 7. 验收标准（供工程 / 质量门）

1. 长对谈（≥40 条）可顺畅上滑浏览历史，且不被动拉回底部；未贴底时出现「回到底部」并可点击回到最新。
2. 关闭 / 刷新 / 误触后，同关重开可完整恢复 `messages` 与 `input`，无需从头作答。
3. 「重新开始 / 清空重来」确认后回到仅含开场题状态（含已轻量持久 `judgeResult` 一并清空），且再次关闭不再残留旧对谈；5s 内可撤销恢复。
4. 「提交评判」任何一次都需显式二次确认（AlertDialog）后方可评分发奖；评分中/流式中按钮禁用。
4b. 关闭后重开：若上次已评分，评分面板以**仅展示**形式恢复（不重复发奖、不影响 `bestScores`、不显示「已解锁」徽标）。
5. 地图 header 有「返回主页」可直达 `/`；对话框有「返回关卡」可回地图；二者均不清除草稿。
6. 跨关、再战、提交后继续再提交等边界场景行为符合 §5，且 `bestScores` 取最高（服务端已保证）。
7. 不与 `philosopher-chat-history` 串台；单草稿超长/超容时降级不崩溃。
8. 键盘与读屏可达性满足 §6.2；无控制台报错。

---

## 8. 设计决策（全部锁定）

- **A（已签 · 轻量持久化 + 重新开始）**：`judgeResult` 纳入草稿轻量持久，**仅展示、不触发发奖**；对话框新增「重新开始」控件（≡ 清空重来，两态按钮 + 5s 撤销）。理由见 §3。
- **B（已签）**：提交=`AlertDialog`、清空/重新开始=两态按钮+5s 撤销 toast（见 §6.1）。依据：确认强度与后果严重度成正比。
- **C（已签 · 纳入草稿）**：`input` 半写内容纳入草稿持久化（见 §3、§4.2）。
- **D（已签 · 200 条 / 30 天）**：单草稿消息上限 200 条（超出截断最旧）、软过期 30 天（见 §4.4）。

> 四项决策均经主理人签字，规格可交付工程实现（任务 #3）。
