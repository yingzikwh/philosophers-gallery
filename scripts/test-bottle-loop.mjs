/**
 * 漂流瓶最小闭环测试（阶段 3 · 无需 API Key / 无需起服务）
 *
 * 用法：npm run test:bottle  （即 node scripts/test-bottle-loop.mjs）
 *
 * 通过 ZS_DATA_DIR 指向临时目录隔离运行时数据，generateReply 注入 stub，
 * 直接对 bottleService 走全链路：
 *   扔瓶（授权范围+匹配）→ 瓶墙可见性 → 拾瓶而答 → 撤销授权 → 彻底删除 → 参数校验
 * 任一断言失败 exit 1，可直接进 CI。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 必须在动态 import 业务模块之前设置，使 bottleStore 落到临时目录
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bottle-loop-'));
process.env.ZS_DATA_DIR = tmpDir;

const {
  throwBottle,
  listBottles,
  getPublicWall,
  replyToBottle,
  revokeBottle,
  deleteBottle,
  getBottle,
  matchPhilosophers,
} = await import('../server/bottleService.js');

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

const stubReply = async ({ philosopherId, bottleText }) =>
  `[stub回信 by ${philosopherId}] 已收到「${bottleText.slice(0, 10)}…」`;

console.log('== 1. 扔瓶与匹配 ==');
// 塞内卡档案 themes 含「死亡」「时间」，用于锚定匹配
const b1 = throwBottle({
  text: '我最近总在焦虑时间不够用，也开始害怕死亡，该怎么安顿内心？',
  authorLabel: '海边的人',
  scope: 'reply-only',
});
check('扔瓶成功且有 id', !!b1.id);
check('授权三件套: scope/grantedAt/version', b1.consent?.scope === 'reply-only' && !!b1.consent?.grantedAt && b1.consent?.version === 1);
check('匹配命中塞内卡（死亡/时间主题）', b1.matched.some((m) => m.id === 'seneca'), JSON.stringify(b1.matched));
check('匹配确定性（同文本两次结果一致）',
  JSON.stringify(matchPhilosophers(b1.text)) === JSON.stringify(matchPhilosophers(b1.text)));

const b2 = throwBottle({ text: ' Sartre 说存在先于本质，那我的自由意味着什么？', scope: 'public-anon' });
const b3 = throwBottle({ text: '只给自己看的念头：自由的重量让我眩晕。', scope: 'private' });
check('public-anon 瓶进瓶墙', getPublicWall().some((w) => w.id === b2.id));
check('reply-only 瓶不进瓶墙', !getPublicWall().some((w) => w.id === b1.id));
check('private 瓶不进瓶墙', !getPublicWall().some((w) => w.id === b3.id));
check('瓶墙隐去授权细节', getPublicWall().every((w) => w.consent === undefined));

console.log('== 2. 拾瓶而答（stub）==');
const answered = await replyToBottle(b1.id, { generateReply: stubReply });
check('默认由匹配第一位哲学家应答', answered.replies.length === 1 && answered.replies[0].philosopherId === b1.matched[0].id);
check('回信带哲学家姓名与时间戳', !!answered.replies[0].philosopherName && !!answered.replies[0].createdAt);
check('应答后 status=replied', answered.status === 'replied');
const answered2 = await replyToBottle(b1.id, { philosopherId: 'sartre', generateReply: stubReply });
check('可指定其他哲学家追加回信', answered2.replies.length === 2 && answered2.replies[1].philosopherId === 'sartre');
await expectThrow('未知哲学家 → 404', () => replyToBottle(b1.id, { philosopherId: 'no-such', generateReply: stubReply }), 404);
await expectThrow('不存在的瓶子 → 404', () => replyToBottle('no-such-id', { generateReply: stubReply }), 404);

console.log('== 3. 一键撤销授权 ==');
const revoked = revokeBottle(b2.id);
check('撤销后 status=revoked', revoked.status === 'revoked');
check('撤销抹除正文', revoked.text === '');
check('撤销记录 revokedAt', !!revoked.consent?.revokedAt);
check('撤销后退出瓶墙', !getPublicWall().some((w) => w.id === b2.id));
check('撤销幂等', revokeBottle(b2.id).status === 'revoked');
await expectThrow('撤销后禁止再应答 → 409', () => replyToBottle(b2.id, { generateReply: stubReply }), 409);

const revoked1 = revokeBottle(b1.id);
check('撤销抹除回信与匹配', revoked1.replies.length === 0 && revoked1.matched.length === 0);
check('撤销后仍留审计元数据（id/createdAt）', !!getBottle(b1.id) && !!getBottle(b1.id).createdAt);

console.log('== 4. 彻底删除 ==');
const before = listBottles().length;
deleteBottle(b3.id);
check('删除后记录不存在', getBottle(b3.id) === null);
check('列表数量 -1', listBottles().length === before - 1);
await expectThrow('删除不存在的瓶子 → 404', () => deleteBottle(b3.id), 404);

console.log('== 5. 参数校验 ==');
await expectThrow('空正文 → 400', () => throwBottle({ text: '   ' }), 400);
await expectThrow('非法授权范围 → 400', () => throwBottle({ text: '测试', scope: 'public' }), 400);
await expectThrow('超长正文 → 400', () => throwBottle({ text: '字'.repeat(2001) }), 400);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
