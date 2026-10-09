/**
 * 漂流瓶业务（阶段 3 · 最小闭环）
 *
 * 闭环：扔瓶（含授权范围）→ 主题匹配 → 哲学家拾瓶而答 → 撤销授权 / 彻底删除。
 *
 * 授权三件套从第一天做：
 * - 用途范围 scope：'private'（仅自己可见）| 'reply-only'（仅供匹配的哲学家回应，默认）
 *   | 'public-anon'（匿名进入公共瓶墙，可被拾取展示）
 * - 一键撤销 revoke：正文与回信立即抹除，仅留审计元数据（id/时间/范围），
 *   退出一切匹配与展示；
 * - 彻底删除 delete：整条记录从存储移除。
 *
 * 匹配为零依赖的「主题词重叠」打分（themes/keyConcepts/school 子串命中加权），
 * 确定性、可测试；瓶子预留 vector 字段，接入 embedding 后可平滑升级为向量检索。
 *
 * generateReply 通过参数注入：路由层传入真实模型调用（llm.chatOnce），
 * 闭环测试传入 stub，使全链路无需 API Key 即可验证。
 */

import { randomUUID } from 'node:crypto';
import { loadBottles, saveBottles } from './bottleStore.js';
import { loadRecords } from './personaCompiler.js';

export const BOTTLE_SCOPES = ['private', 'reply-only', 'public-anon'];
const TEXT_MAX = 2000;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** 主题词重叠打分：档案的 themes/keyConcepts/school 作为词表，命中即加权。 */
function scoreRecord(record, text) {
  let score = 0;
  const terms = [
    ...(record.themes || []).map((t) => [t, 3]),
    ...(record.keyConcepts || []).map((t) => [t, 3]),
    ...(record.school || []).map((t) => [t, 2]),
  ];
  for (const [term, weight] of terms) {
    if (typeof term === 'string' && term.length >= 2 && text.includes(term)) score += weight;
  }
  return score;
}

/**
 * 为一段文字匹配最相关的哲学家（确定性：同分按 id 排序）。
 * 档案库 loadRecords() 为 id → record 的映射，故取 Object.values 遍历。
 * @returns {{id:string,name:string,score:number}[]} 至多 k 个，得分 > 0
 */
export function matchPhilosophers(text, k = 3) {
  return Object.values(loadRecords())
    .map((r) => ({ id: r.id, name: r.name, score: scoreRecord(r, text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, k);
}

/** 扔瓶：校验正文与授权范围，落库并附带匹配到的候选哲学家。 */
export function throwBottle({ text, authorLabel = '', scope = 'reply-only' } = {}) {
  const body = String(text || '').trim();
  if (!body) throw httpError(400, '漂流瓶正文不能为空');
  if (body.length > TEXT_MAX) throw httpError(400, `正文最长 ${TEXT_MAX} 字`);
  if (!BOTTLE_SCOPES.includes(scope)) throw httpError(400, `未知授权范围: ${scope}`);

  const now = new Date().toISOString();
  const bottle = {
    id: randomUUID(),
    text: body,
    authorLabel: String(authorLabel || '').trim().slice(0, 40) || '匿名',
    scope,
    consent: { scope, version: 1, grantedAt: now, revokedAt: null },
    createdAt: now,
    status: 'floating', // floating | replied | revoked
    matched: matchPhilosophers(body),
    replies: [],
    vector: null, // 预留：接入 embedding 后填充，用于向量检索
  };

  const list = loadBottles();
  list.push(bottle);
  if (!saveBottles(list)) throw httpError(500, '漂流瓶写入失败');
  return bottle;
}

export function getBottle(id) {
  return loadBottles().find((b) => b.id === id) || null;
}

/** 我的瓶子（本地单人部署，无账号体系；多用户隔离属阶段 4+ 议题）。 */
export function listBottles() {
  return loadBottles().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/** 公共瓶墙：仅 scope='public-anon' 且未撤销的瓶子，隐去授权细节。 */
export function getPublicWall() {
  return loadBottles()
    .filter((b) => b.scope === 'public-anon' && b.status !== 'revoked')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map((b) => ({
      id: b.id,
      authorLabel: b.authorLabel,
      text: b.text,
      createdAt: b.createdAt,
      status: b.status,
      replies: (b.replies || []).map((r) => ({
        philosopherId: r.philosopherId,
        philosopherName: r.philosopherName,
        text: r.text,
        createdAt: r.createdAt,
      })),
    }));
}

/**
 * 哲学家拾瓶而答。
 * @param {string} bottleId
 * @param {object} opts
 * @param {string} [opts.philosopherId] 缺省用扔瓶时匹配到的第一位
 * @param {string} [opts.eraId] 可选时代语境（阶段 2 事件卡）
 * @param {(p:{philosopherId:string,eraId:string,bottleText:string})=>Promise<string>} opts.generateReply
 *        生成回信的函数（路由层注入真实模型调用；测试注入 stub）
 */
export async function replyToBottle(bottleId, opts = {}) {
  const { philosopherId = '', eraId = '', generateReply } = opts;
  if (typeof generateReply !== 'function') throw httpError(500, '缺少 generateReply 实现');

  const list = loadBottles();
  const bottle = list.find((b) => b.id === bottleId);
  if (!bottle) throw httpError(404, '漂流瓶不存在');
  if (bottle.status === 'revoked') throw httpError(409, '授权已撤销，瓶子不可再被使用');
  if (!bottle.text) throw httpError(409, '瓶子正文为空，无法回应');

  const pid = philosopherId || bottle.matched?.[0]?.id;
  if (!pid) throw httpError(400, '未指定哲学家，且该瓶未匹配到候选');

  const record = loadRecords()[pid];
  if (!record) throw httpError(404, `未知哲学家: ${pid}`);

  const text = await generateReply({ philosopherId: pid, eraId, bottleText: bottle.text });

  bottle.replies = bottle.replies || [];
  bottle.replies.push({
    id: randomUUID(),
    philosopherId: pid,
    philosopherName: record.name,
    eraId: eraId || null,
    text,
    createdAt: new Date().toISOString(),
  });
  bottle.status = 'replied';
  if (!saveBottles(list)) throw httpError(500, '回信写入失败');
  return bottle;
}

/**
 * 一键撤销授权：停止一切下游用途。
 * 正文/回信/匹配/向量立即抹除，仅保留审计元数据；撤销后不可恢复（需重新扔瓶）。
 */
export function revokeBottle(id) {
  const list = loadBottles();
  const bottle = list.find((b) => b.id === id);
  if (!bottle) throw httpError(404, '漂流瓶不存在');
  if (bottle.status === 'revoked') return bottle; // 幂等

  bottle.text = '';
  bottle.authorLabel = '匿名';
  bottle.matched = [];
  bottle.replies = [];
  bottle.vector = null;
  bottle.status = 'revoked';
  bottle.consent = { ...bottle.consent, revokedAt: new Date().toISOString() };
  if (!saveBottles(list)) throw httpError(500, '撤销写入失败');
  return bottle;
}

/** 彻底删除：整条记录移出存储（不可恢复）。 */
export function deleteBottle(id) {
  const list = loadBottles();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) throw httpError(404, '漂流瓶不存在');
  list.splice(idx, 1);
  if (!saveBottles(list)) throw httpError(500, '删除写入失败');
  return { id, deleted: true };
}
