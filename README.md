# 哲思人物志 - 哲学家智能体画廊

> 与 61 位中外思想家跨越时空对话

---

## ⚙️ API 配置（必读 - 部署前第一步）

 philosopher AI 对话功能需要一个 **OpenAI 兼容的大模型 API** 来驱动。请在启动应用前完成以下配置。

### 第一步：获取 API Key

选择以下任一服务商，注册并获取 API Key：

| 服务商 | 注册地址 | API Key 格式 | 推荐模型 |
|--------|---------|-------------|---------|
| **OpenAI** | https://platform.openai.com | `sk-...` | `gpt-4o-mini` |
| **DeepSeek** | https://platform.deepseek.com | `sk-...` | `deepseek-chat` |
| **Moonshot (Kimi)** | https://platform.moonshot.cn | `sk-...` | `moonshot-v1-8k` |
| **通义千问** | https://dashscope.aliyun.com | `sk-...` | `qwen-plus` |

### 第二步：创建配置文件

在项目根目录下，将 `.env.example` 复制为 `.env`：

```bash
# Linux / macOS
cp .env.example .env

# Windows
copy .env.example .env
```

### 第三步：填写你的 API 信息

用文本编辑器打开 `.env` 文件，修改以下三项：

```ini
# 你的 API Key（必填）
OPENAI_API_KEY=sk-你的真实API_Key

# API 基础地址（根据服务商选择）
OPENAI_BASE_URL=https://api.openai.com/v1

# 模型名称（根据服务商选择）
OPENAI_MODEL=gpt-4o-mini
```

**各服务商完整配置示例：**

<details>
<summary>🔹 OpenAI 配置</summary>

```ini
OPENAI_API_KEY=sk-你的Key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```
</details>

<details>
<summary>🔹 DeepSeek 配置</summary>

```ini
OPENAI_API_KEY=sk-你的Key
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```
</details>

<details>
<summary>🔹 Moonshot (Kimi) 配置</summary>

```ini
OPENAI_API_KEY=sk-你的Key
OPENAI_BASE_URL=https://api.moonshot.cn/v1
OPENAI_MODEL=moonshot-v1-8k
```
</details>

<details>
<summary>🔹 通义千问配置</summary>

```ini
OPENAI_API_KEY=sk-你的Key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus
```
</details>

> **注意：** `.env` 文件已在 `.gitignore` 中排除，不会被上传到 GitHub。请勿将 API Key 硬编码在代码中或提交到版本库。

### 验证配置是否生效

启动服务后，访问健康检查接口：

```bash
curl http://localhost:3016/health
```

如果返回 `"hasApiKey": true`，说明 API Key 已正确加载。

---

## 项目简介

哲思人物志是一个交互式哲学家知识库与 AI 对话应用，涵盖 **61 位中外思想家**，跨越古今中外多个哲学流派。

### 功能特性

- **哲学家画廊**：浏览 61 位哲学家的生平、核心思想、名言、著作和影响
- **AI 对话**：选择任意哲学家，以该哲学家的口吻和思想进行 AI 对话
- **多维筛选**：按时代、流派（35 个）、主题（30 个）筛选哲学家
- **思想对比**：选择 2–4 位哲学家并排对比；「同一问题 · 不同看法」可让多位思想家就同一问题各自 AI 作答并对比差异（对比面板从右侧滑入，支持滚轮浏览）
- **PVE 思辨闯关**：关卡制知识对战。选择哲学家就指定议题进行思辨对谈，AI 从相关性 / 深度 / 逻辑 / 原创性 / 文明度五维评分，关卡线性解锁、进度本地持久化
- **思想脉络图**：可视化展示哲学家之间的思想传承关系
- **时间轴**：按时间线查看哲学家的历史分布
- **人格引擎（阶段 1）**：61 位思想家的系统提示词不再靠手写自由文本，而由 `server/personaCompiler.js` 从 19 字段结构化档案 + 风格档**编译**生成，内置防编造约束与 `[persona:vN]` 版本标记；编译失败自动回退 legacy 提示词
- **人格评测**：`npm run eval` 零成本回归评测集（锚点校验）；`npm run eval:live` 真调模型做规则判定——让「像康德」可证伪
- **时代语境（阶段 2）**：事件卡（1900/2026/2035）作为独立层注入人格，`[persona:v2|era:<eraId>]` 版本标记 + 归因评测——让「哲学家随时代迭代思考」可证伪
- **思考漂流瓶（阶段 3）**：写下一个思考扔进时间之海，主题匹配后由哲学家拾瓶而答；授权三件套（用途范围/一键撤销/彻底删除）从第一天内置，`npm run test:bottle` 闭环回归

