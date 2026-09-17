import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Swords,
  Send,
  Square,
  Loader2,
  Sparkles,
  SkipForward,
  RotateCcw,
  UserPlus,
  Gavel,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Philosopher } from '@/data/philosophers';
import {
  requestDebate,
  buildDebateSchedule,
  MAX_DEBATE_ROUNDS,
  USER_SPEAKER_ID,
  type DebateEvent,
  type DebatePhase,
  type DebateScheduleItem,
  type DebateTranscriptEntry,
} from '@/services/debate';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Portrait } from '@/components/Portrait';

const PRESET_TOPICS = [
  '人性本善还是本恶？',
  '自由意志是否存在？',
  '何为正义？',
  '知行合一是否可能？',
  '人生的意义是什么？',
];

/** 与首页对比勾选保持一致的思想家上限（用户上桌后额外 +1） */
const MAX_PARTICIPANTS = 4;

/** 轮次快速预设；更细的调整走自定义输入 */
const ROUND_PRESETS = [2, 3, 4, 5, 6];

const PHASE_BADGE: Record<DebatePhase, string> = {
  opening: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  rebuttal: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  closing: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  interjection: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
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

/**
 * 进行阶段：
 * setup 未开赛 / running 本轮流式中 / awaiting-user 轮到用户插话
 * between 本轮结束可点下一轮 / done 全部轮次跑完
 */
type Stage = 'setup' | 'running' | 'awaiting-user' | 'between' | 'done';

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
  const [rounds, setRounds] = useState(3);
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState('');
  const [stage, setStage] = useState<Stage>('setup');
  const [currentRound, setCurrentRound] = useState(0);
  const [serverSchedule, setServerSchedule] = useState<DebateScheduleItem[] | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState('');
  const [pickQuery, setPickQuery] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>(() => philosophers.map((p) => p.id));
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const running = stage === 'running';
  /** 已开赛且未结束：此时锁定名单、命题与轮次 */
  const inProgress = stage !== 'setup' && stage !== 'done';

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

  const userTurnName = nickname.trim() || '我';
  /** 后端回传前先用同构的本地安排，保证开赛前就能预览轮次结构 */
  const schedule = serverSchedule ?? buildDebateSchedule(rounds);
  const rosterNames = [...participants.map((p) => p.name), ...(joined ? [userTurnName] : [])];
  const rosterForApi = joined
    ? [...participants.map((p) => ({ id: p.id, name: p.name })), { id: USER_SPEAKER_ID, name: userTurnName }]
    : participants.map((p) => ({ id: p.id, name: p.name }));

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  /* 关闭弹窗即中止并复位，下次打开回到未开赛状态 */
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setStage('setup');
    setCurrentRound(0);
    setTurns([]);
    setError(null);
    setServerSchedule(null);
    setUserDraft('');
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, stage]);

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

  const handleEvent = useCallback(
    (e: DebateEvent) => {
      switch (e.type) {
        case 'debate_start':
          if (Array.isArray(e.schedule) && e.schedule.length) setServerSchedule(e.schedule);
          break;
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
    [patchLastTurn]
  );

  /** 跑第 n 轮：base 为该轮之前的完整发言记录，随请求回传给后端延续上下文 */
  const runRound = useCallback(
    async (n: number, base: Turn[]) => {
      const t = topic.trim();
      if (t.length < 2 || participants.length < 2) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setServerSchedule(null);
      setStage('running');
      setCurrentRound(n);
      setError(null);

      const transcript: DebateTranscriptEntry[] = base
        .filter((x) => !x.error && x.content.trim())
        .map((x) => ({
          speaker: x.speaker,
          name: x.name,
          round: x.round,
          phase: x.phase,
          phaseLabel: x.phaseLabel,
          content: x.content,
        }));

      try {
        await requestDebate(
          { participants: rosterForApi, topic: t, rounds, startRound: n, transcript },
          handleEvent,
          { signal: controller.signal }
        );
        /* abort 时由 handleStop 决定回退到哪个阶段，这里不抢状态 */
        if (!controller.signal.aborted) {
          if (joined && n < rounds) setStage('awaiting-user');
          else if (n < rounds) setStage('between');
          else setStage('done');
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
          setStage(n > 1 ? 'between' : 'setup');
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [topic, participants, rosterForApi, rounds, joined, handleEvent]
  );

  const handleStart = useCallback(() => {
    setTurns([]);
    setUserDraft('');
    void runRound(1, []);
  }, [runRound]);

  const handleNext = useCallback(() => {
    const n = currentRound + 1;
    if (n > rounds) {
      setStage('done');
      return;
    }
    void runRound(n, turns);
  }, [currentRound, rounds, turns, runRound]);

  const handleStop = useCallback(() => {
    const r = currentRound;
    abortRef.current?.abort();
    abortRef.current = null;
    /* 丢弃本轮已产生的半截发言，使「下一轮」可以干净重跑本轮 */
    setTurns((prev) => prev.filter((x) => x.round !== r));
    setCurrentRound(Math.max(0, r - 1));
    setStage(r > 1 ? 'between' : 'setup');
  }, [currentRound]);

  const handleRestart = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStage('setup');
    setCurrentRound(0);
    setTurns([]);
    setError(null);
    setServerSchedule(null);
    setUserDraft('');
  }, []);

  const submitInterjection = useCallback(() => {
    const text = userDraft.trim();
    if (!text) return;
    setTurns((prev) => [
      ...prev,
      {
        speaker: USER_SPEAKER_ID,
        name: userTurnName,
        round: currentRound,
        phase: 'interjection',
        phaseLabel: '场外插话',
        content: text,
        done: true,
      },
    ]);
    setUserDraft('');
    setStage('between');
  }, [userDraft, userTurnName, currentRound]);

  const skipInterjection = useCallback(() => {
    setUserDraft('');
    setStage('between');
  }, []);

  const clampRounds = (n: number) => Math.min(Math.max(Number.isFinite(n) ? Math.trunc(n) : 1, 1), MAX_DEBATE_ROUNDS);
  const canStart = topic.trim().length >= 2 && participants.length >= 2 && !running;
  const lastTurnOfUser = turns.length > 0 && turns[turns.length - 1].speaker === USER_SPEAKER_ID;
  const controlDisabled = inProgress;

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
                ? `${rosterNames.join(' · ')} 就同一命题交锋`
                : '尚未选足参赛选手（至少 2 位）'}
            </p>
          </div>
          <div className="flex -space-x-2 shrink-0">
            {participants.slice(0, MAX_PARTICIPANTS).map((p) => (
              <Portrait key={p.id} src={p.portrait} alt={p.name} className="w-8 h-8 rounded-full object-cover border-2 border-card" />
            ))}
            {joined && (
              <div className="w-8 h-8 rounded-full bg-violet-500/25 border-2 border-card flex items-center justify-center text-[11px] font-display text-violet-300">
                {userTurnName.slice(0, 1)}
              </div>
            )}
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
                  disabled={controlDisabled}
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
                      disabled={controlDisabled || full}
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

          {/* 我也上桌：用户作为在场参与者，每轮结束后可插话 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setJoined((v) => !v)}
              disabled={controlDisabled}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                joined
                  ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                  : 'bg-background/60 border-border/40 text-muted-foreground hover:text-foreground hover:border-violet-500/40'
              )}
            >
              <UserPlus className="w-3.5 h-3.5" />
              {joined ? '我已上桌参辩' : '我也参加辩论'}
            </button>
            {joined && (
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 12))}
                disabled={controlDisabled}
                placeholder="你的昵称（默认：我）"
                className="w-40 px-2.5 py-1 text-xs rounded-md bg-background/60 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-60"
              />
            )}
            <span className="text-[11px] text-muted-foreground">
              {joined ? '每轮结束后可插话，下一轮思想家会正面回应你' : '纯旁观：先看众贤交锋'}
            </span>
          </div>

          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="输入辩论命题，例如：人性本善还是本恶？"
            rows={2}
            disabled={controlDisabled}
            className="w-full resize-none rounded-md bg-background/60 border border-border/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_TOPICS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={controlDisabled}
                onClick={() => setTopic(q)}
                className="px-2.5 py-1 text-xs rounded-full bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* 轮次：快速预设 + 自定义，并预览阶段安排 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">轮次</span>
              {ROUND_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={controlDisabled}
                  onClick={() => setRounds(n)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md border transition-colors disabled:opacity-50',
                    rounds === n
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'bg-background/60 border-border/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {n} 轮
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                自定义
                <input
                  type="number"
                  min={1}
                  max={MAX_DEBATE_ROUNDS}
                  step={1}
                  value={rounds}
                  disabled={controlDisabled}
                  onChange={(e) => setRounds(clampRounds(parseInt(e.target.value, 10)))}
                  onBlur={(e) => setRounds(clampRounds(parseInt(e.target.value, 10)))}
                  className="w-14 px-2 py-1 text-xs rounded-md bg-background/60 border border-border/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
                />
                <span className="text-[11px]">1–{MAX_DEBATE_ROUNDS}</span>
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              阶段安排：{schedule.map((s) => `${s.round}.${s.label}`).join(' → ')}
            </p>
          </div>

          {/* 进度：逐轮状态条 */}
          {inProgress || stage === 'done' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">
                {stage === 'done' ? '已全部完成' : `第 ${currentRound} / ${rounds} 轮`}
              </span>
              {schedule.map((s) => {
                const isDone = stage === 'done' || s.round < currentRound || (s.round === currentRound && stage !== 'running');
                const isActive = s.round === currentRound && stage === 'running';
                return (
                  <span
                    key={s.round}
                    className={cn(
                      'px-2 py-0.5 text-[11px] rounded-full border',
                      isActive
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : isDone
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-background/60 border-border/40 text-muted-foreground'
                    )}
                  >
                    {isDone && !isActive ? '✓ ' : isActive ? '… ' : ''}
                    {s.round}. {s.label}
                  </span>
                );
              })}
            </div>
          ) : null}

          {/* 操作区 */}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {running ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
              >
                <Square className="w-4 h-4" /> 停止本轮
              </button>
            ) : stage === 'between' ? (
              <>
                <button
                  type="button"
                  onClick={handleRestart}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> 重开
                </button>
                <button
                  type="button"
                  onClick={() => setStage('done')}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  结束辩论
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                >
                  <SkipForward className="w-4 h-4" />
                  下一轮 · {schedule[currentRound]?.label ?? ''}
                </button>
              </>
            ) : stage === 'awaiting-user' ? (
              <>
                <button
                  type="button"
                  onClick={skipInterjection}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  这轮先不发言
                </button>
                <span className="flex items-center gap-1.5 text-xs text-violet-300">
                  <Gavel className="w-3.5 h-3.5" /> 轮到你插话，见下方输入框
                </span>
              </>
            ) : (
              <>
                {stage === 'done' && (
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> 清空重开
                  </button>
                )}
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
                  <Send className="w-4 h-4" />
                  {stage === 'done' ? '重新开战' : currentRound > 0 ? '从头再辩' : '开始辩论'}
                </button>
              </>
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
                  ? joined
                    ? `点击「开始辩论」后，${participants.length} 位思想家先开场，每轮结束你都可以插话追问。`
                    : `选定命题后点击「开始辩论」，${participants.length} 位思想家将依次开场、互相质询。`
                  : '先在上方选定至少 2 位参赛选手，再挑一个命题点击「开始辩论」。'}
              </p>
            </div>
          )}
          {turns.map((turn, i) => {
            const isUser = turn.speaker === USER_SPEAKER_ID;
            const p = pMap[turn.speaker];
            return (
              <div key={i} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
                {isUser ? (
                  <div className="w-10 h-10 rounded-full bg-violet-500/25 border-2 border-violet-400/50 flex items-center justify-center text-sm font-display text-violet-200 shrink-0">
                    {turn.name.slice(0, 1)}
                  </div>
                ) : (
                  <Portrait
                    src={p?.portrait}
                    alt={turn.name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-primary/40 shrink-0"
                  />
                )}
                <div className={cn('flex-1 min-w-0', isUser && 'text-right')}>
                  <div className={cn('flex items-center gap-2 mb-1 flex-wrap', isUser && 'justify-end')}>
                    <span className={cn('font-display text-sm font-semibold', isUser ? 'text-violet-300' : 'text-primary')}>
                      {turn.name}
                    </span>
                    <span className={cn('px-2 py-0.5 text-[10px] rounded-full border', PHASE_BADGE[turn.phase])}>
                      第{turn.round}轮 · {turn.phaseLabel}
                    </span>
                    {!turn.done && !turn.error && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </div>
                  <div
                    className={cn(
                      'p-3 rounded-lg border text-left',
                      isUser ? 'bg-violet-500/10 border-violet-500/30' : 'bg-muted/30 border-border/30'
                    )}
                  >
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

          {/* 用户的插话席 */}
          {stage === 'awaiting-user' && (
            <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Gavel className="w-4 h-4 text-violet-300" />
                <span className="font-display text-sm text-violet-200">
                  轮到你发言了，{userTurnName}
                </span>
                <span className="text-xs text-muted-foreground">
                  你的话会写进辩论记录，下一轮众贤将正面回应
                </span>
              </div>
              <textarea
                value={userDraft}
                onChange={(e) => setUserDraft(e.target.value)}
                rows={3}
                placeholder="质疑、补充或反驳某位的观点……（例如：若美德需要教，为何多数美德恰恰教不会？）"
                className="w-full resize-none rounded-md bg-background/70 border border-violet-500/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={skipInterjection}
                  className="px-3 py-1.5 rounded-md text-xs bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  跳过
                </button>
                <button
                  type="button"
                  onClick={submitInterjection}
                  disabled={!userDraft.trim()}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    userDraft.trim()
                      ? 'bg-violet-500 text-white hover:bg-violet-500/90'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  )}
                >
                  <Send className="w-3.5 h-3.5" /> 发言并进入下一轮
                </button>
              </div>
            </div>
          )}

          {stage === 'done' && turns.length > 0 && !lastTurnOfUser && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              {rounds} 轮辩论已结束 —— 可换个命题、调整轮次或加自己上桌再战一场
            </div>
          )}

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
