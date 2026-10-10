# Spec：阶段 4 · 记忆层与人生数据（Memory & Life-Data）

- 状态：**评审通过 · 决策已锁 · 4.1–4.3 + 前端触点 + §10 防编造条款 + eval 记忆用例已实现（2026-10-10）；4.4 人生数据 / L5 embedding 按 D1 延后**
- 主理：陈栩
- 范围：为「哲思对话录」新增**服务端持久记忆**与**授权下的人生数据**能力；**不改**既有人格引擎 / 时代语境 / 漂流瓶 / 思辨闯关的对外行为，只新增「可选注入段 + 新端点」
- 定位：路线图**阶段 4（人生数据）**，是**阶段 5（6G / VR / 物联网渠道）的前置**——没有记忆的 VR 只是「3D 皮肤」，有记忆的哲学家才让「虚拟仿真**交互**」成立
- 硬约束（沿用 `docs/architecture/pve-campaign.md` §2）：**不引入任何数据库**，存储只用 `node:fs` 写 JSON（原子写）；新端点全走 `/api/...` 复用顶部 CORS 与 `{ error: '中文说明' }` 约定；后端保持**呈现无关**（2D 网页 / 桌面 / 未来 VR 共用同一套）

---

## 0. 评审结论（已锁决策 · 2026-10-10）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | MVP 范围 | 只做 **L2 画像 + L3 情景 + L4 治理**；L5 洞察沉淀 / embedding 延后到 4.5 |
| D2 | 授权默认值 | **四类 scope 全部默认 `off`，逐项 opt-in**（隐私优先） |
| D3 | 提炼时机 | **混合**：达 N 轮阈值自动提炼情景摘要 + 用户手动「记住这段」钉重点 |
| D4 | 检索方案 | **先 n-gram**（零依赖 / 可无 Key 测），embedding 留 4.5 升级位 |
| D5 | 首个交付 | **4.1 + 4.2 合并交付**（画像 + 情景 = 第一个「记得住你」的完整体验） |

---

## 1. 背景与目标

**现状（已核对代码，非推测）**

- 对话后端 `/api/philosopher-chat` **无状态**：`messages` 由前端整包上传，服务端不持久化（`server/index.js` 第 716-732 行）
- 历史仅存**浏览器 localStorage**：键 `philosopher-chat-history`，最多保留 20 会话（`src/services/philosopherAI.ts`），换设备 / 换端 / 清缓存即丢失
- **没有「用户是谁」的画像**：哲学家每次都像「初次见面」
- **五层记忆架构（L1-L5）目前仅是愿景概念，零代码落地**

**目标**

1. 让哲学家**跨会话记得用户**（称呼、思想倾向、上次谈到哪），把「交互」做实
2. 记忆**存服务端**，为阶段 5「跨平台携带」（VR / 物联网多端）打底
3. **隐私优先**：记忆与人生数据全程「本地存储 + 显式授权 + 一键撤销 + 彻底删除」，默认最小启用、**绝不入 git、不上云**
4. 全程**零依赖**、**可无 API Key 测试**、**向后兼容**（无记忆 / 未授权时既有行为完全不变）

---

## 2. 复用既有资产（不重造轮子）

| 既有资产 | 位置 | 阶段 4 如何复用 |
|---|---|---|
| `DATA_DIR` + 原子写（`.tmp`→rename） | `store.js` / `bottleStore.js` | 记忆存储直接沿用，含桌面端 `ZS_DATA_DIR` 重定向 |
| 授权三件套 scope / consent / revoke / delete | `bottleService.js` | 人生数据授权语义照搬并扩展为分类授权 |
| 轻量 n-gram RAG + `vector:null` 预留位 | `knowledgeRetriever.js` | 记忆检索同构实现；embedding 可平滑升级、签名不变 |
| system prompt 分段拼接注入 | `index.js` `buildSystemPrompt` | 记忆块像 `knowledgeBlock` / era 段一样拼在人格之后 |
| 严格 JSON 解析 + 无 Key 降级 | `index.js` `judgeConversation` | 记忆提炼管线复用其健壮解析与降级策略 |
| 生成函数参数注入（真实 / stub） | `bottleService.js` `generateReply` | 提炼函数同样注入，无 Key 也能跑闭环测试 |
| 「他人转述，不得假装亲身经历」框架 | `personaCompiler.js`（era 事件卡） | 记忆注入同款免责标注，防诱发编造 |
| 锚点 / 归因双模评测 | `server/evals/` | 新增记忆用例（记得住 / 未授权不记得 / 不编造） |