### 哲学家覆盖范围

| 时代 | 流派 | 代表哲学家 |
|------|------|-----------|
| 古代 | 古希腊哲学 | 苏格拉底、柏拉图、亚里士多德 |
| 古代 | 道家 | 老子、庄子 |
| 古代 | 儒家 | 孔子、孟子、荀子、董仲舒 |
| 古代 | 法家 | 韩非 |
| 古代 | 墨家 | 墨子 |
| 古代 | 佛教 | 释迦牟尼、龙树 |
| 古代 | 斯多葛学派 | 爱比克泰德、塞内卡、马可·奥勒留 |
| 古代 | 新柏拉图主义 | 普罗提诺 |
| 古代 | 印度哲学 | 奥义书哲人、商羯罗 |
| 近代 | 启蒙思想 | 伏尔泰、卢梭 |
| 近代 | 理性主义 | 笛卡尔、斯宾诺莎、莱布尼茨、帕斯卡 |
| 近代 | 经验主义 | 洛克、休谟、贝克莱 |
| 近代 | 德国古典哲学 | 康德、黑格尔 |
| 近代 | 功利主义 | 边沁、密尔 |
| 近代 | 唯意志论 | 叔本华 |
| 近代 | 实证主义 | 孔德 |
| 近代 | 宋明理学 | 朱熹、王阳明、王夫之 |
| 近代 | 禅宗 | 慧能 |
| 现代 | 存在主义 | 克尔凯郭尔、尼采、海德格尔、萨特、波伏娃、加缪 |
| 现代 | 现象学 | 胡塞尔 |
| 现代 | 分析哲学 | 罗素、维特根斯坦 |
| 现代 | 马克思主义 | 马克思 |
| 现代 | 后现代主义 | 福柯、德里达、德勒兹 |
| 现代 | 法兰克福学派 | 阿多诺 |
| 现代 | 生命哲学 | 柏格森 |
| 现代 | 政治哲学 | 阿伦特、罗尔斯 |

---

## 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** 或 **pnpm**

### 安装

```bash
# 克隆仓库
git clone https://github.com/你的用户名/philosophers-gallery.git
cd philosophers-gallery

# 安装依赖
npm install
```

### 配置

