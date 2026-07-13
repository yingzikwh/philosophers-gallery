# 00 · 游戏概念文档（Game Concept）

> 项目：哲学家画廊（Philosopher Gallery）· 游戏化趣味机制
> 版本：v1.0　|　作者：文策渊（design-strategist）　|　日期：2026-07-13
> 适用范围：在已有 Web 应用之上叠加四套趣味机制，不改动既有浏览/对话核心体验。

---

## 0. 背景与边界

**既有产品事实源（已核对 `src/data/philosophers.ts` / `src/services/philosopherAI.ts` / `functions/philosopher-chat/index.ts`）**

- 哲学家实体字段：`id, name, nameEn, birthYear, deathYear, nationality, era('ancient'|'modern'|'contemporary'), school:string[], themes:string[], portrait, works:string[], coreIdeas:string[], quotes:string[], influence:string, influences?:string[], influenced?:string[], keyConcepts?, historicalContext?`
- 规模：59 位哲学家 / 35 个流派 / 30 个主题（school 为数组，单哲学家可属多流派）。
- AI 通道：`Supabase Edge Function /functions/v1/philosopher-chat`，OpenAI 兼容流式 SSE，每个哲学家有独立 `systemPrompt`（人格），默认模型 `kimi-k2.5`。**四机制全部复用此通道，仅扩展 `mode` 参数。**
- 关系数据：`influences` / `influenced` 数组即"脉络星系图"的边，可直接作为阵容羁绊数值来源。
- 既有"收藏"按钮：`EnhancedPhilosopherCard` 的 `onFavorite(id)` + `isFavorited` 布尔，**当前为纯客户端状态，无后端表**。本设计将其升级为图鉴所有权的单一事实源（见 §6）。

**设计红线（贯穿四系统）**
1. 杜绝主导策略（单一最优解）。
2. 经济不通胀（资源有来源/消耗/上限闭环）。
3. 不认知过载（每屏新增信息 ≤ 既有 UI 负荷）。
4. 支柱不漂移（所有机制服务"思辨即玩"）。

---

## 1. 设计支柱（Design Pillars）

| # | 支柱 | 一句话 | 对应机制 |
|---|---|---|---|
| P1 | **思辨即玩（Thinking is Playing）** | 乐趣来自哲学思辨本身，而非外部奖励 | 辩论 / 思想实验 |
| P2 | **收藏即求知（Collecting is Knowing）** | 收集驱动知识图谱探索 | 图鉴与养成 |
| P3 | **对撞生智（Collision Breeds Insight）** | 观点对撞产出成长与领悟 | 辩论 / 阵容 |
| P4 | **抉择塑己（Choice Shapes Self）** | 玩家选择定义其思想人格 | 思想实验 / 阵容 |

四条支柱相互正交，任一机制都可回溯到至少一条支柱，避免功能漂移。

---

## 2. MDA 框架分析

### 2.1 Mechanics（机制层，逐机制映射）

| 机制 | 核心规则（Mechanics） | 触发 Dynamics | 期望 Aesthetics |
|---|---|---|---|
| M1 收藏/养成 | 对话→收藏得图鉴所有权；耗 TP 升 CL；里程碑解锁流派/时代图鉴 | 玩家围绕稀缺 TP 取舍先养谁 | 成就感、发现感 |
| M2 辩论 | PVE 对哲学家 AI 按五维评分；PVP 观点对撞 + ELO | 玩家研究流派立场以求高评级 | 挑战感、表达感 |
| M3 阵容/羁绊 | 6 槽位；同流派共鸣；跨流派克制；师承边加成 | 社区涌现 meta 构筑 | 策略感、掌控感 |
| M4 思想实验 | 分支抉择；累积思想倾向向量；多结局 | 玩家重玩探索不同结局 | 沉浸感、表达感 |

### 2.2 Dynamics（动态层）

- **资源博弈**：TP/IN/RP/CR 五种资源相互转化，玩家每日在"养卡 / 抽卡 / 打辩论 / 走实验"间分配有限精力。
- **meta 演化**：克制矩阵催生版本强势流派，社区通过 PVP 排行榜验证，下个版本通过数值微调（见 balancing.md）再平衡。
- **社交涌现**：PVP 与阵营让"社交者/杀戮者"形成辩论文化，UGC 话题反哺思想实验。

