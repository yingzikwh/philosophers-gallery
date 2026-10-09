/**
 * demo-era-diff.mjs — 阶段 2 演示：同一哲学家、同一问题，有无时代语境的差异
 * ------------------------------------------------------------
 * 用法：
 *   node scripts/demo-era-diff.mjs [philosopherId] [eraId] [--live]
 *   默认 kant + era-2026-ai。
 *
 * 默认（编译演示，不调模型）：打印无注入人格的防编造条款 4 与注入版人格的
 * 【时代语境】段，并做归因自检（事件词仅注入版出现）——肉眼可见「时代差异
 * 来自时代层」。
 * --live：真调模型两次（需 .env 有效 OPENAI_*），并排打印两版回答。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileById, loadEraContexts } from '../server/personaCompiler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env 加载（仅 --live 需要）
try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
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
} catch { /* 无 .env 忽略 */ }

const args = process.argv.slice(2).filter(a => a !== '--live');
const LIVE = process.argv.includes('--live');
const ID = args[0] || 'kant';
const ERA_ID = args[1] || 'era-2026-ai';
const QUESTION = '当机器能替人写作与推理，人该如何运用自己的理智？';

const era = loadEraContexts()[ERA_ID];
if (!era) {
  console.error(`未知时代语境 id: ${ERA_ID}（可用: ${Object.keys(loadEraContexts()).join(', ')}）`);
  process.exit(1);
}

const plain = compileById(ID);
const withEra = compileById(ID, { era, eraId: ERA_ID });

console.log(`\n=== 演示：${ID} × ${ERA_ID}（${era.year} ${era.label}）===`);
console.log(`问题：${QUESTION}\n`);

console.log('--- 无时代注入：防编造条款 4 强制承认不知身后事 ---');
console.log(plain.split('\n').filter(l => l.startsWith('4.')).join('\n'));
console.log('标记:', plain.split('\n').find(l => l.startsWith('[persona:')));

console.log('\n--- 注入时代语境：事件卡进入人格 ---');
const eraBlock = withEra.split('【时代语境】')[1]?.split('【约束与引用规则')[0] || '(缺失)';
console.log('【时代语境】' + eraBlock.trim());
console.log('标记:', withEra.split('\n').find(l => l.startsWith('[persona:')));

console.log('\n--- 归因自检：事件词仅注入版出现 ---');
for (const e of era.events) {
  const term = e.slice(0, 12);
  const inWith = withEra.includes(term);
  const inPlain = plain.includes(term);
  console.log(`  ${inWith && !inPlain ? '✓' : '✗'} "${term}…" 注入版=${inWith} 未注入版=${inPlain}`);
}

if (!LIVE) {
  console.log('\n（编译演示结束。加 --live 可真调模型并排对比两版回答。）');
  process.exit(0);
}

const KEY = process.env.OPENAI_API_KEY || '';
const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
if (!KEY || KEY.includes('在此填入')) {
  console.log('\nlive 演示跳过：未配置有效 OPENAI_API_KEY。');
  process.exit(0);
}

async function chat(system) {
  const resp = await fetch(BASE.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: QUESTION }],
      temperature: 0.7,
    }),
  });
  if (!resp.ok) throw new Error(`模型 HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

console.log('\n--- live：两版回答并排 ---');
const aPlain = await chat(plain);
const aEra = await chat(withEra);
console.log(`[无注入]\n${aPlain}\n`);
console.log(`[注入 ${ERA_ID}]\n${aEra}\n`);
console.log(aPlain === aEra ? '✗ 两版回答相同，时代层未生效' : '✓ 两版回答不同，时代层生效');
