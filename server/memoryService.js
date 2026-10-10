/**
 * 记忆业务层（阶段 4 · memoryService）
 *
 * 对齐 bottleService.js：纯业务逻辑 + 参数校验（抛带 `status` 的 Error），
 * 路由层（index.js）只做 HTTP 转换、不写业务。
 *
 * 隐私优先（D2）：所有注入 / 检索都经 consent scope 门控，默认全 off；
 * 无 API Key 时提炼**降级跳过**（不阻断对话）；提炼用的模型调用参数注入，无 Key 也能跑闭环测试。
 */

import { randomUUID } from 'node:crypto';
import {
  loadProfile, saveProfile, loadConsent, saveConsent,
  loadEpisodic, saveEpisodic, clearEpisodic, listEpisodicIds,
} from './memoryStore.js';
import { buildMemoryBlock, recallProfile, recallEpisodic } from './memoryRecall.js';

export const MEMORY_SCOPES = ['profile', 'episodic', 'crossPhilosopher', 'lifeData'];

function fail(status, message) { const e = new Error(message); e.status = status; throw e; }

// ── 画像（L2）────────────────────────────────────────────

export function getProfile() { return loadProfile(); }

/**
 * 更新画像。displayName / preferences / inclinations 增量合并；facts 为覆盖式（用户确认后的稳定事实）。
 * factsToPin（提炼产出）**不自动写入**，须经前端确认后再调本方法（见 spec §6 / §12.3）。
 */
export function updateProfile(patch = {}) {
  const p = loadProfile();
  if (typeof patch.displayName === 'string') p.displayName = patch.displayName.slice(0, 40);
  if (patch.preferences && typeof patch.preferences === 'object') {
    p.preferences = { ...p.preferences, ...patch.preferences };
  }
  if (Array.isArray(patch.facts)) {
    p.facts = patch.facts.slice(0, 50)
      .map((f) => ({
        id: f?.id || randomUUID(),
        text: String(f?.text || '').slice(0, 200),
        pinnedBy: f?.pinnedBy || 'user',
        createdAt: f?.createdAt || new Date().toISOString(),
      }))
      .filter((f) => f.text);
  }
  if (patch.inclinations && typeof patch.inclinations === 'object') {
    p.inclinations = {
      schools: { ...(p.inclinations?.schools || {}), ...(patch.inclinations.schools || {}) },
      themes: { ...(p.inclinations?.themes || {}), ...(patch.inclinations.themes || {}) },
    };
  }
  p.updatedAt = new Date().toISOString();
  saveProfile(p);
  return p;
}

// ── 授权与治理（L4）──────────────────────────────────────

export function getConsent() { return loadConsent(); }

/** 设置某类 scope 开关（只切换是否注入，**不抹数据**；抹数据用 revokeScope / deleteScope）。幂等。 */
export function setScope(scope, on) {
  if (!MEMORY_SCOPES.includes(scope)) fail(400, `未知授权类别：${scope}`);
  const c = loadConsent();
  const val = on ? 'on' : 'off';
  if (c.scopes[scope] === val) return c;
  c.scopes[scope] = val;
  c.audit = c.audit || [];
  c.audit.push({ action: on ? 'grant' : 'revoke', scope, at: new Date().toISOString() });
  if (on && !c.grantedAt) c.grantedAt = new Date().toISOString();
  saveConsent(c);
  return c;
}

/** 一键撤销某类：置 off + **抹除内容**，仅留审计元数据（照 bottleService.revokeBottle）。幂等。 */
export function revokeScope(scope) {
  if (!MEMORY_SCOPES.includes(scope)) fail(400, `未知授权类别：${scope}`);
  const c = loadConsent();
  c.scopes[scope] = 'off';
  c.audit = c.audit || [];
  c.audit.push({ action: 'revoke', scope, at: new Date().toISOString() });
  c.revokedAt = new Date().toISOString();
  saveConsent(c);
  wipeScopeData(scope);
  return c;
}

/** 彻底删除某类数据（不可恢复），并置 off。 */
export function deleteScope(scope) {
  if (!MEMORY_SCOPES.includes(scope)) fail(400, `未知授权类别：${scope}`);
  wipeScopeData(scope);
  const c = loadConsent();
  c.scopes[scope] = 'off';
  c.audit = c.audit || [];
  c.audit.push({ action: 'delete', scope, at: new Date().toISOString() });
  saveConsent(c);
  return c;
}

function wipeScopeData(scope) {
  if (scope === 'profile') {
    const p = loadProfile();
    p.displayName = '';
    p.facts = [];
    p.inclinations = { schools: {}, themes: {} };
    p.updatedAt = new Date().toISOString();
    saveProfile(p);
  }
  if (scope === 'episodic') {
    for (const id of listEpisodicIds()) clearEpisodic(id);
  }
  // crossPhilosopher / lifeData：crossPhilosopher 无独立数据（仅共享开关）；lifeData 4.4 落地
}

// ── 记忆提炼管线（L3 写入）────────────────────────────────

const EXTRACT_SYS = '你是对话记忆提炼器。读一段用户与哲学家的对话，提炼结构化记忆。'
  + '绝不编造对话中没有的信息。只输出一个合法 JSON 对象，不要任何额外文字或 markdown 代码块。';