### 2.3 Aesthetics（美学层，对应 Hunicke 八类）

| 美学 | 由谁满足 |
|---|---|
| 感官（Sensation） | 图鉴解锁动效、脉络星系高亮 |
| 幻想（Fantasy） | 与先哲对话、思想实验沉浸叙事 |
| 叙事（Narrative） | 思想实验多结局、哲学家师承线 |
| 挑战（Challenge） | 辩论评级 S、PVP 段位 |
|  fellowship（关联） | 阵营、PVP、流派社群 |
| 发现（Discovery） | 脉络星系、时间轴、全主题分支 |
| 表达（Expression） | 思想倾向人格、自由构筑 |
|  Submission（消遣） | 每日签到、轻松收集 |

---

## 3. 玩家心理学

### 3.1 自我决定论（SDT）三需求

| 需求 | 满足方式 |
|---|---|
| **自主（Autonomy）** | 自由选择养谁/打谁/怎么构筑/怎么抉择；流派与主题筛选延续既有 FilterBar |
| **胜任（Competence）** | 学者等级 SL + 卡牌等级 CL 的可见成长；辩论评级从 D→S 的阶梯反馈；每日任务可完成 |
| **关联（Relatedness）** | 与哲学家 AI 持续对话；PVP 与排行榜；流派阵营；师承羁绊让"先哲关系"具象化 |

### 3.2 心流通道（Challenge ≈ Skill）

- **技能轴**：随 CL↑、羁绊理解↑、知识↑而上升。
- **挑战轴**：辩论难度分 入门/进阶/大师 三档（对手 AI 的 rubric 严苛度递增）；思想实验章节随 SL 解锁更复杂场景。
- **校准规则**：若某档辩论放弃率 > 12%（指标 D6），则下调该档 rubric 阈值或提升同级 CL 加成，使 C≈S 维持在通道内。

### 3.3 Bartle 四类玩家对应行为

| 类型 | 本作主要行为 | 主喂机制 |
|---|---|---|
| 成就者（Achiever） | 图鉴 100%、全成就、评级 S、SL 满级 | 收藏/养成、辩论评级 |
| 探索者（Explorer） | 走遍脉络星系/时间轴、刷全主题分支结局 | 思想实验、图鉴 |
| 社交者（Socializer） | PVP、阵营聊天、分享构筑、UGC 话题 | 辩论 PVP、阵容 |
| 杀戮者（Killer） | 辩论排行榜登顶、用克制构筑碾压 | 阵容克制、PVP ELO |

四机制须分别覆盖四类玩家，避免某一类被冷落（验证见 §5）。

---

## 4. 动词优先法（Verb-First）

提取核心动词 → 映射机制 → 映射既有实体：

| 核心动词 | 机制 | 挂接的既有实体 |
|---|---|---|
| **收集（Collect）** | M1 图鉴与养成 | 哲学家卡 `id`、既有 `onFavorite`、流派/主题 |
| **辩论（Debate）** | M2 知识对战 | `philosopher-chat` SSE、各哲学家 `systemPrompt`、`coreIdeas` |
| **搭配（Compose）** | M3 阵容羁绊 | `influences`/`influenced` 边、`school[]` 数组 |
| **抉择（Choose）** | M4 思想实验 | `themes[]`、`keyConcepts`、`historicalContext`、多哲学家 persona |

动词即玩家心智模型，UI 主入口以四动词组织 Tab。

---

## 5. 可玩性验证指标（先于机制定义）

> 原则：先定"如何证明好玩"，再写机制。以下为上线后 4 周内需达标的北极星与护栏指标。

