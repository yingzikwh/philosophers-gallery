/**
 * 哲学家画廊 - 本地后端服务器
 * 替代原始 Supabase Edge Function，提供 OpenAI 兼容的流式聊天 API
 *
 * 使用方法：
 * 1. 在 .env 文件中配置 OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL
 * 2. 运行: node server/index.js
 *
 * 环境变量说明（见 .env 文件）：
 *   OPENAI_API_KEY  - 你的 API Key
 *   OPENAI_BASE_URL - API 基础地址（如 https://api.openai.com/v1）
 *   OPENAI_MODEL    - 模型名称（如 gpt-4o-mini）
 *   PORT            - 服务器端口（默认 3016）
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { philosopherPrompts } from './philosopherPrompts.js';
import { loadProgress, saveProgress } from './store.js';
import { JUDGE_SYSTEM_PROMPT } from './judgePrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 .env 文件
try {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
} catch (e) {
  // .env 文件不存在，忽略
}

const PORT = process.env.PORT || 3016;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function sendJSON(res, status, data) {
  res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ============================================================
// 思想家最新消息 · 联网抓取（多数据源）+ 离线快照回退
// ------------------------------------------------------------
// 重要：Google News 在中国大陆被屏蔽，故优先使用「必应新闻 RSS」
//       （中国大陆可正常访问），Google News 作为境外备用，
//       再退维基百科相关条目，最后才是构建时抓取的本地快照。
// ============================================================
const NEWS_TIMEOUT_MS = 12000;
const NEWS_SNAPSHOT_PATH = path.join(__dirname, 'data', 'philosopher-news.json');

/** 解析 RSS XML 中的 <item> 列表，兼容 CDATA 与末尾「 - 来源」标题格式 */
function parseRssItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const pick = (tag) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return mm ? mm[1].replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').trim() : '';
    };
    const titleRaw = pick('title');
    const source = pick('source');
    const title = source && titleRaw.endsWith(` - ${source}`)
      ? titleRaw.slice(0, -(` - ${source}`).length)
      : titleRaw;
    const link = pick('link');
    if (title && link) {
      items.push({ title, link, source: source || '', pubDate: pick('pubDate'), description: pick('description') });
    }
  }
  return items.slice(0, 8);
}

/** 单个数据源抓取，返回 { source, items } 或抛错 */
async function fetchFromSource(source, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);
  try {
    const resp = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PhilosopherGallery/1.0)' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (source.json) {
      const data = await resp.json();
      const arr = data?.query?.search || [];
      const items = arr
        .filter((s) => s.title && s.title.indexOf('File:') === -1)
        .map((s) => ({
          title: s.title,
          link: `https://zh.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`,
          source: '维基百科',
          pubDate: '',
          description: (s.snippet || '').replace(/<[^>]+>/g, ''),
        }));
      if (!items.length) throw new Error('维基百科无相关结果');
      return { source: 'wikipedia', items };
    }
    const xml = await resp.text();
    const items = parseRssItems(xml);
    if (!items.length) throw new Error('RSS 解析为空');
    return { source: source.name, items };
  } finally {
    clearTimeout(timer);
  }
}

