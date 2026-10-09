/**
 * 漂流瓶存储（阶段 3 · 零依赖，仅 node:fs）
 *
 * 瓶子以 JSON 数组持久化在 DATA_DIR/bottles.json：
 * - 本地开发：server/data/bottles.json（已加入 .gitignore，用户内容不入库）
 * - 桌面打包：ZS_DATA_DIR 指向用户数据目录（与 progress.json 同规则，见 store.js）
 *
 * 写盘沿用 store.js 的原子写（.tmp + rename），避免半写损坏。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.ZS_DATA_DIR
  ? path.resolve(process.env.ZS_DATA_DIR)
  : path.join(__dirname, 'data');
const BOTTLES_PATH = path.join(DATA_DIR, 'bottles.json');

/** 读取全部瓶子；文件不存在或损坏时返回空数组（不抛错，保证服务可用）。 */
export function loadBottles() {
  try {
    const parsed = JSON.parse(fs.readFileSync(BOTTLES_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 原子写回全部瓶子；失败返回 false（调用方决定如何报错）。 */
export function saveBottles(list) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${BOTTLES_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmpPath, BOTTLES_PATH);
    return true;
  } catch (err) {
    console.error('[bottleStore] 保存失败:', err?.message || err);
    return false;
  }
}
