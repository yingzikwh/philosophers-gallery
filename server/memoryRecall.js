/**
 * 记忆检索层（阶段 4 · memoryRecall）
 *
 * 与 knowledgeRetriever.js **同构**：中文 2-gram 重叠打分 + 长度预算 + 稳定排序，零依赖。
 * 铁律：只返回「已授权（consent scope = on）」的内容；未授权 / 无记忆 → 空串（向后兼容）。
 *
 * 升级路线：给 episodic entry 填 vector 后，可在此改用 embedding 相似度，函数签名不变
 * （照 knowledgeRetriever「保持签名即可替换」的既定做法）。
 */

import { loadProfile, loadConsent, loadEpisodic, listEpisodicIds } from './memoryStore.js';

/** 提取中文字符的 2-gram 集合（同 knowledgeRetriever）。 */
function bigrams(text) {
  const chars = String(text || '').replace(/\s+/g, '').match(/[\u4e00-\u9fa5]/g) || [];
  const grams = new Set();
  for (let i = 0; i < chars.length - 1; i += 1) grams.add(chars[i] + chars[i + 1]);
  return grams;
}

/** 查询 2-gram 在 text 中出现的比例，0-1（同 knowledgeRetriever.overlapScore）。 */
function overlapScore(queryGrams, text) {
  if (queryGrams.size === 0) return 0;
  const textStr = String(text || '');
  let hit = 0;
  for (const g of queryGrams) if (textStr.includes(g)) hit += 1;
  return hit / queryGrams.size;
}

/** 画像 → 注入文本（仅 scopes.profile === 'on'；否则空串）。 */
export function recallProfile() {
  const consent = loadConsent();
  if (consent.scopes?.profile !== 'on') return '';
  const p = loadProfile();
  const lines = [];
  if (p.displayName) lines.push(`· 称呼：${p.displayName}`);
  const top = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const schools = top(p.inclinations?.schools);
  const themes = top(p.inclinations?.themes);
  if (schools.length || themes.length) lines.push(`· 思想倾向：${[...schools, ...themes].join('、')}`);
  const facts = (p.facts || []).slice(0, 5).map((f) => f?.text).filter(Boolean);
  if (facts.length) lines.push(`· 已知事实：${facts.join('；')}`);
  if (p.preferences?.tone) lines.push(`· 交互偏好：语气偏${p.preferences.tone}`);
  return lines.join('\n');
}

/**
 * 情景记忆 → top-k 摘要文本（仅 scopes.episodic === 'on'）。
 * crossPhilosopher === 'off' 时只取该哲学家自己的分片（康德知道的不自动告诉孔子）。
 */
export function recallEpisodic(philosopherId, query, { budget = 800 } = {}) {
  const consent = loadConsent();
  if (consent.scopes?.episodic !== 'on') return '';
  const ids = consent.scopes?.crossPhilosopher === 'on' ? listEpisodicIds() : [philosopherId];
  const q = bigrams(query || '');
  const scored = [];
  for (const id of ids) {
    if (!id) continue;
    const { entries } = loadEpisodic(id);
    for (const e of entries) {
      if (!e?.summary) continue;
      const haystack = `${e.summary} ${(e.salient || []).join(' ')}`;
      scored.push({ score: overlapScore(q, haystack), summary: e.summary, createdAt: e.createdAt });
    }
  }
  scored.sort((a, b) => b.score - a.score || String(b.createdAt).localeCompare(String(a.createdAt)));
  const picked = [];
  let used = 0;
  for (const s of scored) {
    const line = `· 上次你们谈到：${s.summary}`;
    if (used + line.length > budget) break;
    picked.push(line);
    used += line.length;
    if (picked.length >= 3) break;
  }
  return picked.join('\n');
}

/** 人生数据（4.4 才落地；本期 scope 默认 off，恒返回空）。 */
export function recallLifeData() { return ''; }

/**
 * 组装完整记忆注入块（含免责标注，防诱发编造，见 spec §10）。
 * 无任何授权内容 → 返回空串，buildSystemPrompt 拼接时零影响（向后兼容）。
 */
export function buildMemoryBlock(philosopherId, query) {
  const prof = recallProfile();
  const epi = recallEpisodic(philosopherId, query);
  const life = recallLifeData(query);
  const parts = [prof, epi, life].filter(Boolean);
  if (!parts.length) return '';
  return '【关于对话者的已知信息（供你自然称呼、延续话题；这是他人告知你的资料，非你与此人的共同经历，不得假装你们过去见过面或共历某事）】\n'
    + parts.join('\n');
}
