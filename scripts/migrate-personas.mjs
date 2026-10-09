/**
 * migrate-personas.mjs — 把_legacy 手写提示词解析成结构化风格档
 * ------------------------------------------------------------
 * 阶段 1（人格引擎）的迁移工具：server/philosopherPrompts.js 里 60 位哲学家
 * 的提示词是自由文本（不可测试、不可版本化）。本脚本按其固定行文结构解析出
 * 四个结构化字段，落到 server/data/persona-styles.json，供 personaCompiler.js
 * 与 19 字段结构化档案（philosopher-knowledge.json）一起编译出约束模板：
 *
 *   intro       首段身份自述（"你是X，……"）
 *   styleTraits 「你的语言风格 / 性格与语言风格」下的 bullet
 *   taboos      「你的禁忌」下的 bullet（部分人物才有）
 *   closing     末行口吻要求（"请用X的口吻回应……"）
 *
 * 用法：node scripts/migrate-personas.mjs
 * 幂等：重复运行直接覆盖输出文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { philosopherPrompts } from '../server/philosopherPrompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'server', 'data', 'persona-styles.json');

const HEADER = /^你的(核心思想|语言风格|性格与语言风格|禁忌)：\s*$/;
const BULLET = /^\s*-\s*(.*)$/;

function parseEntry(text) {
  const out = { intro: '', styleTraits: [], taboos: [], closing: '' };
  let section = 'intro'; // intro | core | style | taboo | between
  const introLines = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const header = line.match(HEADER);
    if (header) {
      section = header[1] === '核心思想' ? 'core'
        : header[1] === '禁忌' ? 'taboo' : 'style';
      continue;
    }
    const bullet = line.match(BULLET);
    if (bullet && (section === 'style' || section === 'taboo')) {
      (section === 'style' ? out.styleTraits : out.taboos).push(bullet[1].trim());
      continue;
    }
    if (!line.trim()) {
      if (section === 'intro') section = 'between';
      continue;
    }
    // 非 bullet 的正文行：intro 段或末行 closing
    if (section === 'intro') introLines.push(line.trim());
    else out.closing = line.trim();
  }
  out.intro = introLines.join('\n');
  return out;
}

const styles = {};
for (const [id, text] of Object.entries(philosopherPrompts)) {
  styles[id] = parseEntry(text);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(styles, null, 2) + '\n', 'utf8');

// 自检：每个条目至少要有 intro 与 closing，风格 bullet 允许为空但打印提醒
let warn = 0;
for (const [id, s] of Object.entries(styles)) {
  if (!s.intro || !s.closing) {
    console.warn(`  [warn] ${id}: intro/closing 解析为空，需人工检查`);
    warn += 1;
  }
  if (s.styleTraits.length === 0) {
    console.warn(`  [warn] ${id}: 语言风格 bullet 为空`);
    warn += 1;
  }
}
console.log(`解析条目: ${Object.keys(styles).length}`);
console.log(`警告: ${warn}`);
console.log(`输出 → ${OUT}`);
