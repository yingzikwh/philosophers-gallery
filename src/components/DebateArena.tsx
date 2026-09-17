import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Swords, Send, Square, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Philosopher } from '@/data/philosophers';
import { requestDebate, type DebateEvent, type DebatePhase } from '@/services/debate';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Portrait } from '@/components/Portrait';

const PRESET_TOPICS = [
  '人性本善还是本恶？',
  '自由意志是否存在？',
  '何为正义？',
  '知行合一是否可能？',
  '人生的意义是什么？',
];

/** 与首页对比勾选保持一致的上限 */
const MAX_PARTICIPANTS = 4;

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
  /** 参赛哲学家：对比面板入口传入已勾选的 2-4 位；独立入口可传空，改由弹窗内自选 */
  philosophers: Philosopher[];
  /** 传入则启用「弹窗内自选参赛选手」，其值为可选池 */
  availablePhilosophers?: Philosopher[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DebateArena({
  philosophers,
  availablePhilosophers,
  open,
  onOpenChange,
}: DebateArenaProps) {
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState(2);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>(() => philosophers.map((p) => p.id));
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* 外部勾选变化时同步参赛名单（用 id 串做稳定依赖，避开内联数组的引用抖动） */
  const seedKey = philosophers.map((p) => p.id).join(',');
  useEffect(() => {
    setParticipantIds(seedKey ? seedKey.split(',') : []);
  }, [seedKey]);

  /** id → 思想家：合并已选与可选池，供名单与辩论流取头像/姓名 */
  const pool = useMemo(() => {
    const m = new Map<string, Philosopher>();
    for (const p of philosophers) m.set(p.id, p);
    for (const p of availablePhilosophers ?? []) m.set(p.id, p);
    return m;
  }, [philosophers, availablePhilosophers]);

  const participants = useMemo(
    () => participantIds.map((id) => pool.get(id)).filter((p): p is Philosopher => !!p),
    [participantIds, pool]
  );

  const pMap = useMemo(
    () => Object.fromEntries([...pool.values()].map((p) => [p.id, p])) as Record<string, Philosopher>,
    [pool]
  );

  const toggleParticipant = useCallback((id: string) => {
    setParticipantIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PARTICIPANTS) return prev;
      return [...prev, id];
    });
  }, []);

  const poolQuery = pickQuery.trim().toLowerCase();
  const candidates = useMemo(
    () =>
      (availablePhilosophers ?? []).filter(
        (p) =>
          !poolQuery ||
          p.name.toLowerCase().includes(poolQuery) ||
          p.nameEn.toLowerCase().includes(poolQuery) ||
          p.school.some((s) => s.toLowerCase().includes(poolQuery))
      ),
    [availablePhilosophers, poolQuery]
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
    if (t.length < 2 || participants.length < 2 || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setTurns([]);
    try {
      await requestDebate(
        { participants: participants.map((p) => ({ id: p.id, name: p.name })), topic: t, rounds },
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
  }, [topic, participants, rounds, running, patchLastTurn]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const canStart = topic.trim().length >= 2 && participants.length >= 2 && !running;

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
              {participants.length >= 2
                ? `${participants.map((p) => p.name).join(' · ')} 就同一命题交锋`
                : '尚未选足参赛选手（至少 2 位）'}
            </p>
          </div>
          <div className="flex -space-x-2 shrink-0">
            {participants.slice(0, 4).map((p) => (
              <Portrait key={p.id} src={p.portrait} alt={p.name} className="w-8 h-8 rounded-full object-cover border-2 border-card" />
            ))}
          </div>
        </div>

        {/* 控制区 */}
        <div className="px-6 py-4 border-b border-border/40 space-y-3 shrink-0 bg-muted/20">
          {/* 参赛选手自选：仅独立入口（传入可选池）时展示 */}
          {availablePhilosophers && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  参赛选手
                  <span
                    className={cn(
                      'ml-1.5 tabular-nums',
                      participants.length >= 2 ? 'text-primary' : 'text-destructive'
                    )}
                  >
                    {participants.length}/{MAX_PARTICIPANTS}
                  </span>
                  <span className="ml-1.5">至少 2 位</span>
                </span>
                <input
                  type="text"
                  value={pickQuery}
                  onChange={(e) => setPickQuery(e.target.value)}
                  disabled={running}
                  placeholder="搜索思想家…"
                  className="w-40 px-2.5 py-1 text-xs rounded-md bg-background/60 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {candidates.map((p) => {
                  const on = participantIds.includes(p.id);
                  const full = !on && participantIds.length >= MAX_PARTICIPANTS;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={running || full}
                      onClick={() => toggleParticipant(p.id)}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                        on
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'bg-background/60 border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40'
                      )}
                    >
                      {p.name}
                    </button>
                  );
                })}
                {candidates.length === 0 && (
                  <span className="text-xs text-muted-foreground">无匹配的思想家</span>
                )}
              </div>
            </div>
          )}
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
                {participants.length >= 2
                  ? `选定命题后点击「开始辩论」，${participants.length} 位思想家将依次开场、互相质询。`
                  : '先在上方选定至少 2 位参赛选手，再挑一个命题点击「开始辩论」。'}
              </p>
            </div>
          )}
          {turns.map((turn, i) => {
            const p = pMap[turn.speaker];
            return (
              <div key={i} className="flex gap-3">
                <Portrait
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
