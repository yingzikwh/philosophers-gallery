/**
 * 记忆层路由（阶段 4）——/api/memory 端点组
 *
 * 与 bottleRoutes.js **同模式**：由 index.js 注入 parseBody/sendJSON/config，
 * 命中返回 true，未命中返回 false 交回主路由链。
 *
 * 隐私优先（D2）：默认四类 scope 全 off；注入与检索全部经 memoryService 的 consent 门控。
 *
 * 端点：
 *   GET    /api/memory/profile                        读画像
 *   POST   /api/memory/profile                        更新画像 { displayName?, facts?, preferences?, inclinations? }
 *   GET    /api/memory/recall?philosopherId=&query=   返回将被注入的记忆（对用户透明）
 *   POST   /api/memory/extract                        { philosopherId, messages } → 提炼并写入
 *   GET    /api/memory/consent                        读授权状态
 *   POST   /api/memory/consent                        { scope, on } 或 { scopes:{...} } 设置分类授权
 *   POST   /api/memory/revoke                         { scope } 撤销某类（抹内容留审计）
 *   DELETE /api/memory?scope=                         彻底删除某类
 */

import { chatOnce } from './llm.js';
import * as memoryService from './memoryService.js';

export async function handleMemoryRoutes(req, res, deps) {
  const { parseBody, sendJSON, config } = deps;
  const method = req.method || 'GET';
  const full = req.url || '';
  const p = full.split('?')[0];

  const isMemory = p === '/api/memory' || p.startsWith('/api/memory/');
  if (!isMemory) return false;

  // query 参数（recall 的 philosopherId/query、DELETE 的 scope）
  const q = full.includes('?') ? Object.fromEntries(new URLSearchParams(full.split('?')[1])) : {};

  /** 真实提炼 llm：无 Key 时 chatOnce 抛 503，被 extractMemory 捕获并降级为「跳过」 */
  const realExtract = (messages, options = {}) => chatOnce(messages, {
    apiKey: config.OPENAI_API_KEY,
    baseUrl: config.OPENAI_BASE_URL,
    model: config.OPENAI_MODEL,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });

  try {
    // --- 画像（L2）---
    if (p === '/api/memory/profile') {
      if (method === 'GET') {
        sendJSON(res, 200, { profile: memoryService.getProfile() });
        return true;
      }
      if (method === 'POST') {
        const body = (await parseBody(req).catch(() => ({}))) || {};
        sendJSON(res, 200, { profile: memoryService.updateProfile(body) });
        return true;
      }
    }

    // --- 召回（对用户透明可见：返回将被注入的记忆）---
    if (p === '/api/memory/recall' && method === 'GET') {
      sendJSON(res, 200, memoryService.recallMemory(q.philosopherId || '', q.query || ''));
      return true;
    }

    // --- 提炼（L3 写入；未授权 / 无 Key → 降级跳过）---
    if (p === '/api/memory/extract' && method === 'POST') {
      const body = (await parseBody(req).catch(() => ({}))) || {};
      const result = await memoryService.extractMemory(body.philosopherId || '', body.messages || [], { llm: realExtract });
      sendJSON(res, 200, result);
      return true;
    }

    // --- 授权治理（L4）---
    if (p === '/api/memory/consent') {
      if (method === 'GET') {
        sendJSON(res, 200, memoryService.getConsent());
        return true;
      }
      if (method === 'POST') {
        const body = (await parseBody(req).catch(() => ({}))) || {};
        if (body.scopes && typeof body.scopes === 'object') {
          for (const [scope, val] of Object.entries(body.scopes)) {
            memoryService.setScope(scope, val === 'on' || val === true);
          }
          sendJSON(res, 200, memoryService.getConsent());
          return true;
        }
        if (body.scope) {
          sendJSON(res, 200, memoryService.setScope(body.scope, body.on === true || body.on === 'on'));
          return true;
        }
        sendJSON(res, 400, { error: '缺少 scope 或 scopes' });
        return true;
      }
    }

    if (p === '/api/memory/revoke' && method === 'POST') {
      const body = (await parseBody(req).catch(() => ({}))) || {};
      if (!body.scope) { sendJSON(res, 400, { error: '缺少 scope' }); return true; }
      sendJSON(res, 200, memoryService.revokeScope(body.scope));
      return true;
    }

    if (p === '/api/memory' && method === 'DELETE') {
      if (!q.scope) { sendJSON(res, 400, { error: '缺少 scope 查询参数' }); return true; }
      sendJSON(res, 200, memoryService.deleteScope(q.scope));
      return true;
    }

    sendJSON(res, 405, { error: `不支持的记忆请求: ${method} ${p}` });
    return true;
  } catch (err) {
    sendJSON(res, err?.status || 500, { error: err?.message || '记忆请求处理失败' });
    return true;
  }
}
