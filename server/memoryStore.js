/**
 * 记忆存储层（阶段 4 · memoryStore）
 *
 * 对齐 bottleStore.js / store.js 的存储范式：全部存 DATA_DIR/memory/ 下的 JSON 文件，
 * 只用 node:fs + 原子写（.tmp → rename），零数据库、零依赖。
 * 本模块是**纯存储原语**，不含业务规则（画像合并、提炼、授权判定在 memoryService.js）。
 *
 * 隐私铁律：用户记忆与人生数据一律 gitignore（见 .gitignore），绝不入库、不上云。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ZS_DATA_DIR
  ? path.resolve(process.env.ZS_DATA_DIR)
  : path.join(__dirname, 'data');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const EPISODIC_DIR = path.join(MEMORY_DIR, 'episodic');
const PROFILE_FILE = path.join(MEMORY_DIR, 'profile.json');
const CONSENT_FILE = path.join(MEMORY_DIR, 'consent.json');

function ensureDirs() {
  try { fs.mkdirSync(EPISODIC_DIR, { recursive: true }); } catch { /* ignore */ }
}
ensureDirs();

/** Windows 下 rename 覆盖已存在文件时，偶发被杀软/索引器短暂占用 → EPERM/EACCES/EBUSY；同步退避重试。 */
function renameWithRetry(tmp, file, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      const transient = e && ['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'].includes(e.code);
      if (!transient || i === attempts - 1) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 * (i + 1));
    }
  }
}

/** 原子写：先写 .tmp 再 rename（带 Windows 瞬时占用重试），避免并发/崩溃留下半截文件（照 bottleStore.saveBottles）。 */
function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameWithRetry(tmp, file);
    return true;
  } catch (e) {
    console.error('[memoryStore] 写入失败:', file, e?.message || e);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    return false;
  }
}

/** 容错读：文件不存在/损坏 → 回退 fallback，绝不抛错。 */
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const txt = fs.readFileSync(file, 'utf-8');
    if (!txt.trim()) return fallback;
    const parsed = JSON.parse(txt);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (e) {
    console.error('[memoryStore] 解析失败，回退默认:', file, e?.message || e);
    return fallback;
  }
}

// ---- 默认结构 ----
export function defaultProfile() {
  return {
    version: 1,
    displayName: '',
    inclinations: { schools: {}, themes: {} },
    facts: [],
    preferences: {},
    updatedAt: new Date().toISOString(),
  };
}

export function defaultConsent() {
  return {
    version: 1,
    // D2：四类 scope 全部默认 off，逐项 opt-in
    scopes: { profile: 'off', episodic: 'off', crossPhilosopher: 'off', lifeData: 'off' },
    retention: { episodicMaxEntries: 50, days: null },
    audit: [],
    grantedAt: null,
    revokedAt: null,
  };
}

function emptyEpisodic(philosopherId) { return { philosopherId, entries: [] }; }

/** 防路径穿越：只保留字母数字与 _-（philosopherId 形如 kant / confucius）。 */
function safeId(philosopherId) { return String(philosopherId || '').replace(/[^a-zA-Z0-9_-]/g, ''); }

// ---- 画像（L2）----
export function loadProfile() { return { ...defaultProfile(), ...readJson(PROFILE_FILE, {}) }; }
export function saveProfile(profile) { return writeJsonAtomic(PROFILE_FILE, profile); }

// ---- 授权（L4）----
export function loadConsent() {
  const c = readJson(CONSENT_FILE, {});
  const base = defaultConsent();
  return {
    ...base,
    ...c,
    scopes: { ...base.scopes, ...(c.scopes || {}) },
    retention: { ...base.retention, ...(c.retention || {}) },
    audit: Array.isArray(c.audit) ? c.audit : [],
  };
}
export function saveConsent(consent) { return writeJsonAtomic(CONSENT_FILE, consent); }

// ---- 情景记忆（L3，按哲学家分片）----
function episodicFile(philosopherId) { return path.join(EPISODIC_DIR, `${safeId(philosopherId)}.json`); }

export function loadEpisodic(philosopherId) {
  const data = readJson(episodicFile(philosopherId), null);
  if (!data) return emptyEpisodic(philosopherId);
  return { philosopherId, entries: Array.isArray(data.entries) ? data.entries : [] };
}
export function saveEpisodic(philosopherId, data) { return writeJsonAtomic(episodicFile(philosopherId), data); }
export function clearEpisodic(philosopherId) { return saveEpisodic(philosopherId, emptyEpisodic(philosopherId)); }

export function listEpisodicIds() {
  try {
    return fs.readdirSync(EPISODIC_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  } catch { return []; }
}

export const MEMORY_PATHS = { DATA_DIR, MEMORY_DIR, EPISODIC_DIR, PROFILE_FILE, CONSENT_FILE };