/** 提炼触发阈值（D3：达 N 轮自动提炼，可配）。 */
export const EXTRACT_TURN_THRESHOLD = 8;

/** 健壮解析：提取首个 `{` 到末尾 `}`（照 index.js parseJudgeJson）。 */
function parseExtractJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    return obj && typeof obj === 'object' ? obj : null;
  } catch { return null; }
}

/**
 * 提炼一段对话为记忆并写入。
 * @param {string} philosopherId
 * @param {Array<{role:string,content:string}>} messages
 * @param {{ llm?: (messages:Array, options:Object)=>Promise<string> }} deps llm 由路由层注入（无 Key 不传 → 降级跳过）
 * @returns {Promise<{ok?:boolean, skipped?:boolean, reason?:string, summary?:string, salient?:string[], factsToPin?:string[]}>}
 */
export async function extractMemory(philosopherId, messages, { llm } = {}) {
  if (!philosopherId) fail(400, '缺少 philosopherId');
  if (!Array.isArray(messages) || messages.length === 0) fail(400, 'messages 不能为空');

  // 未授权 episodic → 不写任何记忆（隐私优先）
  const consent = loadConsent();
  if (consent.scopes?.episodic !== 'on') return { skipped: true, reason: 'episodic 未授权，跳过提炼' };
  // 无 Key / 无 llm → 降级跳过（对齐 judgeConversation 的 degraded 思路，不阻断对话）
  if (typeof llm !== 'function') return { skipped: true, reason: '未配置模型（缺少 API Key），跳过提炼' };

  let parsed = null;
  try {
    const transcript = messages.slice(-16)
      .map((m) => `${m.role === 'user' ? '用户' : (m.role === 'assistant' ? '哲学家' : '系统')}：${String(m.content || '').slice(0, 500)}`)
      .join('\n');
    const raw = await llm([
      { role: 'system', content: EXTRACT_SYS },
      {
        role: 'user',
        content: `对话记录：\n${transcript}\n\n只输出如下 JSON：\n{\n`
          + '  "summary": "一句话摘要（谈了什么、用户的倾向，50字内）",\n'
          + '  "salient": ["关键时刻短句1", "关键时刻短句2"],\n'
          + '  "inclinationDelta": { "schools": { "流派名": 0.1 }, "themes": { "主题名": 0.1 } },\n'
          + '  "factsToPin": ["值得长期记住的稳定事实（职业/明确立场等），没有则空数组"]\n}',
      },
    ], { temperature: 0.2, maxTokens: 600 });
    parsed = parseExtractJson(raw);
  } catch (e) {
    return { skipped: true, reason: `提炼异常，降级跳过：${e?.message || e}` };
  }
  if (!parsed) return { skipped: true, reason: '提炼结果无法解析，降级跳过' };

  const summary = String(parsed.summary || '').slice(0, 300);
  const salient = Array.isArray(parsed.salient)
    ? parsed.salient.slice(0, 5).map((s) => String(s).slice(0, 200)).filter(Boolean)
    : [];

  // 写入情景记忆（受 retention 上限，超限淘汰最旧）
  if (summary) {
    const epi = loadEpisodic(philosopherId);
    epi.entries.push({
      id: randomUUID(), summary, salient, turns: messages.length,
      createdAt: new Date().toISOString(), vector: null,
    });
    const max = consent.retention?.episodicMaxEntries || 50;
    if (epi.entries.length > max) epi.entries = epi.entries.slice(-max);
    saveEpisodic(philosopherId, epi);
  }

  // inclinationDelta → 滑动平均更新画像倾向（0.7 旧 + 0.3 新，钳制 0-1）
  if (parsed.inclinationDelta && typeof parsed.inclinationDelta === 'object') {
    const p = loadProfile();
    p.inclinations = p.inclinations || { schools: {}, themes: {} };
    for (const dim of ['schools', 'themes']) {
      const delta = parsed.inclinationDelta[dim];
      if (!delta || typeof delta !== 'object') continue;
      for (const [k, v] of Object.entries(delta)) {
        const cur = Number(p.inclinations[dim]?.[k]) || 0;
        const add = Number(v) || 0;
        p.inclinations[dim] = { ...(p.inclinations[dim] || {}), [k]: Math.max(0, Math.min(1, cur * 0.7 + add * 0.3)) };
      }
    }
    p.updatedAt = new Date().toISOString();
    saveProfile(p);
  }

  // factsToPin 不自动写入，返回前端待用户确认
  const factsToPin = Array.isArray(parsed.factsToPin)
    ? parsed.factsToPin.map((f) => String(f).slice(0, 200)).filter(Boolean)
    : [];

  return { ok: true, summary, salient, factsToPin };
}

// ── 召回（对用户透明可见：返回将被注入的记忆）──────────────

export function recallMemory(philosopherId, query) {
  return {
    profile: recallProfile(),
    episodic: recallEpisodic(philosopherId, query || ''),
    block: buildMemoryBlock(philosopherId, query || ''),
  };
}

export { buildMemoryBlock };
