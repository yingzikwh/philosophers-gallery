/**
 * 记忆层 —— 前端 API 服务（阶段 4）
 *
 * 请求经 getApiBase()（origin + '/sb-api'）由 Vite 代理转发到本地后端
 * /api/memory 端点组（server/memoryRoutes.js）。
 * 隐私优先：默认四类 scope 全 off；所有注入 / 检索都由后端按 consent 门控。
 */

import { getApiBase } from '@/lib/apiBase';

export type MemoryScope = 'profile' | 'episodic' | 'crossPhilosopher' | 'lifeData';
export type ScopeState = 'on' | 'off';

export interface ProfileFact {
  id: string;
  text: string;
  pinnedBy: string;
  createdAt: string;
}

export interface MemoryProfile {
  version: number;
  displayName: string;
  inclinations: { schools: Record<string, number>; themes: Record<string, number> };
  facts: ProfileFact[];
  preferences: { tone?: string; verbosity?: string };
  updatedAt: string;
}

export interface ConsentAudit {
  action: 'grant' | 'revoke' | 'delete';
  scope: MemoryScope;
  at: string;
}

export interface MemoryConsent {
  version: number;
  scopes: Record<MemoryScope, ScopeState>;
  retention: { episodicMaxEntries: number; days: number | null };
  audit: ConsentAudit[];
  grantedAt: string | null;
  revokedAt: string | null;
}

export interface ExtractResult {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  summary?: string;
  salient?: string[];
  factsToPin?: string[];
}

export interface RecallResult {
  profile: string;
  episodic: string;
  block: string;
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

export async function fetchProfile(): Promise<MemoryProfile> {
  const { profile } = await request<{ profile: MemoryProfile }>('/api/memory/profile');
  return profile;
}

/** 画像更新入参：新增事实只需传 text，id / pinnedBy / createdAt 由后端补全 */
export type ProfileFactInput = Partial<ProfileFact> & { text: string };

export async function updateProfile(
  patch: {
    displayName?: string;
    facts?: ProfileFactInput[];
    preferences?: MemoryProfile['preferences'];
    inclinations?: MemoryProfile['inclinations'];
  },
): Promise<MemoryProfile> {
  const { profile } = await request<{ profile: MemoryProfile }>('/api/memory/profile', {
    method: 'POST',
    body: JSON.stringify(patch),
  });
  return profile;
}

export async function fetchConsent(): Promise<MemoryConsent> {
  return request<MemoryConsent>('/api/memory/consent');
}

/** 切换某类 scope 开关（只切换是否注入，不抹数据） */
export async function setScope(scope: MemoryScope, on: boolean): Promise<MemoryConsent> {
  return request<MemoryConsent>('/api/memory/consent', {
    method: 'POST',
    body: JSON.stringify({ scope, on }),
  });
}

/** 一键撤销：立即抹除该类内容，仅留审计 */
export async function revokeScope(scope: MemoryScope): Promise<MemoryConsent> {
  return request<MemoryConsent>('/api/memory/revoke', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
}

/** 彻底删除该类全部数据，不可恢复 */
export async function deleteScope(scope: MemoryScope): Promise<MemoryConsent> {
  return request<MemoryConsent>(`/api/memory?scope=${encodeURIComponent(scope)}`, { method: 'DELETE' });
}

/** 提炼一段对话为记忆（未授权 / 无 Key 时后端降级为 skipped） */
export async function extractMemory(
  philosopherId: string,
  messages: { role: string; content: string }[],
): Promise<ExtractResult> {
  return request<ExtractResult>('/api/memory/extract', {
    method: 'POST',
    body: JSON.stringify({ philosopherId, messages }),
  });
}

/** 召回：返回将被注入的记忆（对用户透明可见） */
export async function recallMemory(philosopherId: string, query = ''): Promise<RecallResult> {
  const qs = `philosopherId=${encodeURIComponent(philosopherId)}&query=${encodeURIComponent(query)}`;
  return request<RecallResult>(`/api/memory/recall?${qs}`);
}
