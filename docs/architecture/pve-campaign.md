# ADR：PVE 闯关型知识对战（思辨闯关）

- 状态：已落地（2026-07-13）
- 范围：在「哲学家画廊」Web 应用中新增线性解锁的 PVE 闯关对战，**不做** PVP、**不做** 完整养成等级
- 负责人：工程主理（cheng / 程基岩）

---

## 1. 背景与目标

已在线的「哲学家画廊」提供与哲学家 AI 的开放式对话（`/functions/v1/philosopher-chat`）。
本次新增「思辨闯关」：玩家沿一条线性解锁的关卡链（4 章 × 4 关）逐关挑战，每关 = 与某位哲学家 AI 就一个知识主题辩论/作答；对话结束后「提交评判」，后端用同一模型做五维评分；达到阈值即通关，发放 TP/IN 奖励并解锁下一关。进度存本地 JSON 文件（单人本地部署，无需账号）。

设计已定，本 ADR 仅记录技术契约与决策，不重复设计推导。

## 2. 调用链路（前端 → 后端）

- 前端统一通过 `getSupabaseUrl()`（来自 `src/supabase/client.ts`，返回 `window.location.origin + '/sb-api'`）构造请求。
- Vite 开发代理（`vite.config.ts`）将 `/sb-api` 前缀重写后转发到本地后端 `localhost:3016`。
  - 例：`GET ${getSupabaseUrl()}/api/stages` → `origin/sb-api/api/stages` → 代理重写 → `localhost:3016/api/stages`。
- **硬约束**：不引入 Supabase / 任何数据库；存储只用 `node:fs` 写 JSON；新端点全部走 `/api/...` 并复用前端代理约定。

## 3. API 契约

所有新端点均带 CORS 头（复用 `server/index.js` 顶部 `corsHeaders`），错误以 `{ error: '中文说明' }` 的 JSON 返回。

### 3.1 `GET /api/stages`
返回关卡列表（含线性解锁状态）。
```jsonc
{
  "stages": [
    {
      "id": "s1", "chapter": "启蒙之门", "title": "认识你自己",
      "philosopherId": "socrates",
      "topic": "请向苏格拉底阐述你对「美德是否可教」的看法，并准备回应他的诘问。",
      "difficulty": 1, "threshold": 55, "reward": { "tp": 40, "in": 10 },
      "status": "cleared | available | locked",   // 后端计算
      "bestScore": 90                                  // 仅已挑战/已通关时存在
    }
    // ... 共 16 关
  ],
  "totalStages": 16,
  "clearedCount": 3
}
```

### 3.2 `GET /api/progress`
返回当前进度概览。
```jsonc
{
  "clearedStages": ["s1", "s2"],
  "bestScores": { "s1": 90, "s2": 72 },
  "totals": { "tp": 100, "in": 25, "rp": 0 },
  "clearedCount": 2,
  "totalStages": 16
}
```

### 3.3 `POST /api/progress`
请求体：`{ "stageId": string, "score": number }`。

逻辑：
1. 校验 `stageId` 存在、`score` 为 0–100 有限数字（否则 400）。
2. 若 `score >= threshold` 且未通关 → 标记 `cleared`，按 `reward` 累加 `totals`（**首通发奖，幂等：重复提交不重复发奖**）。
3. `bestScore` 始终取 `max(历史最佳, 本次分数)`（即使本次未达阈值）。
4. 分数低于阈值 → 不发证、不标记通关，但仍记录 `bestScore`。

响应：
```jsonc
{
  "clearedStages": ["s1"], "bestScores": { "s1": 90 },
  "totals": { "tp": 40, "in": 10, "rp": 0 },
  "granted": { "tp": 40, "in": 10 },      // 本次实际发放；幂等重提为 {0,0}
  "cleared": true, "newlyCleared": false, // newlyCleared 仅首通为 true
  "clearedCount": 1, "totalStages": 16
}
```

### 3.4 `POST /api/judge`
请求体：`{ "philosopherId": string, "topic": string, "messages": [{ "role": "user"|"assistant", "content": string }] }`。

调用 `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL` 的 `/chat/completions`（`stream:false`，`temperature:0.2`），system 使用评判提示词（见 §5）。要求模型输出**严格 JSON**。