/** 思想家最新消息：多源依次尝试，全部失败则回退本地快照 */
async function handleNewsRoute(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const name = url.searchParams.get('name') || '';
  const nameEn = url.searchParams.get('nameEn') || '';
  const query = [name, nameEn, '哲学'].filter(Boolean).join(' ');

  const sources = [
    { name: 'bing', url: `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&mkt=zh-CN` },
    { name: 'google', url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans` },
    { name: 'wikipedia', json: true, url: `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=8` },
  ];

  // —— 优先联网（多源依次尝试）——
  for (const src of sources) {
    try {
      const { source, items } = await fetchFromSource(src, query);
      sendJSON(res, 200, {
        online: true,
        source, // 'bing' | 'google' | 'wikipedia'，便于前端标识来源
        fetchedAt: new Date().toISOString(),
        query,
        items,
      });
      return;
    } catch (err) {
      console.warn(`[news] 数据源 ${src.name} 失败:`, err.message);
    }
  }

  // —— 回退：读取构建时抓取的本地快照 ——
  try {
    const snapshot = JSON.parse(fs.readFileSync(NEWS_SNAPSHOT_PATH, 'utf8'));
    const entry = snapshot[nameEn] || snapshot[name] || null;
    sendJSON(res, 200, {
      online: false,
      source: 'snapshot',
      note: '联网抓取不可用（当前网络无法访问新闻源），已展示离线快照。',
      query: [name, nameEn].filter(Boolean).join(' '),
      items: entry?.items || [],
      snapshotUpdatedAt: entry?.updatedAt || snapshot.updatedAt || null,
    });
  } catch (err) {
    sendJSON(res, 200, { online: false, source: 'snapshot', note: '既无网络也无法读取本地快照。', items: [] });
  }
}

// ============================================================
// 思想家代表著作 · 完整原文抓取（维基文库 / 古登堡）+ 本地缓存
// 供前端「阅读完整原著」使用；首次联网拉取后缓存，之后离线可重读。
// ============================================================
const WORKS_CACHE_DIR = path.join(__dirname, 'data', 'works-cache');
try { fs.mkdirSync(WORKS_CACHE_DIR, { recursive: true }); } catch {}

/** 去除 Wikitext 模板/引用/标签，转为可读纯文本 */
function stripWikitext(wt) {
  return wt
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '') // 参考文献
    .replace(/<[^>]+>/g, '') // 其余 HTML 标签
    .replace(/\{\{[^{}]*\}\}/g, '') // 简单模板 {{...}}
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1') // 内部链接 [[a|b]] -> b
    .replace(/'''?/g, '') // 粗斜体
    .replace(/^\s*[\=\-]{2,}.*$/gm, '') // 章节标记行
    .replace(/^\{\|[\s\S]*?\|\}/gm, '') // 表格
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 抓取完整原著：type=wikisource|gutenberg */
async function handleWorkRoute(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const type = url.searchParams.get('type') || 'wikisource';
  const query = (url.searchParams.get('query') || '').trim();
  const lang = url.searchParams.get('lang') || 'zh';
  if (!query) return sendJSON(res, 400, { error: '缺少 query 参数' });

  const cacheKey = `${type}_${lang}_${query}`.replace(/[^\w一-龥-]/g, '_').slice(0, 120);
  const cacheFile = path.join(WORKS_CACHE_DIR, `${cacheKey}.txt`);
  const fetchWork = async () => {
    if (type === 'gutenberg') {
      const id = query.replace(/\D/g, '');
      const resp = await fetch(`https://www.gutenberg.org/files/${id}/${id}-0.txt`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PhilosopherGallery/1.0)' },
      });
      if (!resp.ok) throw new Error(`Gutenberg HTTP ${resp.status}`);
      return { text: await resp.text(), title: query };
    }
    // Wikisource：先检索再取正文
    const searchUrl = `https://${lang === 'en' ? 'en' : 'zh'}.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`;
    const sResp = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PhilosopherGallery/1.0)' } });
    if (!sResp.ok) throw new Error(`Wikisource 检索 HTTP ${sResp.status}`);
    const sData = await sResp.json();
    const title = sData?.query?.search?.[0]?.title;
    if (!title) throw new Error('未找到对应页面');
    const parseUrl = `https://${lang === 'en' ? 'en' : 'zh'}.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`;
    const pResp = await fetch(parseUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PhilosopherGallery/1.0)' } });
    if (!pResp.ok) throw new Error(`Wikisource 正文 HTTP ${pResp.status}`);
    const pData = await pResp.json();
    const wt = pData?.parse?.wikitext?.['*'] || '';
    if (!wt) throw new Error('正文为空');
    return { text: stripWikitext(wt), title };
  };

  try {
    const { text, title } = await fetchWork();
    try { fs.writeFileSync(cacheFile, text, 'utf8'); } catch {}
    sendJSON(res, 200, { ok: true, cached: false, source: type, title, text });
  } catch (err) {
    // 联网失败 → 回退本地缓存（离线可重读）
    try {
      const cached = fs.readFileSync(cacheFile, 'utf8');
      sendJSON(res, 200, { ok: true, cached: true, source: type, title: query, text: cached, note: '联网失败，已使用本地缓存文本。' });
    } catch {
      sendJSON(res, 502, { ok: false, error: `抓取失败：${err.message}。该著作可能暂无可用的公版全文来源，或当前网络无法访问维基文库/古登堡。` });
    }
  }
}

// ============================================================
// PVE 闯关对战（知识对战）模块
// 关卡定义来自 server/data/stages.json（后端单一事实源）
// ============================================================

// 加载关卡数据（静态，模块加载时读取一次）
let STAGES = [];
try {
  STAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'stages.json'), 'utf8'));
} catch (err) {
  console.error('[!] 加载 stages.json 失败:', err.message);
}

/** 健壮性解析评判模型返回的 JSON（提取首个 { 到末尾 }） */
function parseJudgeJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  const jsonStr = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(jsonStr);
    const dims = obj?.dimensions;
    if (!dims || typeof dims !== 'object') return null;
    const clamp = (n) => {
      const v = Math.round(Number(n));
      if (!Number.isFinite(v)) return 0;
      return Math.max(0, Math.min(100, v));
    };
    return {
      dimensions: {
        relevance: clamp(dims.relevance),
        depth: clamp(dims.depth),
        logic: clamp(dims.logic),
        originality: clamp(dims.originality),
        civility: clamp(dims.civility),
      },
      comment: typeof obj.comment === 'string' ? obj.comment : '',
    };
  } catch {
    return null;
  }
}

