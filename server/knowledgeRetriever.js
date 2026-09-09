// 哲学家知识检索模块（轻量 RAG 检索层）
// - 数据源：server/data/philosopher-knowledge.json（由 scripts/build-knowledge.mjs 从前端 TS 抽取）
// - 职责：给定哲学家与用户提问，返回该哲学家最相关的真实知识文本块，供注入 system prompt
// - 约束：纯 JSON 文件、零数据库依赖
// - 扩展位：retrieveKnowledge 当前用中文 n-gram 打分；后续可替换为 embedding 语义检索（保持签名不变即可）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, 'data', 'philosopher-knowledge.json');

const LABELS = {
  quotes: '金句',
  coreIdeas: '核心观点',
  keyConcepts: '关键概念',
  works: '代表著作',
  influence: '历史影响',
  historicalContext: '时代背景',
  themes: '主题',
  school: '学派',
};

// 字段抽取优先级（检索无命中时按此顺序回退取精华）
const PRIORITY = [
  'quotes', 'coreIdeas', 'keyConcepts', 'works', 'influence',
  'historicalContext', 'themes', 'school',
];

let CACHE = null;
function loadKnowledge() {
  if (CACHE) return CACHE;
  try {
    CACHE = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
  } catch (e) {
    console.error('[knowledge] 加载失败:', e.message);
    CACHE = {};
  }
  return CACHE;
}

/** 中文按字符切 n-gram（无分词库时最稳的子串匹配方案） */
function ngrams(text, n = 2) {
  const clean = String(text || '').replace(/\s+/g, '');
  const grams = [];
  for (let i = 0; i + n <= clean.length; i++) grams.push(clean.slice(i, i + n));
  return grams;
}

/**
 * 检索该哲学家与用户提问最相关的知识片段，拼接为文本块。
 * @param {string} philosopherId
 * @param {string} userQuery 用户最近一条消息（用于打分排序；为空则按优先级取精华）
 * @param {{budget?: number}} opts budget: 注入文本总长度预算（字符数）
 * @returns {string} 形如 "· 金句：xxx\n· 核心观点：yyy" 的文本块
 */
export function retrieveKnowledge(philosopherId, userQuery = '', opts = {}) {
  const kb = loadKnowledge();
  const entry = kb[philosopherId];
  if (!entry) return '';
  const budget = opts.budget ?? 1500;

  // 收集带标签片段
  const fragments = [];
  for (const key of PRIORITY) {
    const val = entry[key];
    if (!val) continue;
    const label = LABELS[key] || key;
    if (Array.isArray(val)) {
      for (const item of val) fragments.push({ label, text: String(item) });
    } else if (typeof val === 'string') {
      fragments.push({ label, text: val });
    }
  }
  if (!fragments.length) return '';

  // 检索打分（中文 n-gram 重叠数）
  const query = String(userQuery || '').replace(/\s+/g, '');
  if (query) {
    const qgrams = new Set(ngrams(query, 2));
    for (const f of fragments) {
      const fgrams = ngrams(f.text, 2);
      let score = 0;
      for (const g of fgrams) if (qgrams.has(g)) score++;
      f.score = score;
    }
    // 命中数降序；同分保持原优先级顺序
    fragments.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else {
    fragments.forEach((f, i) => (f.score = PRIORITY.length - i * 0.01));
  }

  // 拼接（受长度预算约束；至少保留一条）
  let used = 0;
  const picked = [];
  for (const f of fragments) {
    const line = `· ${f.label}：${f.text}`;
    if (used + line.length + 1 > budget && picked.length > 0) break;
    picked.push(line);
    used += line.length + 1;
  }
  if (!picked.length) picked.push(`· ${fragments[0].label}：${fragments[0].text}`);
  return picked.join('\n');
}
