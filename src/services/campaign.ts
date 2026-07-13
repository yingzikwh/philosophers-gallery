/**
 * PVE 闯关对战 —— 前端 API 服务
 *
 * 所有请求经前端 getSupabaseUrl()（返回 origin + '/sb-api'）经 Vite 代理
 * 转发到本地后端（localhost:3016）的 /api/... 端点。
 */

import { getSupabaseUrl } from '@/supabase/client';
import type { ChatMessage } from '@/services/philosopherAI';

export type StageStatus = 'cleared' | 'available' | 'locked';

export interface StageReward {
  tp: number;
  in: number;
}

export interface Stage {
  id: string;
  chapter: string;
  title: string;
  philosopherId: string;
  topic: string;
  difficulty: number;
  threshold: number;
  reward: StageReward;
  /** 前端展示用，由后端按线性解锁规则计算 */
  status?: StageStatus;
  /** 历史最佳分（已通关或曾挑战过时存在） */
  bestScore?: number;
}

export interface ProgressTotals {
  tp: number;
  in: number;
  rp: number;
}

export interface Progress {
  clearedStages: string[];
  bestScores: Record<string, number>;
  totals: ProgressTotals;
}

export interface StagesResponse {
  stages: Stage[];
  totalStages: number;
  clearedCount: number;
}

export interface ProgressResponse extends Progress {
  clearedCount: number;
  totalStages: number;
}

export interface SubmitProgressResponse extends Progress {
  granted: StageReward;
  cleared: boolean;
  newlyCleared: boolean;
  clearedCount: number;
  totalStages: number;
}

export interface JudgeDimensions {
  relevance: number;
  depth: number;
  logic: number;
  originality: number;
  civility: number;
}

export interface JudgeResult {
  dimensions: JudgeDimensions;
  total: number;
  comment: string;
}

/** 统一请求封装：非 2xx 抛出带中文 message 的 Error */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getSupabaseUrl()}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err) {
    throw new Error('网络请求失败，请确认后端服务已启动');
  }

  if (!res.ok) {
    let msg = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // 忽略解析失败，使用默认 message
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

export function fetchStages(): Promise<StagesResponse> {
  return request<StagesResponse>('/api/stages');
}

export function fetchProgress(): Promise<ProgressResponse> {
  return request<ProgressResponse>('/api/progress');
}

export function submitProgress(stageId: string, score: number): Promise<SubmitProgressResponse> {
  return request<SubmitProgressResponse>('/api/progress', {
    method: 'POST',
    body: JSON.stringify({ stageId, score }),
  });
}

export function requestJudge(
  philosopherId: string,
  topic: string,
  messages: ChatMessage[]
): Promise<JudgeResult> {
  return request<JudgeResult>('/api/judge', {
    method: 'POST',
    body: JSON.stringify({ philosopherId, topic, messages }),
  });
}
