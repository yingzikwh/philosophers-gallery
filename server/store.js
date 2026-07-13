/**
 * PVE 闯关进度存储（零依赖，仅使用 node:fs）
 *
 * 进度以 JSON 文件形式持久化在 server/data/progress.json。
 * - loadProgress(): 读取进度；文件不存在或解析失败时返回默认结构。
 * - saveProgress(data): 原子写（先写临时文件再 rename），失败返回 false。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const PROGRESS_PATH = path.join(DATA_DIR, 'progress.json');

/** 默认进度结构（单人本地部署，无需账号） */
export function defaultProgress() {
  return {
    clearedStages: [],
    bestScores: {},
    totals: { tp: 0, in: 0, rp: 0 },
  };
}

/**
 * 读取进度。容错处理：缺失字段回落到默认值，
 * 保证返回的进度始终是合法结构。
 */
export function loadProgress() {
  try {
    const raw = fs.readFileSync(PROGRESS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const base = defaultProgress();

    const clearedStages = Array.isArray(parsed?.clearedStages)
      ? parsed.clearedStages.filter((x) => typeof x === 'string')
      : base.clearedStages;

    const bestScores =
      parsed?.bestScores && typeof parsed.bestScores === 'object'
        ? parsed.bestScores
        : base.bestScores;

    const totals = {
      tp: Number(parsed?.totals?.tp) || 0,
      in: Number(parsed?.totals?.in) || 0,
      rp: Number(parsed?.totals?.rp) || 0,
    };

    return { clearedStages, bestScores, totals };
  } catch {
    return defaultProgress();
  }
}

/**
 * 原子写：先写 .tmp 临时文件，再 rename 覆盖正式文件。
 * rename 在同一文件系统上是原子操作，避免半写文件导致进度损坏。
 * 返回是否写入成功。
 */
export function saveProgress(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${PROGRESS_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, PROGRESS_PATH);
    return true;
  } catch (err) {
    console.error('[store] 保存进度失败:', err?.message || err);
    return false;
  }
}