> 结论：阶段 4 **不引入任何新库**，全部落在既有 Node + React 技术栈与既定模式上。

---

## 3. 五层记忆 → 本项目落地映射

| 层 | 概念 | 本项目落地 | 本期 |
|---|---|---|---|
| L1 规则层 | 能记什么 / 能用什么 / 留多久 + 防编造约束 | `consent.retention` 保留策略 + `personaCompiler` 新增记忆约束条款 | ✅ |
| L2 画像层 | 稳定的用户画像 | `profile.json`：称呼 / 思想倾向向量 / 钉住事实 / 交互偏好 | ✅ 先做 |
| L3 历史层 | 情景记忆 | `episodic/<pid>.json`：对话摘要 + 关键时刻 | ✅ 先做 |
| L4 治理层 | 授权 / 撤销 / 删除 / 审计 | `consent.json`：四类 scope + revoke/delete + audit | ✅ 先做 |
| L5 进化层 | 跨会话洞察沉淀 + 向量升级 | 周期合并「洞察」；n-gram→embedding | ⏭ 演进位（4.5） |

**MVP 聚焦 L2 + L3 + L4**；L5 与 embedding 作为预留演进位（照 `knowledgeRetriever` 的升级注释与漂流瓶 `vector` 字段的既定做法）。

---

## 4. 数据模型与存储

**存储根**：`DATA_DIR/memory/`（本地开发 = `server/data/memory/`；桌面打包 = `ZS_DATA_DIR/memory/`）。
**全部加入 `.gitignore`**（用户内容，同 `bottles.json` 待遇）。所有写盘走原子写。

```
memory/
├── profile.json            # L2 画像（单用户）
├── consent.json            # L4 治理：分类授权 + 审计
├── lifedata.json           # 阶段4 人生数据分块（强隔离，可整体删除）
└── episodic/
    ├── kant.json           # L3 情景记忆按哲学家分片，避免单文件膨胀
    └── confucius.json
```

### 4.1 `profile.json`（L2 画像）

```jsonc
{
  "version": 1,
  "displayName": "陈栩",                    // 希望被如何称呼（可空）
  "inclinations": {                          // 思想倾向向量（复用 thoughtlab 的 T 概念，先粗粒度）
    "schools": { "stoicism": 0.4, "existentialism": 0.3 },   // 流派权重 0-1
    "themes":  { "自由意志": 0.5, "死亡": 0.2 }               // 主题权重 0-1
  },
  "facts": [                                 // 用户显式钉住的稳定事实
    { "id": "uuid", "text": "我是一名程序员", "pinnedBy": "user", "createdAt": "ISO" }
  ],
  "preferences": { "tone": "直接", "verbosity": "简洁" },      // 交互偏好
  "updatedAt": "ISO"
}
```

### 4.2 `episodic/<philosopherId>.json`（L3 情景记忆）

```jsonc
{
  "philosopherId": "kant",
  "entries": [
    {
      "id": "uuid",
      "summary": "用户就「能否确知自己行为的道德后果」与康德深谈，倾向后果论",  // LLM 提炼的摘要（非原话）
      "salient": ["用户提到近期工作压力大", "用户对「义务」一词有明显抵触"],     // 关键时刻
      "turns": 8,
      "createdAt": "ISO",
      "vector": null                          // 预留 embedding
    }
  ]
}
```

### 4.3 `consent.json`（L4 治理）

```jsonc
{
  "version": 1,
  "scopes": {
    "profile": "off",            // 允许使用画像
    "episodic": "off",           // 允许使用情景记忆
    "crossPhilosopher": "off",  // 画像是否跨哲学家共享（默认 off：康德知道的不自动告诉孔子）
    "lifeData": "off"           // 是否启用人生数据（默认 off）
  },
  "retention": { "episodicMaxEntries": 50, "days": null },   // L1 保留策略
  "audit": [ { "action": "grant|revoke|delete", "scope": "episodic", "at": "ISO" } ],
  "grantedAt": "ISO",
  "revokedAt": null
}
```