/** 降级评分：当无 API Key 或模型返回异常时使用，基于对话轮数/字数给出保守分 */
function degradedScore(messages, comment) {
  const userMsgs = messages.filter((m) => m.role === 'user');
  const rounds = userMsgs.length;
  const totalChars = userMsgs.reduce(
    (sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0),
    0
  );
  const avgLen = rounds ? totalChars / rounds : 0;
  let score = 40;
  if (rounds >= 1) score = 45;
  if (totalChars >= 100) score += 5;
  if (avgLen >= 30) score += 5;
  score = Math.max(0, Math.min(100, score));
  return {
    dimensions: {
      relevance: score,
      depth: score,
      logic: score,
      originality: score,
      civility: score,
    },
    total: score,
    comment,
  };
}

/** 调用评分模型（stream:false，temperature=0.2），失败或异常则降级 */
async function judgeConversation(philosopherId, topic, messages) {
  const systemPrompt = JUDGE_SYSTEM_PROMPT
    .replace('{topic}', topic || '')
    .replace('{philosopherId}', philosopherId || '');

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 无 API Key：直接降级，避免前端崩溃
  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('在此填入')) {
    return degradedScore(messages, '未配置 API Key，已降级评分');
  }

  try {
    const apiUrl = OPENAI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: chatMessages,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!apiResponse.ok) {
      return degradedScore(messages, '评判模型返回异常，已降级评分');
    }

    const data = await apiResponse.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = parseJudgeJson(content);
    if (!parsed) {
      return degradedScore(messages, '评判模型返回异常，已降级评分');
    }

    // 按官方权重重算总分，确保与文档公式完全一致、稳定可复现
    const d = parsed.dimensions;
    const total = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          d.relevance * 0.25 +
            d.depth * 0.25 +
            d.logic * 0.25 +
            d.originality * 0.15 +
            d.civility * 0.10
        )
      )
    );

    return {
      dimensions: {
        relevance: d.relevance,
        depth: d.depth,
        logic: d.logic,
        originality: d.originality,
        civility: d.civility,
      },
      total,
      comment: parsed.comment || '',
    };
  } catch {
    return degradedScore(messages, '评判模型返回异常，已降级评分');
  }
}

/**
 * PVE 路由分发。命中任一端点则返回 true（请求已处理）。
 * 新增端点全部走 /api/... 并复用顶部 corsHeaders 与 JSON 错误处理。
 */
