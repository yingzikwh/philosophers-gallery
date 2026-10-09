/**
 * personaCompiler.js — 人格提示词编译器（产品愿景阶段 1）
 * ------------------------------------------------------------
 * 第一性原理：「与哲学家交互」的对象不是复活的人，而是*思维风格的可计算
 * 表示*。本模块把两份结构化资产编译成带约束的系统提示词：
 *
 *   server/data/philosopher-knowledge.json  19 字段结构化档案（思想/原话/著作…）
 *   server/data/persona-styles.json         风格档（intro/风格 bullet/禁忌/口吻收尾）
 *                                           由 scripts/migrate-personas.mjs 从
 *                                           legacy 手写提示词解析而来
 *
 * 编译产物 = 身份 + 学派时代 + 核心思想 + 关键概念 + 代表原话 + 著作
 *          + 语言风格 + 禁忌 + 时代语境(可选, 阶段 2 钩子) + 防编造约束 + 版本标记
 *
 * 可证伪性：提示词带 [persona:vN] 版本标记；server/evals/runEvals.js 用评测集
 * 对编译产物与模型回答做回归，模型或编译器改动后跑 `npm run eval`。
 *
 * 模型无关：本模块只产出文本约束，不绑定任何模型供应商。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 人格模板版本：编译器或约束条款改动时递增，评测报告据此对比回归
 * v1 = 纯文本约束模板；v2 = 引入时代语境段（阶段 2）与 era 标记 */
export const PERSONA_VERSION = 2;

const ERA_LABEL = { ancient: '古代', modern: '近代', contemporary: '当代' };

let _records = null;
let _styles = null;
let _eras = null;

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8'));
}

/** 19 字段结构化档案：id -> record */
export function loadRecords() {
  if (!_records) _records = readJSON('philosopher-knowledge.json');
  return _records;
}

/** 风格档：id -> { intro, styleTraits[], taboos[], closing } */
export function loadStyles() {
  if (!_styles) _styles = readJSON('persona-styles.json');
  return _styles;
}

/** 时代语境事件卡：eraId -> { year, label, events[] }（阶段 2） */
export function loadEraContexts() {
  if (!_eras) _eras = readJSON('era-contexts.json');
  return _eras;
}

function section(lines, title, items) {
  if (!items || items.length === 0) return;
  lines.push('', title);
  for (const it of items) lines.push(`- ${it}`);
}

/**
 * 把单份结构化档案编译为系统提示词。
 * @param {object} record  19 字段档案（philosopher-knowledge.json 条目）
 * @param {object} [opts]
 * @param {object} [opts.style]  风格档条目（persona-styles.json 条目）
 * @param {object} [opts.era]    时代语境事件卡 { year, label, events[] }（阶段 2）
 * @param {string} [opts.eraId]  事件卡 id，写入版本标记供评测归因
 * @returns {string} 系统提示词
 */
export function compilePersona(record, opts = {}) {
  const { style, era, eraId } = opts;
  const L = [];
  L.push(`你是${record.name}（${record.nameEn}，${record.birthYear}—${record.deathYear}，${record.nationality}）。`);
  if (style?.intro) L.push(style.intro);

  const school = (record.school || []).join('、');
  const themes = (record.themes || []).join('、');
  L.push('', `【学派与时代】${ERA_LABEL[record.era] || record.era} · ${school}；关注主题：${themes}`);

  section(L, '【核心思想】', record.coreIdeas);
  section(L, '【关键概念】', record.keyConcepts);
  section(L, '【代表原话】', record.quotes);
  if ((record.works || []).length) {
    L.push('', `【著作】${record.works.join('、')}`);
  }
  section(L, '【语言风格】', style?.styleTraits);
  section(L, '【禁忌】', style?.taboos);
  if (style?.closing) L.push('', style.closing);

  if (era && (era.events || []).length) {
    const label = era.label ? `（${era.label}）` : '';
    L.push('', `【时代语境】${era.year} 年${label}的世情（供你以今日之世情反观己学）：`);
    for (const e of era.events) L.push(`- ${e}`);
    L.push('以上语境是他人转述，不得假装自己亲身经历。');
  }

  L.push(
    '',
    '【约束与引用规则（防编造）】',
    '1. 只依据以上材料作答，不编造我未曾表达过的观点、事件或名言；不清楚时坦诚说明。',
    '2. 引用原话只能出自【代表原话】，不得伪造引文。',
    '3. 始终以第一人称"我"思考和回应，保持专属口吻。',
    `4. 涉及 ${record.deathYear} 年之后的具体事件与技术，除非【时代语境】提供，否则明确说明我无法知晓，不得假装经历。`,
    '',
    eraId ? `[persona:v${PERSONA_VERSION}|era:${eraId}]` : `[persona:v${PERSONA_VERSION}]`,
  );
  return L.join('\n');
}

/**
 * 按 id 编译。风格档缺失时仅用结构化档案编译（风格段留空），
 * 档案缺失时抛错，由调用方决定兜底策略。
 */
export function compileById(id, opts = {}) {
  const record = loadRecords()[id];
  if (!record) throw new Error(`personaCompiler: 未知哲学家 id "${id}"`);
  const style = loadStyles()[id];
  return compilePersona(record, { style, ...opts });
}

/**
 * 按 id + 事件卡 id 编译（阶段 2 入口）。eraId 不存在时抛错，
 * 调用方可据此回退到无时代语境编译。
 */
export function compileWithEra(id, eraId, opts = {}) {
  const era = loadEraContexts()[eraId];
  if (!era) throw new Error(`personaCompiler: 未知时代语境 id "${eraId}"`);
  return compileById(id, { ...opts, era, eraId });
}
