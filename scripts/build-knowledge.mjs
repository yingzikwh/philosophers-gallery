// 从前端 TS 数据源（src/data/philosophers.ts）提取哲学家知识，
// 生成后端可读取的纯 JSON 知识库（server/data/philosopher-knowledge.json）。
// 运行：node --experimental-strip-types scripts/build-knowledge.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tsPath = join(root, 'src', 'data', 'philosophers.ts');

const mod = await import('file://' + tsPath.replace(/\\/g, '/'));
const philosophers = mod.philosophers;

// 需要抽取成知识库的知识字段（金句/核心观点/关键词/著作/影响等）
const FIELDS = [
  'id', 'name', 'nameEn', 'birthYear', 'deathYear', 'nationality', 'era',
  'school', 'themes', 'works', 'coreIdeas', 'quotes',
  'influence', 'influences', 'influenced', 'keyConcepts', 'historicalContext',
];

const out = {};
for (const p of philosophers) {
  const entry = {};
  for (const f of FIELDS) {
    if (p[f] !== undefined) entry[f] = p[f];
  }
  out[p.id] = entry;
}

const target = join(root, 'server', 'data', 'philosopher-knowledge.json');
writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
console.log(`Wrote ${Object.keys(out).length} philosophers to ${target}`);