健壮解析：提取字符串中首个 `{` 到末尾 `}` 之间的内容再 `JSON.parse`；解析失败 / API 异常 / 无 Key → **降级为规则评分**（按玩家发言轮数与字数给保守分，comment 为「评判模型返回异常，已降级评分」或「未配置 API Key，已降级评分」），保证前端不崩溃。

响应：
```jsonc
{
  "dimensions": { "relevance": 0, "depth": 0, "logic": 0, "originality": 0, "civility": 0 },
  "total": 0,        // 0–100 整数
  "comment": "一句话评语"
}
```
`total` 由后端按 §4 权重**重算**（不信任模型自带 total），确保与公式完全一致、可复现。

## 4. 解锁规则与评分公式

**线性解锁**：`server/data/stages.json` 数组顺序即解锁顺序。第 1 关（`index 0`）默认可战；第 N 关可战当且仅当第 N-1 关已通关；其余锁定。状态计算在 `GET /api/stages` 内基于 `loadProgress().clearedStages` 完成。

**五维评分权重**（与评判提示词一致）：
```
total = relevance*0.25 + depth*0.25 + logic*0.25 + originality*0.15 + civility*0.10  （取整，钳制 0–100）
```
- relevance 相关性 / depth 深度 / logic 逻辑性 各占 25%，originality 原创性 15%，civility 礼节 10%。

**通关阈值**：随难度递增 —— 难度 1→55、2→60、3→65、4→70。

## 5. 奖励数值

| 难度 | TP | IN |
|------|----|----|
| 1 | 40 | 10 |
| 2 | 60 | 15 |
| 3 | 80 | 20 |
| 4 | 100 | 25 |

仅首通发放（幂等），`totals.rp` 字段保留（当前未使用）。

## 6. 存储方案（progress.json）

- 路径：`server/data/progress.json`，零依赖，仅用 `node:fs`。
- 结构：
  ```jsonc
  { "clearedStages": string[], "bestScores": Record<string, number>, "totals": { "tp":0, "in":0, "rp":0 } }
  ```
- `loadProgress()`：读文件；不存在或解析失败返回默认结构（容错缺字段）。
- `saveProgress(data)`：**原子写** —— 先写 `progress.json.tmp` 再 `rename` 覆盖（同一文件系统内 rename 原子，避免半写损坏）；含 try/catch，写入失败返回 `false`。

## 7. 关键决策

1. **关卡定义放后端 JSON**：前端 TS 文件无法被纯 JS 后端 import，故 `stages.json` 为关卡单一事实源，只用 `philosopherId` 引用；前端用本地 `src/data/philosophers.ts` join 展示数据（头像/姓名/流派）。
2. **复用既有对话服务**：闯关对谈直接复用 `requestPhilosopherChat(philosopherId, messages, onChunk, {signal})`，哲学家照常开口，仅以关卡 `topic` 作为挑战开场。
3. **评判与对话共用同一模型**：避免额外依赖；以 `temperature=0.2` + 严格 JSON 约束 + 健壮解析 + 规则降级，保证可用性。
4. **总分后端重算**：不信任模型自报 total，由后端按官方权重重算，杜绝模型算错导致前端阈值误判。
5. **新端点置于 chat 端点之前**：在 `server/index.js` 的 `http.createServer` 内、既有 `philosopher-chat` 分支**之前**插入 PVE 路由分发；既有 chat 端点逻辑完全不变。
6. **视觉贴合既有体系**：复用 `bg-card / border-border/50 / font-display / gradient-text-gold / text-muted-foreground` 等既定语料与 UI 原语（Card/Badge/Progress/Dialog/sonner），不引入新设计语言；新建 `CampaignChallenge` 组件，不改 `PhilosopherChat`。

## 8. 风险与遗留

- **C2｜评分模型可用性**：`/api/judge` 依赖 `.env` 中有效的 `OPENAI_API_KEY`。本机 `.env` 当前为占位符（含「在此填入」），故本地无法真调通模型，自动走降级评分路径（已验证返回合法五维 JSON 且不崩溃）。**部署前需主理人填入有效 Key 才能启用真实评判。**
- **知识缺口**：无新增引擎/库依赖，全部基于既有 Node/React 技术栈，无 API 不确定性。
- **未做**：PVP、完整养成等级、账号体系——按范围本次不实现。
- **视觉精修**：功能与风格已对齐既有体系，但关卡卡片/评分面板的细节视觉（动效、留白、庆祝态）可在后续由 art-director 统一打磨。