> **初始默认（D2）**：四项 scope 全为 `off`；用户在设置面板逐项 opt-in 后才置 `on`，`lifeData` / `crossPhilosopher` 开启需二次确认。

### 4.4 `lifedata.json`（人生数据）

```jsonc
{
  "consentVersion": 1,
  "chunks": [
    { "id": "uuid", "source": "自传片段.txt", "text": "……", "vector": null, "addedAt": "ISO" }
  ]
}
```

---

## 5. 检索与注入（与 `knowledgeRetriever` 同构）

新增 `server/memoryRecall.js`，签名风格对齐 `retrieveKnowledge`：

- `recallProfile()` → 画像摘要文本（仅 `scopes.profile === 'on'`）
- `recallEpisodic(philosopherId, query, { budget })` → n-gram 打分取 top-k 条摘要（仅 `scopes.episodic === 'on'`；`crossPhilosopher === 'off'` 时只取该哲学家自己的分片）
- `recallLifeData(query, { budget })` → 预留，仅 `scopes.lifeData === 'on'` 生效
- n-gram 打分 / 长度预算 / 优先级回退**照搬** `knowledgeRetriever.js`；升级 embedding 时填 `vector` 字段、保持函数签名不变

**注入**：`buildSystemPrompt` 增加**可选**记忆段（拼在人格 + 知识 + 时代语境之后）：

```
【关于对话者的已知信息（供你自然称呼、延续话题；这是他人告知你的资料，
  非你与此人的共同经历，不得假装你们过去见过面或共历某事）】
· 称呼：陈栩
· 思想倾向：偏向斯多葛与存在主义
· 上次你们谈到：用户就「道德行为的后果」与你深谈，倾向后果论
```

- **预算约束**：如 profile ≤ 400 字 + episodic ≤ 800 字，避免挤占人格与知识、控成本
- **向后兼容**：无记忆 / 未授权时该段为空字符串，`/api/philosopher-chat` 既有调用零改动

---

## 6. 记忆提炼管线（L3 写入）

- **时机（D3 已定：混合）**：① 对话达 **N 轮阈值**（默认 N=8，可配）自动触发 `POST /api/memory/extract` 提炼情景摘要；② 用户随时可点「记住这段」手动钉重点（手动钉的进 `profile.facts`，需确认）
- **实现**：`extractMemory(philosopherId, messages, { llm })`，复用 `judgeConversation` 模式：
  - 低温度（0.2）+ **严格 JSON** 输出：`{ summary, salient[], inclinationDelta, factsToPin[] }`
  - **健壮解析**（提取首个 `{` 到末尾 `}`）；无 Key / 解析失败 / 异常 → **降级为「跳过提炼」**（不阻断对话，记忆只是不增长）
  - 提炼用的模型调用**参数注入**（路由层传真实 `llm.chatOnce`，测试传 stub），**无 Key 可跑闭环**（对齐 `bottleService.generateReply` 与 `npm run test:bottle`）
- **写入规则**：
  - `summary` / `salient` → 追加 `episodic/<pid>.json`（受 `retention.episodicMaxEntries` 上限，超限淘汰最旧）
  - `inclinationDelta` → 滑动平均更新 `profile.inclinations`
  - `factsToPin` → **需用户确认**才写入 `profile.facts`（防误记，见 §12 决策 3）

---

## 7. 授权与治理（L4，隐私优先）

