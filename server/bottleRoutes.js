/**
 * 漂流瓶路由（阶段 3）——/api/bottles 端点组
 *
 * 与 debate.js 同模式：由 index.js 注入 parseBody/sendJSON/buildSystemPrompt/config，
 * 命中返回 true，未命中返回 false 交回主路由链。
 *
 * 端点：
 *   POST   /api/bottles            扔瓶 { text, authorLabel?, scope? }
 *   GET    /api/bottles            我的瓶子（本地单人，全量）
 *   GET    /api/bottles/wall       公共瓶墙（仅 public-anon 且未撤销）
 *   POST   /api/bottles/:id/reply  哲学家拾瓶而答 { philosopherId?, eraId? }
 *   POST   /api/bottles/:id/revoke 一键撤销授权（抹除正文与回信，留审计元数据）
 *   DELETE /api/bottles/:id        彻底删除（整条记录移出存储）
 */

import { chatOnce } from './llm.js';
import {
  BOTTLE_SCOPES,
  throwBottle,
  listBottles,
  getPublicWall,
  replyToBottle,
  revokeBottle,
  deleteBottle,
} from './bottleService.js';

const REPLY_ROUTE = /^\/api\/bottles\/([^/]+)\/reply$/;
const REVOKE_ROUTE = /^\/api\/bottles\/([^/]+)\/revoke$/;
const DELETE_ROUTE = /^\/api\/bottles\/([^/]+)$/;

export async function handleBottleRoutes(req, res, deps) {
  const { parseBody, sendJSON, buildSystemPrompt, config } = deps;
  const method = req.method || 'GET';
  const p = (req.url || '').split('?')[0];

  const isBottle = p === '/api/bottles' || p === '/api/bottles/wall' || p.startsWith('/api/bottles/');
  if (!isBottle) return false;

  /** 真实回信生成：人格系统提示（含时代语境与检索知识）+ 瓶子正文作为用户消息 */
  const realGenerateReply = async ({ philosopherId, eraId, bottleText }) => {
    const system = buildSystemPrompt(philosopherId, bottleText, eraId);
    const messages = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `我捡到一只漂流瓶，瓶中信如下：\n\n「${bottleText}」\n\n请以你的口吻写一封回信给投瓶人，直接回应瓶中的困惑，不要复述原文。`,
      },
    ];
    return chatOnce(messages, {
      apiKey: config.OPENAI_API_KEY,
      baseUrl: config.OPENAI_BASE_URL,
      model: config.OPENAI_MODEL,
    });
  };

  try {
    // GET /api/bottles/wall —— 须在 :id 路由之前判定
    if (method === 'GET' && p === '/api/bottles/wall') {
      sendJSON(res, 200, { bottles: getPublicWall() });
      return true;
    }

    if (p === '/api/bottles') {
      if (method === 'GET') {
        sendJSON(res, 200, { bottles: listBottles(), scopes: BOTTLE_SCOPES });
        return true;
      }
      if (method === 'POST') {
        const body = await parseBody(req);
        const bottle = throwBottle(body || {});
        sendJSON(res, 201, { bottle });
        return true;
      }
    }

    let m;
    if ((m = p.match(REPLY_ROUTE)) && method === 'POST') {
      const body = (await parseBody(req).catch(() => ({}))) || {};
      const bottle = await replyToBottle(decodeURIComponent(m[1]), {
        philosopherId: body.philosopherId || '',
        eraId: body.eraId || '',
        generateReply: realGenerateReply,
      });
      sendJSON(res, 200, { bottle });
      return true;
    }

    if ((m = p.match(REVOKE_ROUTE)) && method === 'POST') {
      sendJSON(res, 200, { bottle: revokeBottle(decodeURIComponent(m[1])) });
      return true;
    }

    if ((m = p.match(DELETE_ROUTE)) && method === 'DELETE') {
      sendJSON(res, 200, deleteBottle(decodeURIComponent(m[1])));
      return true;
    }

    sendJSON(res, 405, { error: `不支持的漂流瓶请求: ${method} ${p}` });
    return true;
  } catch (err) {
    sendJSON(res, err?.status || 500, { error: err?.message || '漂流瓶请求处理失败' });
    return true;
  }
}
