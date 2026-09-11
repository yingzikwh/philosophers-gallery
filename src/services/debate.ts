/**
 * 圆桌辩论 —— 前端 API 服务
 *
 * 经 getSupabaseUrl()（origin + '/sb-api'）由 Vite 代理转发到本地后端 /api/debate。
 * 后端以 SSE 流式返回多轮发言事件，本服务解析为强类型事件逐个回调，
 * 供 UI 实时渲染「开场陈词 → 交叉质询 → 总结陈词」的交锋过程。
 */
import { getSupabaseUrl } from '@/supabase/client';

export type DebatePhase = 'opening' | 'rebuttal' | 'closing';

export interface DebateParticipant {
  id: string;
  name: string;
}

export type DebateEvent =
  | { type: 'debate_start'; topic: string; rounds: number; participants: DebateParticipant[] }
  | { type: 'turn_start'; speaker: string; name: string; round: number; phase: DebatePhase; phaseLabel: string }
  | { type: 'delta'; speaker: string; content: string }
  | { type: 'turn_end'; speaker: string; round: number; length: number }
  | { type: 'turn_error'; speaker: string; message: string; detail?: string }
  | { type: 'debate_end'; transcript: Array<{ speaker: string; name: string; round: number; phase: DebatePhase; content: string }> }
  | { type: 'error'; message: string };

export interface DebateParams {
  participants: DebateParticipant[];
  topic: string;
  rounds?: number;
  model?: string;
}

/**
 * 发起一场圆桌辩论，流式回调每个事件。
 * 抛出 Error 表示请求层失败（非 2xx）；abort 时静默返回。
 */
export async function requestDebate(
  params: DebateParams,
  onEvent: (event: DebateEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const response = await fetch(`${getSupabaseUrl()}/api/debate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: options?.signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `请求失败: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          onEvent(JSON.parse(payload) as DebateEvent);
        } catch {
          // 忽略非法 JSON 行
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    throw err;
  }
}