- **默认最小（D2 已定）**：四类 scope（`profile` / `episodic` / `crossPhilosopher` / `lifeData`）**全部默认 `off`**，用户在设置面板逐项 opt-in 才生效；其中 `lifeData`、`crossPhilosopher` 每次开启需二次确认
- **分类授权**：四类 scope 独立开关（见 `consent.json`），前端提供可视化开关面板
- **一键撤销 revoke**：立即抹除对应内容，仅留审计元数据（action / at），退出一切注入与检索；**幂等**（照搬 `bottleService.revokeBottle`）
- **彻底删除 delete**：整类记录移出存储，不可恢复
- **本地优先 + 绝不出境**：记忆与人生数据只存本地 `DATA_DIR/memory/`，`.gitignore` 排除，不随任何请求上云；唯一外发是提炼时把**当轮对话**发给已配置的模型（与现状一致，且受 scope 门控）
- **审计**：`consent.audit` 记录 grant / revoke / delete 时间线，可对用户展示

---

## 8. 人生数据接入（阶段 4 的重头，也是风险最高处）

- **入口**：用户在 `lifeData = on` 后，上传**文本类**人生资料（自传片段、人生时间线、重要事件）
- **处理**：分块（按段落 / 长度）存 `lifedata.json`；检索同 §5（n-gram → embedding）
- **强隔离**：`lifeData` 检索结果**仅**在 `scopes.lifeData === 'on'` 时注入；`delete` 时整文件移除
- **本期边界**：仅**本地文本**、**单用户**；**不做**跨平台同步 / 云端 vault / 多租户 / 非文本（音视频）——这些属生产化议题，遵循「内网试点期暂不生产化，达标后再改造」的既定约定

---

## 9. API 契约（全走 `/api`，复用 CORS 与 `{ error }` 约定）

| 方法 | 端点 | 说明 |
|---|---|---|
| GET | `/api/memory/profile` | 读画像 |
| POST | `/api/memory/profile` | 更新 `{ displayName?, facts?, preferences? }` |
| GET | `/api/memory/recall?philosopherId=&query=` | 返回**将被注入**的记忆（对用户透明可见） |
| POST | `/api/memory/extract` | `{ philosopherId, messages }` → 提炼并写入 |
| GET | `/api/memory/consent` | 读授权状态 |
| POST | `/api/memory/consent` | `{ scopes }` 设置分类授权 |
| POST | `/api/memory/revoke` | `{ scope }` 撤销某类（抹内容留审计） |
| DELETE | `/api/memory?scope=` | 彻底删除某类 |
| POST | `/api/memory/lifedata` | `{ text, source }` 上传人生数据分块 |
| DELETE | `/api/memory/lifedata` | 清空人生数据 |

`/api/philosopher-chat` 变更（**向后兼容**）：新增**可选**行为——依据 `consent` + `philosopherId` 自动注入记忆段；或前端显式传 `memoryContext`。不传 / 未授权时与现状完全一致。

---

## 10. 人格安全：记忆不得诱发编造

**风险**：注入用户记忆后，模型可能「假装与你共历」（如「我记得我们上次一起……」）。
**对策**：

1. ✅ 注入段显式标注「他人告知的资料，非共同经历」（`memoryRecall.buildMemoryBlock` 免责头，同 era 事件卡「他人转述」框架）
2. ✅ `personaCompiler` 已增约束**条款 5：不得虚构与对话者的见面 / 共处 / 共同经历**；`PERSONA_VERSION` 2→3，`npm run eval` 17/17 绿
3. ✅ 评测已加诱导用例 `kant-memory-no-coexperience` / `confucius-memory-no-coexperience`：用户称「上次一起登山 / 同游沂水」→ 哲学家须**澄清并未亲历、不编造**

---

## 11. 分步实施（每步可独立交付 + 回归）

| 步 | 交付 | 关键文件 | 测试 |
|---|---|---|---|
| **4.1** | 存储骨架 + 画像层 | `memoryStore.js`、`profile.json`、`GET/POST /api/memory/profile`、`buildSystemPrompt` 注入画像段 | 读写 / 容错 / 原子写 |
| **4.2** | 情景记忆 + 提炼管线 | `episodic/`、`memoryRecall.js`、`extractMemory`、top-k 注入 | stub 提炼闭环、recall 打分确定性、无 Key 降级 |
| **4.3** | 治理层 | `consent.json`、四类 scope、revoke/delete/audit、scope 门控注入 | 未授权不注入、撤销抹除、幂等 |
| **4.4** | 人生数据 | `lifedata.json`、上传 / 分块 / 检索 / 删除、强隔离 | 授权门控、删除清零 |
| **4.5** | 演进（后续） | L5 洞察沉淀、embedding 升级（DashScope text-embedding 填 `vector`）、localStorage 历史**导入桥** | 向量检索回归、老用户历史不丢 |

