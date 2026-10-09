/**
 * runEvals.js — 人格引擎评测骨架（产品愿景阶段 1）
 * ------------------------------------------------------------
 * 让「像康德」可证伪：对 server/evals/cases.json 里的用例做回归。
 *
 * 两种模式：
 *   check（默认，`npm run eval`）
 *     不调模型、零成本、可进 CI。校验：
 *       1. 用例的哲学家档案存在且人格可编译；
 *       2. mustContain / mustContainAny 的锚点确实存在于编译产物中
 *          （即「评测要考的 grounded 内容，人格模板真的供给给了模型」）；
 *       3. mustNot 的破格串不出现在人格模板中。
 *   live（`npm run eval:live`，需 .env 配好 OPENAI_*）
 *     真调模型：system=编译产物、user=用例问题，对回答做
 *     mustContain 全含 / mustContainAny 含一 / mustNot 全不含 的规则判定。
 *     带 eraId 的用例额外调一次无注入对照：事件词只许出现在注入版回答里，
 *     且两版回答不得相同（时代层生效的可证伪判据）。问题文本自带的
 *     事件词视为泄露（两版都会复读），不参与 live 归因判定。
 *     报告落盘 server/evals/last-report.json。
 *     未配置 Key 时打印跳过并 exit 0（不阻塞无 Key 环境）。
 *
 * 退出码：0=通过（或 live 跳过）；1=有用例失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileById, loadRecords, loadEraContexts, PERSONA_VERSION } from '../personaCompiler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const REPORT = path.join(__dirname, 'last-report.json');

// .env 加载（与 server/index.js 同口径，仅 live 模式需要）
try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
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
} catch {
  // 无 .env 忽略
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function checkCase(c, persona) {
  const failures = [];
  for (const term of c.mustContain || []) {
    if (!persona.includes(term)) failures.push(`人格缺锚点(mustContain): ${term}`);
  }
  if ((c.mustContainAny || []).length) {
    if (!c.mustContainAny.some(t => persona.includes(t))) {
      failures.push(`人格缺锚点(mustContainAny): ${c.mustContainAny.join('/')}`);
    }
  }
  for (const term of c.mustNot || []) {
    if (persona.includes(term)) failures.push(`人格含破格串(mustNot): ${term}`);
  }
  return failures;
}

/**
 * 时代归因校验（阶段 2）：事件词必须「仅注入后出现」——
 * 注入版含 mustContainEra、未注入版不含；否则时代差异不能归因于时代层。
 * check 模式传两份人格；live 模式传两份回答并附 question：问题文本
 * 自带的事件词两版都会复读（live 实测），属题面泄露，跳过其归因判定。
 */
function eraAttribution(c, withEra, plain, question = '') {
  const failures = [];
  for (const term of c.mustContainEra || []) {
    if (!withEra.includes(term)) failures.push(`注入版缺事件词: ${term}`);
    if (question && question.includes(term)) continue; // 题面泄露，不作归因证据
    if (plain.includes(term)) failures.push(`未注入版含事件词, 归因失效: ${term}`);
  }
  return failures;
}

function checkResponse(c, answer) {
  const failures = [];
  for (const term of c.mustContain || []) {
    if (!answer.includes(term)) failures.push(`回答缺(mustContain): ${term}`);
  }
  if ((c.mustContainAny || []).length && !c.mustContainAny.some(t => answer.includes(t))) {
    failures.push(`回答缺任一(mustContainAny): ${c.mustContainAny.join('/')}`);
  }
  for (const term of c.mustNot || []) {
    if (answer.includes(term)) failures.push(`回答含(mustNot): ${term}`);
  }
  return failures;
}

async function chat(system, user) {
  const apiUrl = OPENAI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    }),
  });
  if (!resp.ok) throw new Error(`模型 HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

function print(results, mode) {
  console.log(`\n=== 人格评测 [${mode}] persona:v${PERSONA_VERSION} ===`);
  for (const r of results) {
    console.log(`${r.pass ? '  ✓' : '  ✗'} ${r.id} (${r.philosopherId})${r.failures.length ? ' → ' + r.failures.join('; ') : ''}`);
  }
  const failed = results.filter(r => !r.pass).length;
  console.log(`通过 ${results.length - failed}/${results.length}${failed ? `，失败 ${failed}` : ''}`);
  return failed;
}

async function main() {
  const live = process.argv.includes('--live');
  const records = loadRecords();
  const contexts = loadEraContexts();
  const results = [];

  if (!live) {
    for (const c of CASES) {
      let failures = [];
      try {
        if (!records[c.philosopherId]) throw new Error(`档案缺失: ${c.philosopherId}`);
        const plain = compileById(c.philosopherId);
        if (c.eraId) {
          const era = contexts[c.eraId];
          if (!era) throw new Error(`时代卡缺失: ${c.eraId}`);
          const withEra = compileById(c.philosopherId, { era, eraId: c.eraId });
          failures = checkCase(c, withEra);
          failures.push(...eraAttribution(c, withEra, plain));
        } else {
          failures = checkCase(c, plain);
        }
      } catch (e) {
        failures = [String(e.message || e)];
      }
      results.push({ id: c.id, philosopherId: c.philosopherId, eraId: c.eraId || null, pass: failures.length === 0, failures });
    }
    const failed = print(results, 'check');
    fs.writeFileSync(REPORT, JSON.stringify({ mode: 'check', personaVersion: PERSONA_VERSION, results }, null, 2) + '\n', 'utf8');
    return failed ? 1 : 0;
  }

  // live 模式
  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('在此填入')) {
    console.log('live 评测跳过：未配置 OPENAI_API_KEY（.env）。check 模式不受影响。');
    return 0;
  }
  for (const c of CASES) {
    let failures = [];
    let answer = '';
    let plainAnswer = '';
    try {
      const plain = compileById(c.philosopherId);
      if (c.eraId) {
        const era = contexts[c.eraId];
        if (!era) throw new Error(`时代卡缺失: ${c.eraId}`);
        const withEra = compileById(c.philosopherId, { era, eraId: c.eraId });
        answer = await chat(withEra, c.question);
        plainAnswer = await chat(plain, c.question);
        failures = checkResponse(c, answer);
        failures.push(...eraAttribution(c, answer, plainAnswer, c.question));
        if (answer === plainAnswer) failures.push('注入/未注入时代语境回答相同, 时代层未生效');
      } else {
        answer = await chat(plain, c.question);
        failures = checkResponse(c, answer);
      }
    } catch (e) {
      failures = [String(e.message || e)];
    }
    results.push({
      id: c.id,
      philosopherId: c.philosopherId,
      eraId: c.eraId || null,
      pass: failures.length === 0,
      failures,
      answerPreview: answer.slice(0, 120),
      plainAnswerPreview: plainAnswer ? plainAnswer.slice(0, 120) : undefined,
    });
  }
  const failed = print(results, `live/${OPENAI_MODEL}`);
  fs.writeFileSync(REPORT, JSON.stringify({ mode: 'live', model: OPENAI_MODEL, personaVersion: PERSONA_VERSION, results }, null, 2) + '\n', 'utf8');
  return failed ? 1 : 0;
}

main().then(code => process.exit(code)).catch(e => {
  console.error(e);
  process.exit(1);
});
