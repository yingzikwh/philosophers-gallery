/**
 * 思考漂流瓶 —— 前端 API 服务（阶段 3）
 *
 * 请求经 getApiBase()（origin + '/sb-api'）由 Vite 代理转发到本地后端
 * /api/bottles 端点组（server/bottleRoutes.js）。
 * 闭环：扔瓶（含授权范围）→ 哲学家拾瓶而答 → 撤销授权 / 彻底删除。
 */

import { getApiBase } from '@/lib/apiBase';

export type BottleScope = 'private' | 'reply-only' | 'public-anon';
export type BottleStatus = 'floating' | 'replied' | 'revoked';

export interface BottleConsent {
  scope: BottleScope;
  version: number;
  grantedAt: string;
  revokedAt: string | null;
}

export interface MatchedPhilosopher {
  id: string;
  name: string;
  score: number;
}

export interface BottleReply {
  id: string;
  philosopherId: string;
  philosopherName: string;
  eraId: string | null;
  text: string;
  createdAt: string;
}

export interface Bottle {
  id: string;
  text: string;
  authorLabel: string;
  scope: BottleScope;
  consent: BottleConsent;
  createdAt: string;
  status: BottleStatus;
  matched: MatchedPhilosopher[];
  replies: BottleReply[];
}

/** 公共瓶墙条目（后端已隐去授权细节） */
export interface WallBottle {
  id: string;
  authorLabel: string;
  text: string;
  createdAt: string;
  status: BottleStatus;
  replies: Pick<BottleReply, 'philosopherId' | 'philosopherName' | 'text' | 'createdAt'>[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败 HTTP ${res.status}`);
  return data as T;
}

/** 扔瓶：授权范围必选其一（默认 reply-only，仅供匹配的哲学家回应） */
export async function throwBottle(params: {
  text: string;
  authorLabel?: string;
  scope: BottleScope;
}): Promise<Bottle> {
  const { bottle } = await request<{ bottle: Bottle }>('/api/bottles', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return bottle;
}

export async function fetchBottles(): Promise<Bottle[]> {
  const data = await request<{ bottles: Bottle[] }>('/api/bottles');
  return data.bottles;
}

export async function fetchWall(): Promise<WallBottle[]> {
  const data = await request<{ bottles: WallBottle[] }>('/api/bottles/wall');
  return data.bottles;
}

/** 请哲学家拾瓶而答；philosopherId 缺省用匹配到的第一位 */
export async function replyBottle(
  id: string,
  opts?: { philosopherId?: string; eraId?: string }
): Promise<Bottle> {
  const { bottle } = await request<{ bottle: Bottle }>(
    `/api/bottles/${encodeURIComponent(id)}/reply`,
    { method: 'POST', body: JSON.stringify(opts || {}) }
  );
  return bottle;
}

/** 一键撤销授权：正文与回信立即抹除，仅留审计元数据 */
export async function revokeBottle(id: string): Promise<Bottle> {
  const { bottle } = await request<{ bottle: Bottle }>(
    `/api/bottles/${encodeURIComponent(id)}/revoke`,
    { method: 'POST' }
  );
  return bottle;
}

/** 彻底删除：整条记录移出存储，不可恢复 */
export async function deleteBottle(id: string): Promise<void> {
  await request(`/api/bottles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