按照本文档顶部的 [API 配置](#️-api-配置必读---部署前第一步) 章节完成 `.env` 文件配置。

### 启动

```bash
# 方式一：一键启动（Windows）
start.bat

# 方式二：手动启动前后端
npm run dev          # 启动前端 (端口 3015)
node server/index.js # 启动后端 (端口 3016)
```

启动后访问 http://localhost:3015 即可使用。首页顶部导航含「闯关」（PVE 思辨闯关）与「漂流瓶」（思考漂流瓶）入口；思想家卡片右上角按钮可收藏 / 对话 / 加入对比。

### 构建生产版本

```bash
npm run build    # 构建前端到 dist/
npm run preview  # 预览构建结果
```

---

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                   浏览器 (:3015)                  │
│  React + Vite + TanStack Router + Tailwind CSS  │
└──────────────────┬──────────────────────────────┘
                   │ /sb-api/* (Vite Proxy)
                   ▼
┌─────────────────────────────────────────────────┐
│              本地后端服务器 (:3016)                │
│         Node.js HTTP Server (ES Module)          │
│  ┌─────────────────────────────────────────┐    │
│  │  哲学家系统提示词 (61 位)                  │    │
│  │  OpenAI 兼容 API 流式转发 (SSE)           │    │
│  └─────────────────────────────────────────┘    │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────┐
│          OpenAI 兼容 LLM API 服务                │
│  (OpenAI / DeepSeek / Moonshot / 通义千问)       │
└─────────────────────────────────────────────────┘
```

### 项目结构

```
├── src/
│   ├── data/
│   │   └── philosophers.ts      # 61 位哲学家数据 + 筛选选项 + 传承关系
│   ├── services/
│   │   ├── philosopherAI.ts     # AI 对话服务（流式 SSE）
│   │   └── bottles.ts           # 漂流瓶 API 服务（阶段 3）
│   ├── components/               # React 组件
│   ├── routes/                   # 页面路由（index / campaign / bottles）
│   └── main.tsx                  # 应用入口
├── server/
│   ├── index.js                 # 后端服务器（端口 3016）
│   ├── philosopherPrompts.js    # 61 位哲学家 AI 系统提示词（legacy 兜底）
│   ├── personaCompiler.js       # 人格编译器：19 字段档案 + 风格档 + 时代事件卡 → 约束模板
│   ├── bottleStore.js           # 漂流瓶 JSON 持久化（原子写，阶段 3）
│   ├── bottleService.js         # 漂流瓶业务：扔瓶/匹配/应答/撤销/删除
│   ├── bottleRoutes.js          # /api/bottles 端点组
│   ├── llm.js                   # OpenAI 兼容 API 非流式补全助手
│   ├── evals/                   # 人格评测（cases.json + runEvals.js）
│   └── data/
│       ├── philosopher-knowledge.json  # 19 字段结构化档案
│       ├── persona-styles.json         # 风格档（迁移脚本生成）
│       ├── era-contexts.json           # 时代语境事件卡（阶段 2）
│       └── bottles.json                # 漂流瓶运行时数据（用户内容，.gitignore 排除）
├── scripts/
│   ├── migrate-personas.mjs     # legacy 手写提示词 → 风格档 迁移工具
│   ├── demo-era-diff.mjs        # 阶段 2 演示：有无时代语境的差异对比
│   └── test-bottle-loop.mjs     # 阶段 3 闭环测试（stub 应答，无需 Key/服务）
├── .env.example                 # 配置文件模板
├── .env                         # 你的实际配置（不入库）
├── start.bat                    # Windows 一键启动
├── vite.config.ts               # Vite 配置（含代理）
└── package.json
```

---

## 人格引擎与评测（阶段 1）

「与哲学家对话」的对象本质不是复活的人，而是**思维风格的可计算表示**。因此本项目把系统提示词从手写自由文本改为由结构化资产编译：

| 资产 | 文件 | 作用 |
|------|------|------|
| 19 字段结构化档案 | `server/data/philosopher-knowledge.json` | 思想/原话/著作/学派等（与前端 `src/data/philosophers.ts` 同源） |
| 风格档 | `server/data/persona-styles.json` | intro/风格 bullet/禁忌/口吻收尾，由 `npm run personas:migrate` 从 legacy 手写提示词解析 |
| 编译器 | `server/personaCompiler.js` | 编译为带防编造条款与 `[persona:vN]` 版本标记的约束模板；`opts.era` 预留时代语境钩子（阶段 2） |
| 评测集 | `server/evals/cases.json` | 锚点用例：grounding 必含、身后事件防编造含一、破格串必不含 |
| 评测 runner | `server/evals/runEvals.js` | check 模式（不调模型、可进 CI）/ live 模式（真调模型规则判定） |

```bash
npm run eval              # check 模式：校验评测锚点确实被编译产物供给
npm run eval:live         # live 模式：需 .env 配置有效 OPENAI_*；报告落盘 server/evals/last-report.json
npm run personas:migrate  # 重新解析 legacy 手写提示词为风格档（幂等）
```

约定：改编译器约束条款或分段结构时递增 `PERSONA_VERSION` 并跑 `npm run eval` 回归；对话服务编译失败时自动回退 `server/philosopherPrompts.js` 的 legacy 手写提示词，可用性不受影响。

---

## 时代语境层（阶段 2）

让「随时代迭代思考」可证伪：事件卡作为独立层注入人格，且差异**只能归因于时代层**。

- **事件卡数据**：`server/data/era-contexts.json` — `era-1900`（第二次工业革命）、`era-2026-ai`（大模型普及）、`era-2035-6g`（6G 与虚拟仿真，卡内显式标注「推演」）
- **编译器 v2**：`compileWithEra(id, eraId)` 注入【时代语境】段并写入 `[persona:v2|era:<eraId>]` 标记；事件卡注明「他人转述，不得假装亲身经历」
- **API**：chat 请求体可选 `eraId`；`GET /eras` 返回事件卡列表（供前端选择器）
- **归因评测**：带 `eraId` 的用例校验「事件词仅注入版出现」——check 模式对比两份人格，live 模式额外要求两版回答不得相同
- **演示**：`npm run demo:era`（编译演示，不调模型）；`npm run demo:era -- kant era-1900 --live` 真调模型并排对比两版回答

---

## 思考漂流瓶（阶段 3 · 最小闭环）

让思考变成漂流瓶：从「一个思考」开始（不收人生数据），授权三件套是存在前提而非功能。

**闭环**：扔瓶（选授权范围）→ 主题匹配 → 哲学家拾瓶而答（人格编译器 + 可选时代语境）→ 一键撤销 / 彻底删除。前端入口：首页导航「漂流瓶」或直接访问 `/bottles`。

**授权三件套**：

| 能力 | 实现 |
|------|------|
| 用途范围 | 扔瓶时三选一：`private`（仅自己可见）/ `reply-only`（仅供匹配的哲学家回应，默认）/ `public-anon`（匿名进公共瓶墙）；范围随瓶落库为 `consent`（scope/version/grantedAt） |
| 一键撤销 | `POST /api/bottles/:id/revoke`：正文、回信、匹配、向量立即抹除，仅留审计元数据；撤销后再应答返回 409，瓶墙与匹配池同步退出 |
| 彻底删除 | `DELETE /api/bottles/:id`：整条记录移出存储，不可恢复 |

**模块**：`server/bottleStore.js`（JSON 持久化，原子写，运行时文件不入库）→ `server/bottleService.js`（业务 + 主题词匹配，`generateReply` 可注入）→ `server/bottleRoutes.js`（`/api/bottles` 端点组）→ `server/llm.js`（非流式补全，复用阶段 1/2 人格编译产物）。匹配为零依赖的主题词重叠打分（themes/keyConcepts/school 子串命中加权，确定性可测试）；瓶子预留 `vector` 字段，接入 embedding 后可升级为向量检索。

```bash
npm run test:bottle   # 闭环回归：扔瓶/瓶墙可见性/应答/撤销/删除/参数校验 28 项断言，
                      # stub 应答 + 临时目录，无需 API Key、无需起服务，可进 CI
```

边界说明：本地单人部署无账号体系，「我的瓶子」即本机全部瓶子；多用户授权隔离属阶段 4（人生数据）议题。

---

## 产品愿景（路线图，非已交付）

> 以下为产品愿景与技术路线，**不代表当前已交付功能**。

- **时代命题**：物质丰裕之后，精神与哲学层面的思考成为新的刚需，平台提供更多思想碰撞的场所
- **虚拟仿真交互（阶段 5 渠道层）**：6G 时代 AI、物联网、虚拟仿真等新质生产力下，人能与时代潮汐中的哲学家沉浸式交互；其内核——时代语境层（事件卡注入 + 归因评测）已在阶段 2 交付，沉浸式渠道仍在路线图
- **思考漂流瓶（阶段 3 起）**：最小闭环已交付——扔瓶/授权三件套/主题匹配/哲学家拾瓶而答；愿景中「人生数据经本人授权后上传交互」的深度形态属阶段 4，授权三件套已是其存在前提
- **随大模型变强**：平台沉淀的是不随模型贬值的互补资产——结构化语料、评测集、授权关系与交互记忆

---

## 自定义

### 添加新哲学家

1. 在 `src/data/philosophers.ts` 的 `philosophers` 数组中添加新的哲学家对象
2. 在 `server/data/philosopher-knowledge.json` 添加对应的 19 字段结构化档案（人格编译器的数据源）
3. （可选）在 `server/data/persona-styles.json` 补风格档条目；缺失时编译器仅用结构化档案编译
4. 在 `influenceRelations` 数组中添加思想传承关系
5. 在 `filterOptions` 中添加新的流派/主题（如需要）
6. 在 `server/evals/cases.json` 为新哲学家补至少一条锚点用例，跑 `npm run eval` 回归

### 修改 AI 模型

编辑 `.env` 文件中的 `OPENAI_MODEL` 字段即可切换模型，无需修改代码。

---

## License

MIT
