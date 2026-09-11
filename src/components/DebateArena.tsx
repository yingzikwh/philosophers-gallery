import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Swords, Send, Square, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Philosopher } from '@/data/philosophers';
import { requestDebate, type DebateEvent, type DebatePhase } from '@/services/debate';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const PRESET_TOPICS = [
  '人性本善还是本恶？',
  '自由意志是否存在？',
  '何为正义？',
  '知行合一是否可能？',
  '人生的意义是什么？',
];

const PHASE_BADGE: Record<DebatePhase, string> = {
  opening: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  rebuttal: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  closing: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

interface Turn {
  speaker: string;
  name: string;
  round: number;
  phase: DebatePhase;
  phaseLabel: string;
  content: string;
  error?: string;
  done: boolean;
}

interface DebateArenaProps {
  philosophers: Philosopher[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DebateArena({ philosophers, open, onOpenChange }: DebateArenaProps) {
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState(2);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pMap = useMemo(
    () => Object.fromEntries(philosophers.map((p) => [p.id, p])) as Record<string, Philosopher>,
    [philosophers]
  );

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const patchLastTurn = useCallback((speaker: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].speaker === speaker && !next[i].done) {
          next[i] = fn(next[i]);
          break;
        }
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    const t = topic.trim();
    if (t.length < 2 || philosophers.length < 2 || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setTurns([]);
    try {
      await requestDebate(
        { participants: philosophers.map((p) => ({ id: p.id, name: p.name })), topic: t, rounds },
        (e: DebateEvent) => {
          switch (e.type) {
            case 'turn_start':
              setTurns((prev) => [
                ...prev,
                { speaker: e.speaker, name: e.name, round: e.round, phase: e.phase, phaseLabel: e.phaseLabel, content: '', done: false },
              ]);
              break;
            case 'delta':
              patchLastTurn(e.speaker, (turn) => ({ ...turn, content: turn.content + e.content }));
              break;
            case 'turn_end':
              patchLastTurn(e.speaker, (turn) => ({ ...turn, done: true }));
              break;
            case 'turn_error':
              patchLastTurn(e.speaker, (turn) => ({ ...turn, error: e.message, done: true }));
              break;
            case 'error':
              setError(e.message);
              break;
            default:
              break;
          }
        },
        { signal: controller.signal }
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      if (abortRef.current === controller) setRunning(false);
    }
  }, [topic, philosophers, rounds, running, patchLastTurn]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const canStart = topic.trim().length >= 2 && philosophers.length >= 2 && !running;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-[70] 高于对比面板 Sheet 的 z-[55]，确保辩论窗覆盖在面板之上 */}
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="z-[70]"
        className="z-[70] max-w-4xl w-[95vw] h-[88vh] p-0 flex flex-col bg-card/95 backdrop-blur-xl border-border/50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 shrink-0">
          <div className="p-2 rounded-lg bg-primary/15 shrink-0">
            <Swords className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="font-display text-lg text-foreground">圆桌辩论</DialogTitle>
            <p className="text-xs text-muted-foreground truncate">
              {philosophers.map((p) => p.name).join(' · ')} 就同一命题交锋
            </p>
          </div>
          <div className="flex -space-x-2 shrink-0">
            {philosophers.slice(0, 4).map((p) => (
              <img key={p.id} src={p.portrait} alt={p.name} className="w-8 h-8 rounded-full object-cover border-2 border-card" />
            ))}
          </div>
        </div>

        {/* 控制区 */}
        <div className="px-6 py-4 border-b border-border/40 space-y-3 shrink-0 bg-muted/20">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="输入辩论命题，例如：人性本善还是本恶？"
            rows={2}
            disabled={running}
            className="w-full resize-none rounded-md bg-background/60 border border-border/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_TOPICS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={running}
                onClick={() => setTopic(q)}
                className="px-2.5 py-1 text-xs rounded-full bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">轮次</span>
              {[2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={running}
                  onClick={() => setRounds(n)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md border transition-colors disabled:opacity-50',
                    rounds === n
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'bg-background/60 border-border/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {n} 轮{n === 2 ? '·开场+质询' : '·含总结'}
                </button>
              ))}
            </div>
            {running ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
              >
                <Square className="w-4 h-4" /> 停止
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                  canStart
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                <Send className="w-4 h-4" /> 开始辩论
              </button>
            )}
          </div>
        </div>

        {/* 辩论流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {turns.length === 0 && !running && (
            <div className="text-center py-16 text-muted-foreground">
              <Sparkles className="w-10 h-10 mx-auto mb-3 text-primary/40" />
              <p className="text-sm">
                选定命题后点击「开始辩论」，{philosophers.length} 位思想家将依次开场、互相质询。
              </p>
            </div>
          )}
          {turns.map((turn, i) => {
            const p = pMap[turn.speaker];
            return (
              <div key={i} className="flex gap-3">
                <img
                  src={p?.portrait}
                  alt={turn.name}
                  className="w-10 h-10 rounded-full object-cover border-2 border-primary/40 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-display text-sm font-semibold text-primary">{turn.name}</span>
                    <span className={cn('px-2 py-0.5 text-[10px] rounded-full border', PHASE_BADGE[turn.phase])}>
                      第{turn.round}轮 · {turn.phaseLabel}
                    </span>
                    {!turn.done && !turn.error && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                    {turn.error ? (
                      <p className="text-sm text-destructive">{turn.error}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                        {turn.content}
                        {!turn.done && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary/70 animate-pulse align-text-bottom" />
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
