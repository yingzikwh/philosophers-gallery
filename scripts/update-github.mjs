#!/usr/bin/env node
/**
 * 更新哲学家画廊 GitHub 仓库（沙箱无 git push 时用 REST API 覆盖 main 分支）。
 *
 * 用法：
 *   GITHUB_TOKEN=ghp_xxx node scripts/update-github.mjs
 *
 * 环境变量：
 *   GITHUB_TOKEN   必填。Classic PAT（ghp_ 开头，勾选 repo 权限）
 *   REPO_NAME      默认 philosophers-gallery
 *   COMMIT_MESSAGE 可选，默认 "update: 同步最新本地改动"
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TOKEN = process.env.GITHUB_TOKEN;
const REPO_NAME = process.env.REPO_NAME || 'philosophers-gallery';
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE || 'update: 同步最新本地改动';

if (!TOKEN) {
  console.error('缺少环境变量：GITHUB_TOKEN');
  process.exit(1);
}

const API = 'https://api.github.com';
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

const EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'dist', '.workbuddy', 'outputs', 'skills',
  '.tanstack', '.todo', '.assets_mapping', '.stats', '.config', '.accesslog', '.meoo',
]);
const MAX_BLOB_BYTES = 25 * 1024 * 1024;

function shouldSkip(relPath, name, isDir) {
  if (isDir && EXCLUDE_DIRS.has(name)) return true;
  if (!isDir) {
    if (name === '.env') return true;
    if (name.startsWith('.env.')) return true;
    if (/^philosophers-gallery.*\.zip$/.test(name)) return true;
  }
  return false;
}

async function collectFiles(dir, base, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (shouldSkip(rel, entry.name, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      await collectFiles(abs, rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}

async function ghFetch(url, options = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 502 || res.status === 503) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    return res;
  }
  throw new Error(`请求失败（重试耗尽）: ${url}`);
}

async function main() {
  const who = await ghFetch(`${API}/user`);
  if (!who.ok) {
    console.error('Token 校验失败：', who.status, await who.text());
    process.exit(1);
  }
  const me = await who.json();
  const owner = me.login;
  console.log(`✓ 已认证：${owner}`);

  const files = [];
  await collectFiles(ROOT, '', files);
  console.log(`✓ 收集到 ${files.length} 个文件`);

  // 获取当前 main 分支 HEAD 作为 parent
  const refGet = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/refs/heads/main`);
  if (!refGet.ok) {
    console.error('获取 main 分支失败：', refGet.status, await refGet.text());
    console.error('提示：如果是空仓库或分支名不是 main，请用 publish-to-github.mjs 重新发布。');
    process.exit(1);
  }
  const { object: { sha: parentSha } } = await refGet.json();
  console.log(`✓ 当前 main HEAD：${parentSha.slice(0, 7)}`);

  const treeEntries = [];
  let skipped = 0;
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const buf = await readFile(abs);
    if (buf.length > MAX_BLOB_BYTES) {
      console.warn(`  ⚠ 跳过超大文件：${rel}`);
      skipped++;
      continue;
    }
    const content = buf.toString('base64');
    const res = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'base64' }),
    });
    if (!res.ok) {
      console.error(`✗ blob 失败：${rel} -> ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const { sha } = await res.json();
    treeEntries.push({ path: rel, mode: '100644', type: 'blob', sha });
  }
  console.log(`✓ 已创建 ${treeEntries.length} 个 blob`);

  const treeRes = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: treeEntries }),
  });
  if (!treeRes.ok) {
    console.error('✗ tree 失败：', treeRes.status, await treeRes.text());
    process.exit(1);
  }
  const { sha: treeSha } = await treeRes.json();
  console.log('✓ tree 已创建');

  const commitRes = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: COMMIT_MESSAGE, tree: treeSha, parents: [parentSha] }),
  });
  if (!commitRes.ok) {
    console.error('✗ commit 失败：', commitRes.status, await commitRes.text());
    process.exit(1);
  }
  const { sha: commitSha } = await commitRes.json();
  console.log('✓ commit 已创建');

  const refPatch = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/refs/heads/main`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha, force: true }),
  });
  if (!refPatch.ok) {
    console.error('✗ 更新 ref 失败：', refPatch.status, await refPatch.text());
    process.exit(1);
  }
  console.log(`✓ main 已更新至 ${commitSha.slice(0, 7)}`);
  console.log(`\n🎉 更新完成：https://github.com/${owner}/${REPO_NAME}`);
}

main().catch((e) => {
  console.error('更新失败：', e);
  process.exit(1);
});
