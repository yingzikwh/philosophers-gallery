/**
 * 记忆层最小闭环测试（阶段 4 · 无需 API Key / 无需起服务）
 *
 * 用法：npm run test:memory  （即 node scripts/test-memory-loop.mjs）
 *
 * 通过 ZS_DATA_DIR 指向临时目录隔离运行时数据，extractMemory 注入 stub llm，
 * 直接对 memoryService 走全链路：
 *   默认门控 → 画像(L2) → 提炼情景(L3,stub) → 检索召回 → 降级 → 保留上限
 *   → 跨哲学家隔离 → 撤销/删除(L4) → 参数校验
 * 任一断言失败 exit 1，可直接进 CI。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 必须在动态 import 业务模块之前设置，使 memoryStore 落到临时目录
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-loop-'));
process.env.ZS_DATA_DIR = tmpDir;

const {
  getProfile, updateProfile, getConsent, setScope, revokeScope, deleteScope,
  extractMemory, recallMemory, MEMORY_SCOPES,
} = await import('../server/memoryService.js');
const { loadConsent, saveConsent, loadEpisodic } = await import('../server/memoryStore.js');

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.error(`  ✘ ${name}${detail ? ` —— ${detail}` : ''}`); }
}
function expectThrow(name, fn, status) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      return r.then(
        () => { fail++; console.error(`  ✘ ${name} —— 未抛错`); },
        (e) => check(name, e.status === status, `status=${e.status}, 期望 ${status}: ${e.message}`),
      );
    }
    fail++; console.error(`  ✘ ${name} —— 未抛错`);
  } catch (e) {
    check(name, e.status === status, `status=${e.status}, 期望 ${status}: ${e.message}`);
  }
  return Promise.resolve();
}

const stubLLM = (obj) => async () => JSON.stringify(obj);
const msgs = [
  { role: 'user', content: '我最近面临一个重大的人生选择，很纠结自由意志到底存不存在。' },
  { role: 'assistant', content: '你所谓的选择，究竟是欲望的必然，还是理性的自律？' },
  { role: 'user', content: '我也说不清，感觉像是被推着走。' },
];
const kantStub = stubLLM({
  summary: '用户就自由意志与人生选择向康德发问，倾向决定论',
  salient: ['用户提到近期面临重大人生选择'],
  inclinationDelta: { schools: { stoicism: 0.5 }, themes: { 自由意志: 0.6 } },
  factsToPin: ['用户是一名教师'],
});
const confuciusStub = stubLLM({
  summary: '用户与孔子探讨仁义礼智与君子之道',
  salient: [], inclinationDelta: {}, factsToPin: [],
});

console.log('== 1. 默认与授权门控（隐私优先：默认全 off）==');
const c0 = getConsent();
check('四类 scope 默认全 off', MEMORY_SCOPES.every((s) => c0.scopes[s] === 'off'), JSON.stringify(c0.scopes));
check('默认画像为空', getProfile().displayName === '' && getProfile().facts.length === 0);
const r0 = recallMemory('kant', '自由意志');
check('未授权时召回块为空（向后兼容）', r0.block === '' && r0.profile === '' && r0.episodic === '');

console.log('== 2. 画像层 L2 ==');
setScope('profile', true);
check('开启 profile scope', getConsent().scopes.profile === 'on');
const p = updateProfile({ displayName: '陈栩', preferences: { tone: '直接' }, facts: [{ text: '我是一名教师' }] });
check('画像写入称呼', p.displayName === '陈栩');
check('facts 补 id/pinnedBy/createdAt', p.facts.length === 1 && !!p.facts[0].id && p.facts[0].pinnedBy === 'user' && !!p.facts[0].createdAt);
const rp = recallMemory('kant', '').profile;
check('召回含称呼与事实', rp.includes('陈栩') && rp.includes('教师'), rp);
check('注入块含防编造免责标注', recallMemory('kant', '').block.includes('非你与此人的共同经历'));

console.log('== 3. 提炼与情景记忆 L3（stub 闭环）==');
setScope('episodic', true);
const ex1 = await extractMemory('kant', msgs, { llm: kantStub });
check('提炼成功', ex1.ok === true && !!ex1.summary);
check('factsToPin 返回但不自动写入', Array.isArray(ex1.factsToPin) && ex1.factsToPin.includes('用户是一名教师') && getProfile().facts.length === 1);
check('inclinationDelta 滑动平均(0.5→0.15)', Math.abs((getProfile().inclinations.schools.stoicism || 0) - 0.15) < 1e-9, String(getProfile().inclinations.schools.stoicism));
check('themes 倾向更新(0.6→0.18)', Math.abs((getProfile().inclinations.themes['自由意志'] || 0) - 0.18) < 1e-9);
check('情景已写入 kant 分片', loadEpisodic('kant').entries.length === 1);
await extractMemory('kant', msgs, { llm: kantStub });
check('二次提炼追加', loadEpisodic('kant').entries.length === 2);
check('召回含「上次你们谈到」', recallMemory('kant', '自由意志').episodic.includes('上次你们谈到'));

console.log('== 4. 检索召回 n-gram 确定性 ==');
check('同查询两次召回一致', recallMemory('kant', '自由意志').episodic === recallMemory('kant', '自由意志').episodic);

console.log('== 5. 降级（无 Key / 未授权）==');
const noLlm = await extractMemory('kant', msgs, {});
check('无 llm → 跳过不报错', noLlm.skipped === true);
setScope('episodic', false);
const noConsent = await extractMemory('kant', msgs, { llm: kantStub });
check('episodic 未授权 → 跳过', noConsent.skipped === true && /未授权/.test(noConsent.reason || ''));
setScope('episodic', true);

console.log('== 6. 保留上限（retention 淘汰最旧）==');
const cRet = loadConsent(); cRet.retention.episodicMaxEntries = 2; saveConsent(cRet);
await extractMemory('confucius', msgs, { llm: confuciusStub });
await extractMemory('confucius', msgs, { llm: confuciusStub });
await extractMemory('confucius', msgs, { llm: confuciusStub });
check('超上限保留 2 条', loadEpisodic('confucius').entries.length === 2);

console.log('== 7. 跨哲学家隔离（crossPhilosopher）==');
check('默认不共享：康德召回不含孔子', !recallMemory('kant', '仁义礼智').episodic.includes('孔子'));
setScope('crossPhilosopher', true);
check('开启共享：康德召回可见孔子', recallMemory('kant', '仁义礼智').episodic.includes('孔子'));
setScope('crossPhilosopher', false);

console.log('== 8. 撤销与删除 L4 治理 ==');
check('撤销前情景非空', loadEpisodic('kant').entries.length > 0);
const cRev = revokeScope('episodic');
check('撤销后 episodic=off', cRev.scopes.episodic === 'off');
check('撤销抹除全部情景内容', loadEpisodic('kant').entries.length === 0 && loadEpisodic('confucius').entries.length === 0);
check('撤销留审计与 revokedAt', cRev.audit.some((a) => a.action === 'revoke' && a.scope === 'episodic') && !!cRev.revokedAt);
check('撤销后召回为空', recallMemory('kant', '自由意志').episodic === '');
check('撤销幂等', revokeScope('episodic').scopes.episodic === 'off');
const cProfRev = revokeScope('profile');
check('撤销画像抹除称呼与事实', getProfile().displayName === '' && getProfile().facts.length === 0 && cProfRev.scopes.profile === 'off');
updateProfile({ displayName: '临时' });
deleteScope('profile');
check('删除画像清空数据', getProfile().displayName === '' && getConsent().scopes.profile === 'off');

console.log('== 9. 参数校验 ==');
await expectThrow('空 philosopherId → 400', () => extractMemory('', msgs, { llm: kantStub }), 400);
await expectThrow('空 messages → 400', () => extractMemory('kant', [], { llm: kantStub }), 400);
await expectThrow('未知 scope（setScope）→ 400', () => setScope('bogus', true), 400);
await expectThrow('未知 scope（revoke）→ 400', () => revokeScope('bogus'), 400);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
