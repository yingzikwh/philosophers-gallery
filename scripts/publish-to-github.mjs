#!/usr/bin/env node
/**
 * 将本地哲学家画廊项目发布到 GitHub。
 *
 * 背景：沙箱内直连 github.com 的 git 协议被网络层 reset，但 api.github.com 的
 * REST API 可达。因此本脚本用 GitHub REST API 创建仓库，并通过 Git Data API
 * （blobs -> tree -> commit -> ref）一次性提交全部源码，绕开被屏蔽的 git 协议。
 *
 * 用法：
 *   GITHUB_TOKEN=ghp_xxx REPO_NAME=philosophers-gallery node scripts/publish-to-github.mjs
 *
 * 环境变量：
 *   GITHUB_TOKEN   必填。Classic PAT（ghp_ 开头，勾选 repo 权限）
 *   REPO_NAME      必填。新仓库名称（英文、连字符分隔）
 *   REPO_DESC      可选。仓库描述
 *   REPO_PRIVATE   可选。true=私有，默认 false（公开）
 *   COMMIT_MESSAGE 可选。首次提交信息
 *
 * 安全：.env（含真实 API Key）以及 node_modules/dist/.workbuddy 等永不上传。
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const TOKEN = process.env.GITHUB_TOKEN;
const REPO_NAME = process.env.REPO_NAME;
const REPO_DESC = process.env.REPO_DESC || '哲思殿堂 · 哲学家智能体画廊（59 位思想家 · AI 对话 · 思想对比 · PVE 思辨闯关）';
const REPO_PRIVATE = process.env.REPO_PRIVATE === 'true';
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE || 'feat: 哲学家画廊完整源码（前端画廊 + 本地 Node 后端 + PVE 闯关 + 思想对比）';

if (!TOKEN || !REPO_NAME) {
  console.error('缺少必需环境变量：GITHUB_TOKEN 与 REPO_NAME');
  process.exit(1);
}

const API = 'https://api.github.com';
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

// ── 需要排除的目录 / 文件（沙箱产物、密钥、依赖、构建产物、包自身） ──
const EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'dist', '.workbuddy', 'outputs', 'skills',
  '.tanstack', '.todo', '.assets_mapping', '.stats', '.config', '.accesslog', '.meoo',
]);
const MAX_BLOB_BYTES = 25 * 1024 * 1024; // 单文件超过 25MB 跳过（Git Data API 不友好）

function shouldSkip(relPath, name, isDir) {
  if (isDir && EXCLUDE_DIRS.has(name)) return true;
  if (!isDir) {
    if (name === '.env') return true;
    if (name.startsWith('.env.')) return true;
    if (/^philosophers-gallery.*\.zip$/.test(name)) return true; // 安装包自身
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
  // 1) 确认身份 / 拿到登录名
  const who = await ghFetch(`${API}/user`);
  if (!who.ok) {
    console.error('Token 校验失败：', who.status, await who.text());
    process.exit(1);
  }
  const me = await who.json();
  const owner = me.login;
  console.log(`✓ 已认证为 GitHub 用户：${owner}`);

  // 2) 收集文件
  const files = [];
  await collectFiles(ROOT, '', files);
  console.log(`✓ 收集到 ${files.length} 个待上传文件（已自动排除 .env / node_modules / dist / .workbuddy 等）`);

  // 3) 创建仓库
  console.log(`→ 创建仓库 ${owner}/${REPO_NAME} ...`);
  const createRes = await ghFetch(`${API}/user/repos`, {
    method: 'POST',
    body: JSON.stringify({
      name: REPO_NAME,
      description: REPO_DESC,
      private: REPO_PRIVATE,
      auto_init: false,
      has_issues: true,
      has_wiki: false,
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    console.error(`✗ 创建仓库失败（${createRes.status}）：${err}`);
    if (createRes.status === 422) console.error('提示：仓库名可能已存在，请换一个 REPO_NAME。');
    process.exit(1);
  }
  console.log('✓ 仓库已创建');

  // 4) 逐文件创建 blob（base64）
  const treeEntries = [];
  let skipped = 0;
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const buf = await readFile(abs);
    if (buf.length > MAX_BLOB_BYTES) {
      console.warn(`  ⚠ 跳过超大文件（>${Math.round(MAX_BLOB_BYTES / 1024 / 1024)}MB）：${rel}`);
      skipped++;
      continue;
    }
    const content = buf.toString('base64');
    const res = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'base64' }),
    });
    if (!res.ok) {
      console.error(`✗ 创建 blob 失败（${res.status}）：${rel} -> ${await res.text()}`);
      process.exit(1);
    }
    const { sha } = await res.json();
    treeEntries.push({ path: rel, mode: '100644', type: 'blob', sha });
  }
  console.log(`✓ 已创建 ${treeEntries.length} 个 blob${skipped ? `，跳过 ${skipped} 个超大文件` : ''}`);

  // 5) 创建 tree
  const treeRes = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: treeEntries }),
  });
  if (!treeRes.ok) {
    console.error('✗ 创建 tree 失败：', treeRes.status, await treeRes.text());
    process.exit(1);
  }
  const { sha: treeSha } = await treeRes.json();
  console.log('✓ tree 已创建');

  // 6) 创建 commit
  const commitRes = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: COMMIT_MESSAGE, tree: treeSha, parents: [] }),
  });
  if (!commitRes.ok) {
    console.error('✗ 创建 commit 失败：', commitRes.status, await commitRes.text());
    process.exit(1);
  }
  const { sha: commitSha } = await commitRes.json();
  console.log('✓ commit 已创建');

  // 7) 创建分支引用 master
  const refRes = await ghFetch(`${API}/repos/${owner}/${REPO_NAME}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'refs/heads/master', sha: commitSha }),
  });
  if (!refRes.ok) {
    console.error('✗ 创建 ref 失败：', refRes.status, await refRes.text());
    process.exit(1);
  }
  console.log('✓ 分支 refs/heads/master 已创建');
  console.log(`\n🎉 发布完成：https://github.com/${owner}/${REPO_NAME}`);
}

main().catch((e) => {
  console.error('发布过程中出错：', e);
  process.exit(1);
});