async function handleCampaignRoutes(req, res) {
  const method = req.method;
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // GET /api/stages —— 关卡列表 + 线性解锁状态
  if (method === 'GET' && p === '/api/stages') {
    const progress = loadProgress();
    const cleared = new Set(progress.clearedStages);
    const stages = STAGES.map((stage, i) => {
      let status = 'locked';
      if (cleared.has(stage.id)) status = 'cleared';
      else if (i === 0 || cleared.has(STAGES[i - 1].id)) status = 'available';
      else status = 'locked';
      const best = progress.bestScores[stage.id];
      return {
        ...stage,
        status,
        ...(best !== undefined ? { bestScore: best } : {}),
      };
    });
    sendJSON(res, 200, {
      stages,
      totalStages: STAGES.length,
      clearedCount: progress.clearedStages.length,
    });
    return true;
  }

  // GET /api/progress —— 当前进度概览
  if (method === 'GET' && p === '/api/progress') {
    const progress = loadProgress();
    sendJSON(res, 200, {
      ...progress,
      clearedCount: progress.clearedStages.length,
      totalStages: STAGES.length,
    });
    return true;
  }

  // POST /api/progress —— 提交分数、发放奖励、解锁下一关
  if (method === 'POST' && p === '/api/progress') {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJSON(res, 400, { error: '请求体解析失败' });
      return true;
    }

    const { stageId, score } = body || {};
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage) {
      sendJSON(res, 400, { error: '关卡不存在' });
      return true;
    }
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      sendJSON(res, 400, { error: '分数必须为 0-100 的数字' });
      return true;
    }

    const progress = loadProgress();
    const alreadyCleared = progress.clearedStages.includes(stageId);
    let newlyCleared = false;
    let granted = { tp: 0, in: 0 };

    // 达到阈值且未通关 → 首通发奖（幂等：重复提交不重复发奖）
    if (score >= stage.threshold && !alreadyCleared) {
      progress.clearedStages.push(stageId);
      progress.totals.tp += stage.reward.tp || 0;
      progress.totals.in += stage.reward.in || 0;
      newlyCleared = true;
      granted = { tp: stage.reward.tp || 0, in: stage.reward.in || 0 };
    }

    // 最佳成绩始终取最大值（即使本次未达阈值）
    const prevBest = progress.bestScores[stageId];
    progress.bestScores[stageId] = Math.max(
      typeof prevBest === 'number' ? prevBest : 0,
      Math.round(score)
    );

    const saved = saveProgress(progress);
    if (!saved) {
      sendJSON(res, 500, { error: '进度保存失败' });
      return true;
    }

    sendJSON(res, 200, {
      ...progress,
      granted,
      cleared: progress.clearedStages.includes(stageId),
      newlyCleared,
      clearedCount: progress.clearedStages.length,
      totalStages: STAGES.length,
    });
    return true;
  }

  // POST /api/judge —— 五维评分
  if (method === 'POST' && p === '/api/judge') {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJSON(res, 400, { error: '请求体解析失败' });
      return true;
    }

    const { philosopherId, topic, messages } = body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      sendJSON(res, 400, { error: '对话内容缺失' });
      return true;
    }

    const result = await judgeConversation(philosopherId, topic, messages);
    sendJSON(res, 200, result);
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // 健康检查
  if (req.url === '/health' && req.method === 'GET') {
    sendJSON(res, 200, {
      status: 'ok',
      model: OPENAI_MODEL,
      baseUrl: OPENAI_BASE_URL,
      hasApiKey: !!OPENAI_API_KEY,
      philosopherCount: Object.keys(philosopherPrompts).length,
    });
    return;
  }

  // 思想家最新消息：联网抓取（失败回退本地快照）
  if (req.url?.startsWith('/api/philosopher-news') && req.method === 'GET') {
    await handleNewsRoute(req, res);
    return;
  }

  // 思想家代表著作：完整原文抓取（维基文库/古登堡）+ 缓存
  if (req.url?.startsWith('/api/philosopher-work') && req.method === 'GET') {
    await handleWorkRoute(req, res);
    return;
  }

  // ===== PVE 闯关对战端点（位于 chat 端点之前，互不影响）=====
  if (await handleCampaignRoutes(req, res)) {
    return;
  }

  // 哲学家聊天 API
  // 兼容两种路径：/functions/v1/philosopher-chat 和 /api/philosopher-chat
  const isChatEndpoint =
    (req.url === '/functions/v1/philosopher-chat' || req.url === '/api/philosopher-chat') &&
    req.method === 'POST';

  if (!isChatEndpoint) {
    sendJSON(res, 404, { error: 'Not Found', url: req.url });
    return;
  }

  try {
    const body = await parseBody(req);
    const messages = body.messages || [];
    const philosopherId = body.philosopherId || 'socrates';
    const model = body.model || OPENAI_MODEL;

    // 获取系统提示词
    const systemPrompt = philosopherPrompts[philosopherId] || philosopherPrompts.socrates;

    // 构建消息数组
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // 检查 API Key
    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('在此填入')) {
      sendJSON(res, 500, {
        error: '未配置 OPENAI_API_KEY，请在项目根目录的 .env 文件中设置你的 API Key',
      });
      return;
    }

    // 调用 OpenAI 兼容 API
    const apiUrl = OPENAI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages: chatMessages, stream: true }),
    });

    // 转发上游错误
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      res.writeHead(apiResponse.status, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(errorBody);
      return;
    }

    // 转发 SSE 流
    res.writeHead(200, {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const reader = apiResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch (streamErr) {
      // 客户端断开等，忽略
    }
    res.end();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    sendJSON(res, 500, { error: errorMessage });
  }
});

server.listen(PORT, () => {
  console.log(`\n  ========================================`);
  console.log(`  |  哲学家画廊 - 本地后端服务器        |`);
  console.log(`  ========================================`);
  console.log(`  |  端口:     ${PORT}`);
  console.log(`  |  API 地址: ${OPENAI_BASE_URL}`);
  console.log(`  |  模型:     ${OPENAI_MODEL}`);
  console.log(`  |  API Key:  ${OPENAI_API_KEY && !OPENAI_API_KEY.includes('在此填入') ? OPENAI_API_KEY.slice(0, 8) + '...' : '未配置'}`);
  console.log(`  |  哲学家数: ${Object.keys(philosopherPrompts).length}`);
  console.log(`  ========================================\n`);
  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('在此填入')) {
    console.log('  [!] 未检测到 API Key！请在 .env 文件中配置 OPENAI_API_KEY\n');
  } else {
    console.log('  [OK] 后端服务已就绪，等待前端连接...\n');
  }
});
