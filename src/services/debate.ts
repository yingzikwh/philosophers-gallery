/**
 * 圆桌辩论 —— 前端 API 服务
 *
 * 经 getApiBase()（origin + '/sb-api'）由 Vite 代理转发到本地后端 /api/debate。
 * 后端以 SSE 流式返回多轮发言事件，本服务解析为强类型事件逐个回调，
 * 供 UI 实时渲染「开场陈词 → 交叉质询 → 总结陈词」的交锋过程。
 */
import { getApiBase } from '@/lib/apiBase';

/** interjection 为前端自用的用户插话阶段，后端不会产出 */
export type DebatePhase = 'opening' | 'rebuttal' | 'closing' | 'interjection';

export const USER_SPEAKER_ID = 'user';

/** 最大总轮次，与后端 server/debate.js 保持一致 */
export const MAX_DEBATE_ROUNDS = 6;

/** 交锋环节的递进标签，与后端保持一致 */
export const DEBATE_EXCHANGE_LABELS = ['交叉质询', '深入交锋', '层层诘难', '极限辩难'];

/**
 * 按总轮次生成阶段安排（与后端 buildSchedule 同构）：
 * 1 轮 → 开场陈词；2 轮 → 开场 + 质询；≥3 轮 → 开场 +（轮次-2）次交锋 + 总结陈词
 */
export function buildDebateSchedule(rounds: number): DebateScheduleItem[] {
  const list: Omit<DebateScheduleItem, 'round'>[] = [{ phase: 'opening', label: '开场陈词' }];
  if (rounds === 2) {
    list.push({ phase: 'rebuttal', label: DEBATE_EXCHANGE_LABELS[0] });
  } else if (rounds >= 3) {
    for (let i = 0; i < rounds - 2; i++) {
      list.push({
        phase: 'rebuttal',
        label: DEBATE_EXCHANGE_LABELS[Math.min(i, DEBATE_EXCHANGE_LABELS.length - 1)],
      });
    }
    list.push({ phase: 'closing', label: '总结陈词' });
  }
  return list.map((item, i) => ({ ...item, round: i + 1 }));
}

export interface DebateParticipant {
  id: string;
  name: string;
}

export interface DebateScheduleItem {
  round: number;
  phase: DebatePhase;
  label: string;
}

export interface DebateTranscriptEntry {
  speaker: string;
  name: string;
  round: number;
  phase: DebatePhase;
  phaseLabel?: string;
  content: string;
}

export type DebateEvent =
  | { type: 'debate_start'; topic: string; rounds: number; participants: DebateParticipant[]; schedule?: DebateScheduleItem[]; startRound?: number; endRound?: number }
  | { type: 'turn_start'; speaker: string; name: string; round: number; phase: DebatePhase; phaseLabel: string }
  | { type: 'delta'; speaker: string; content: string }
  | { type: 'turn_end'; speaker: string; round: number; length: number }
  | { type: 'turn_error'; speaker: string; message: string; detail?: string }
  | { type: 'debate_end'; transcript: DebateTranscriptEntry[] }
  | { type: 'error'; message: string };

export interface DebateParams {
  participants: DebateParticipant[];
  topic: string;
  /** 总轮次，后端限制 1-6 */
  rounds?: number;
  /** 从第几轮开始跑，默认 1；大于 1 时需同时回传 transcript 以延续上下文 */
  startRound?: number;
  /** 本次跑到第几轮为止，默认等于 startRound（一次只推进一轮）；传 rounds 则一次跑完全场 */
  endRound?: number;
  /** 既往发言记录（含用户插话） */
  transcript?: DebateTranscriptEntry[];
  model?: string;
}

/**
 * 发起（或推进）一场圆桌辩论，流式回调每个事件。
 * 不传 startRound 则从第 1 轮跑完 rounds 轮；传入则只跑该轮及之后，
 * 配合 transcript 即可实现「点击下一轮」的逐轮推进。
 * 抛出 Error 表示请求层失败（非 2xx）；abort 时静默返回。
 */
export async function requestDebate(
  params: DebateParams,
  onEvent: (event: DebateEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/debate`, {
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