**首个合并交付 = 4.1 + 4.2（D5 已定）**：画像 + 情景一起上线，构成第一个「哲学家记得住你」的完整体验；4.3 治理紧随其后。每步完成跑 `npm run eval` 回归；4.2 起新增 `npm run test:memory` 无 Key 闭环（对齐 `npm run test:bottle`）。

> **实现状态（2026-10-10）**：4.1 画像 / 4.2 情景+提炼 / 4.3 治理**后端全部完成**，前端触点（记忆面板 `MemoryPanel` + 对话窗「记住这段」/ 达 8 轮自动提炼）已接线；`npm run eval` 17/17、`test:memory` 33/33、`test:bottle` 28/28 全绿。4.4 人生数据 / 4.5 演进按 D1 延后。

---

## 12. 关键决策与取舍

1. **服务端记忆 vs 纯客户端** → 选**服务端**：阶段 5「跨端携带」必需。代价：隐私面变大 → 用「本地优先 + 分类授权 + gitignore + 不上云」对冲。
2. **n-gram vs embedding** → **先 n-gram（D4 已定）**：零依赖、确定性、可测、同构既有 retriever。代价：词面匹配不懂同义改写 → MVP 可接受，embedding 作预留升级（`vector` 字段），4.5 再切。
3. **自动提炼 vs 手动钉住** → **混合（D3 已定）**：达 N 轮阈值自动提炼情景摘要（省心）+ 用户手动「记住这段」钉重点、画像 `facts` 需确认（防误记）。代价：多一次 LLM 调用 → 阈值触发 + 无 Key 降级跳过 + 可关。
4. **单用户本地 vs 多租户** → **先单用户本地**：贴合现状与「不过度生产化」约定；但存储按可隔离结构（`episodic/<pid>`、分类 scope）组织，为多用户留形。
5. **注入预算** → profile 优先、episodic top-k 受字数预算，避免挤占人格 / 知识、控 token 成本。

---

## 13. 评测与验收

- **分工（已落地）**：`runEvals` 只编译人格、不注入记忆，故 eval 覆盖**人格级防编造**——已加 `kant/confucius-memory-no-coexperience` 诱导用例（check 验人格含条款 5、live 验澄清不编造）；「记得住称呼 / 未授权不提及 / 跨哲学家隔离」等**注入门控归因**由 `npm run test:memory` 确定性覆盖（未授权 `buildMemoryBlock` 返空、crossPhilosopher off/on、recall 门控，无需 Key），比 live 更稳。
- 复用 check（零成本锚点）+ live（真调）双模式；提炼管线用 stub 做**无 Key 闭环回归**
- **验收**：`npm run eval` 17/17 ✅ + `npm run test:memory` 33/33 ✅ + `npm run test:bottle` 28/28 ✅（回归未破）

---

## 14. 风险与遗留

- **隐私**：人生数据高度敏感 → 默认 off、本地、可撤销 / 删除；**严禁入 git**（延续 API Key 铁律同款纪律，推送前四查扩展到 `memory/` 目录）
- **提炼准确性**：LLM 可能提错 → `facts` 需确认、`episodic` 标注为「摘要」非原话、全程可删
- **成本**：每轮多一次提炼调用 → 阈值触发 + 可关 + 降级
- **本期未做**：多租户 / 账号体系、云端同步、embedding、VR 呈现——留 4.5 / 阶段 5

---

## 15. 与阶段 5（VR / 6G）的衔接

记忆层是**呈现无关**的：VR 客户端调用同一套 `/api/memory/*` 与 `/api/philosopher-chat`，后端一行不改。
届时的「虚拟仿真交互」= **3D 舞台（阶段 5）+ 记得你的哲学家（阶段 4）**。
因此阶段 4 每一处都以「后端不感知前端形态」为纪律——VR 到来时**零重写**，只是把「相框里的演员」请进「你客厅的房间」，而他**已经认识你**。