| ID | 指标 | 目标 | 归属机制 | 失败含义 |
|---|---|---|---|---|
| D1 | 次日/7 日留存 | D1≥35%, D7≥18% | 全局 | 核心循环弱 |
| D2 | 收藏渗透率 | 新用户 7 日人均收藏 ≥8 位 | 收藏 | 收集门槛高 |
| D3 | 辩论参与率 | 周活 ≥40% 完成 ≥1 场 | 辩论 | 对战吸引力低 |
| D4 | 构筑多样性 | 主流 Top3 构筑占比 ≤45% | 阵容 | 主导策略 |
| D5 | 实验重玩 | 平均章节重玩 ≥1.8 次 | 思想实验 | 重玩价值不足 |
| D6 | 心流放弃率 | 辩论中途放弃 ≤12% | 辩论 | 难度失衡 |
| D7 | 资源通胀 | 周 TP 中位数增速 ≤15% | 全局 | 经济崩坏 |

任一指标连续 2 周不达标，触发对应机制的数值评审（见 balancing.md §7 再平衡 SOP）。

---

## 6. 与既有产品的衔接总览（单一事实源）

| 既有能力 | 游戏化复用方式 |
|---|---|
| `onFavorite(id)` 收藏布尔 | 升级为图鉴所有权事件：首次收藏→写入 `collections` 表 + 发 TP(+120) |
| `philosopher-chat` SSE | 扩展 `{mode:'chat'|'debate'|'thoughtlab'}`，复用人格与流式 |
| `school:string[]` | 阵容共鸣计数、流派图鉴解锁、思想实验分支标签 |
| `themes:string[]` / `keyConcepts` | 思想实验选项标签与回应 seed、辩论话题生成 |
| `influences`/`influenced` | 阵容"师承羁绊"加成、脉络星系高亮 |
| FilterBar（流派/主题/年代） | 图鉴筛选、阵容预组、实验分支过滤 |
| 脉络星系图 / 时间轴 | 图鉴进度可视化、时代收集成就 |

**数据主权**：哲学家实体只读（来自 `philosophers.ts`），所有玩家进度写入新增 `profiles / collections / progress` 三张 Supabase 表（详见各 GDD 与 consistency-review.md）。

---

## 7. 范围分层（Must / Should / Could）

### 7.1 收藏图鉴与养成
- **Must**：图鉴页 + 收藏状态同步 + CL 1–10 + 学者等级 SL + 每日签到。
- **Should**：流派图鉴解锁、成就系统、时代收集。
- **Could**：卡牌觉醒、动态皮肤、收集册分享。

### 7.2 知识对战与辩论
- **Must**：PVE 基础辩论（固定话题 + AI 五维评分 + D~S 评级 + 防注入）。
- **Should**：PVP 观点对撞、话题生成器、排行榜。
- **Could**：赛季排位、观战、AI 裁判解说。

### 7.3 阵容搭配与羁绊
- **Must**：6 槽位（先 4）+ 同流派共鸣 + 师承羁绊。
- **Should**：跨流派克制矩阵、稀有羁绊页。
- **Could**：自动对战模拟、构筑码分享、社区投票榜。

### 7.4 思想实验与抉择
- **Must**：单章节 3 节点分支 + 单流派回应 + 1 结局。
- **Should**：多流派并排回应 + 多结局（≥4 类）+ 思想倾向人格。
- **Could**：玩家共创剧本、UGC 分支、跨章连续人格。

**MVP 切片**：Must 全集 = 最小可玩闭环（收集→养卡→打 PVE→组阵→走 1 章实验），可在不新增后端表以外复杂度的前提下 2 个迭代内交付。

---

## 8. 交付物索引

| 文件 | 内容 |
|---|---|
| `01-collection.md` | 收藏图鉴与养成 GDD（八节） |
| `02-debate.md` | 知识对战与辩论 GDD（八节） |
| `03-roster.md` | 阵容搭配与羁绊 GDD（八节） |
| `04-thoughtlab.md` | 思想实验与抉择 GDD（八节） |
| `balancing.md` | 平衡性数值总表（资源/曲线/评分/矩阵/概率/上限/闭环） |
| `consistency-review.md` | 跨 GDD 一致性评审（单一事实源/冲突仲裁/理论自检） |

> 下接 `01-collection.md`。所有跨系统数值以 `balancing.md` 为唯一权威，冲突以该表仲裁。
