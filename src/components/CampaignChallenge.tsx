import { memo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Loader2,
  Bot,
  User,
  Swords,
  Trophy,
  CheckCircle2,
  RotateCcw,
  ChevronDown,
  History,
  ArrowLeft,
  Eraser,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { philosophers, type Philosopher } from '@/data/philosophers';
import {
  requestPhilosopherChat,
  type ChatMessage,
} from '@/services/philosopherAI';
import {
  requestJudge,
  submitProgress,
  type Stage,
  type JudgeResult,
  type JudgeDimensions,
} from '@/services/campaign';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface CampaignChallengeProps {
  stage: Stage;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** 通关（含刷新最佳）后回调，便于父组件刷新进度 */
  onCleared: () => void;
}

const DIMENSION_LABELS: Record<keyof JudgeDimensions, string> = {
  relevance: '相关性',
  depth: '深度',
  logic: '逻辑性',
  originality: '原创性',
  civility: '礼节',
};

/* 学派色映射（art §2.4）：以 philosopher.era 驱动头像环光 */
const ERA_RING: Record<Philosopher['era'], string> = {
  ancient: 'ring-campaign-era-ancient glow-arcane',
  modern: 'ring-campaign-era-modern glow-arcane',
  contemporary: 'ring-campaign-era-contemporary glow-arcane',
};
const ERA_RING_COLOR: Record<Philosopher['era'], string> = {
  ancient: 'ring-campaign-era-ancient/50',
  modern: 'ring-campaign-era-modern/50',
  contemporary: 'ring-campaign-era-contemporary/50',
};
/* 学派小色点（仅装饰，信息靠文字承载，art §4） */
const ERA_DOT: Record<Philosopher['era'], string> = {
  ancient: 'bg-campaign-era-ancient',
  modern: 'bg-campaign-era-modern',
  contemporary: 'bg-campaign-era-contemporary',
};

/* 五维分档着色（art §6.3）：图标+文字+数字三重区分，颜色仅增强 */
function scoreBarClass(v: number): string {
  if (v >= 80) return 'bg-campaign-gold';
  if (v >= 60) return 'bg-campaign-gold/70';
  return 'bg-campaign-fail';
}

/* ===== 草稿持久化（UX §4，localStorage，后端不变） ===== */
const DRAFT_PREFIX = 'campaign-draft-';
const DRAFT_MAX_MESSAGES = 200;
const DRAFT_EXPIRY_MS = 30 * 24 * 3600 * 1000; // 软过期 30 天（决策 D）

type CampaignDraft = {
  schemaVersion: 1;
  stageId: string;
  philosopherId: string;
  topic: string;
  messages: ChatMessage[];
  input?: string;
  judgeResult?: JudgeResult;
  updatedAt: number;
};

function readDraft(key: string, stage: Stage): CampaignDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as CampaignDraft;
    if (data.schemaVersion !== 1) return null;
    if (data.stageId !== stage.id) return null;
    if (data.philosopherId !== stage.philosopherId) return null;
    if (data.topic !== stage.topic) return null;
    if (!Array.isArray(data.messages)) return null;
    if (Date.now() - (data.updatedAt ?? 0) > DRAFT_EXPIRY_MS) return null; // 懒清理
    return data;
  } catch {
    return null; // 解析异常/字段缺失 → 丢弃
  }
}

function writeDraft(
  key: string,
  stage: Stage,
  messages: ChatMessage[],
  input: string,
  judgeResult: JudgeResult | null
) {
  try {
    // 容量护栏：超出截断最旧（决策 D）
    const safeMessages =
      messages.length > DRAFT_MAX_MESSAGES
        ? messages.slice(messages.length - DRAFT_MAX_MESSAGES)
        : messages;
    const draft: CampaignDraft = {
      schemaVersion: 1,
      stageId: stage.id,
      philosopherId: stage.philosopherId,
      topic: stage.topic,
      messages: safeMessages,
      input: input || undefined,
      judgeResult: judgeResult ?? undefined,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // QuotaExceeded 等：静默降级，不阻塞对谈
  }
}

function makeOpening(stage: Stage, philosopher?: Philosopher): ChatMessage {
  return {
    role: 'assistant',
    content: `我是${philosopher?.name ?? stage.philosopherId}。${stage.topic}`,
    timestamp: Date.now(),
  };
}

/* 单条对谈气泡（React.memo：流式更新只重渲染流式节点，UX §2.3） */
const MessageRow = memo(function MessageRow({
  message,
  philosopher,
}: {
  message: ChatMessage;
  philosopher?: Philosopher;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-campaign-user/20 ring-1 ring-campaign-user/40'
            : cn('bg-campaign-philosopher', philosopher ? ERA_RING_COLOR[philosopher.era] : '', 'glow-arcane')
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-campaign-gold-strong" />
        ) : philosopher ? (
          <img
            src={philosopher.portrait}
            alt={philosopher.name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <Bot className="w-4 h-4 text-campaign-gold-strong" />
        )}
      </div>

      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-campaign-surface text-campaign-gold-strong border border-campaign-gold/40 glow-gold'
            : 'bg-campaign-philosopher text-foreground border border-campaign-arcane/30'
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
});

export function CampaignChallenge({
  stage,
  isOpen,
  onOpenChange,
  onCleared,
}: CampaignChallengeProps) {
  const philosopher = philosophers.find((p) => p.id === stage.philosopherId);
  const draftKey = `${DRAFT_PREFIX}${stage.id}`;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isJudging, setIsJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [justCleared, setJustCleared] = useState(false);

  // 顶部「已恢复上次对谈」药丸（UX §2.5 / art §8）
  const [showRecovered, setShowRecovered] = useState(false);
  // 提交二次确认弹窗（UX §2.7 / 决策 B）
  const [confirmJudgeOpen, setConfirmJudgeOpen] = useState(false);
  // 清空重来两态按钮（UX §2.6 / 决策 B）
  const [confirmClearing, setConfirmClearing] = useState(false);

  // 滚动贴底检测（UX §2.3）
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 始终持有最新状态，供关闭/卸载时同步写盘
  const stateRef = useRef({ messages, input, judgeResult });
  stateRef.current = { messages, input, judgeResult };

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsPinnedToBottom(distance < 48);
  }, []);

  const saveDraftNow = useCallback(() => {
    const { messages: m, input: i, judgeResult: j } = stateRef.current;
    writeDraft(draftKey, stage, m, i, j);
  }, [draftKey, stage]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraftNow(), 300);
  }, [saveDraftNow]);

  // 卸载时兜底写盘（如：对话框打开时直接返回主页，UX §2.9）
  const saveDraftNowRef = useRef(saveDraftNow);
  saveDraftNowRef.current = saveDraftNow;
  useEffect(() => {
    return () => {
      saveDraftNowRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 打开时优先恢复草稿（UX §2.1 / 决策 A·C·D）
  useEffect(() => {
    if (!isOpen) return;
    const draft = readDraft(draftKey, stage);
    if (draft) {
      setMessages(draft.messages);
      setInput(draft.input ?? '');
      setJudgeResult(draft.judgeResult ?? null); // 仅展示，不触发发奖（决策 A）
      setIsPinnedToBottom(true);
      const hasContent =
        draft.messages.some((m) => m.role === 'user') || !!draft.judgeResult;
      setShowRecovered(hasContent);
      if (hasContent) {
        recoveredTimer.current = setTimeout(() => setShowRecovered(false), 3000);
      }
    } else {
      setMessages([makeOpening(stage, philosopher)]);
      setInput('');
      setJudgeResult(null);
      setShowRecovered(false);
    }
    setError(null);
    setStreamingText('');
    setJustCleared(false);
    setIsStreaming(false);
    setIsJudging(false);

    const focusT = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => {
      clearTimeout(focusT);
      if (recoveredTimer.current) clearTimeout(recoveredTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stage.id]);

  // 贴底时才自动滚到底；用户上滑浏览不被强制拉回（UX §2.3）
  useEffect(() => {
    if (isPinnedToBottom) scrollToBottom();
  }, [messages, streamingText, isPinnedToBottom, scrollToBottom]);

  // 关闭（X / Esc / 返回关卡）：先中止在途、同步写盘、再关闭（UX §2.4）
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        if (clearTimer.current) clearTimeout(clearTimer.current);
        setConfirmJudgeOpen(false);
        setConfirmClearing(false);
        saveDraftNow();
      }
      onOpenChange(open);
    },
    [onOpenChange, saveDraftNow]
  );

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || isJudging) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setError(null);
    setStreamingText('');
    setJudgeResult(null);
    setJustCleared(false);
    scheduleSave(); // 写入时机①：追加 user 消息后防抖写盘

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      let assistantContent = '';
      await requestPhilosopherChat(
        stage.philosopherId,
        [...stateRef.current.messages, userMessage],
        (chunk) => {
          assistantContent += chunk;
          setStreamingText(assistantContent);
        },
        { signal: abortControllerRef.current.signal }
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingText('');
      scheduleSave(); // 写入时机②：assistant 流式完成后写盘
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message || '对话出现错误，请重试');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [input, isStreaming, isJudging, stage.philosopherId, scheduleSave]);

  const handleJudge = useCallback(async () => {
    const hasUserMsg = stateRef.current.messages.some((m) => m.role === 'user');
    if (!hasUserMsg) {
      toast.error('请先与哲学家对话，再提交评判');
      return;
    }
    if (isStreaming || isJudging) return;

    setIsJudging(true);
    setError(null);
    setJudgeResult(null);
    setJustCleared(false);

    try {
      const result = await requestJudge(
        stage.philosopherId,
        stage.topic,
        stateRef.current.messages
      );
      setJudgeResult(result);
      scheduleSave(); // 轻量持久 judgeResult（决策 A）

      if (result.total >= stage.threshold) {
        const sub = await submitProgress(stage.id, result.total);
        if (sub.newlyCleared) {
          setJustCleared(true);
          toast.success(`通关！获得 TP+${sub.granted.tp} IN+${sub.granted.in}`);
        } else {
          toast.success('已刷新最佳成绩');
        }
        // 无论首通还是刷新最佳，都通知父组件刷新进度
        onCleared();
      } else {
        toast.error(`未达通关线（需 ${stage.threshold} 分），再接再厉`);
      }
    } catch (err) {
      setError((err as Error).message || '评判失败，请重试');
      toast.error((err as Error).message || '评判失败，请重试');
    } finally {
      setIsJudging(false);
    }
  }, [isStreaming, isJudging, stage, onCleared, scheduleSave]);

  // 「提交评判」→ 先弹二次确认，确认后才评分（UX §2.7 / 决策 B）
  const handleJudgeClick = useCallback(() => {
    if (isStreaming || isJudging) return;
    setConfirmJudgeOpen(true);
  }, [isStreaming, isJudging]);

  const confirmJudge = useCallback(() => {
    setConfirmJudgeOpen(false);
    handleJudge();
  }, [handleJudge]);

  // 「重新开始 / 清空重来」：两态按钮 + 5s 撤销 toast（UX §2.6 / 决策 B）
  const handleResetClick = useCallback(() => {
    if (confirmClearing) {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      setConfirmClearing(false);
      // 备份当前对谈，供撤销回写
      const backup = {
        messages: stateRef.current.messages,
        input: stateRef.current.input,
        judgeResult: stateRef.current.judgeResult,
      };
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* 忽略 */
      }
      setMessages([makeOpening(stage, philosopher)]);
      setInput('');
      setJudgeResult(null);
      setStreamingText('');
      setError(null);
      setJustCleared(false);
      setIsStreaming(false);
      setIsJudging(false);
      setShowRecovered(false);
      setIsPinnedToBottom(true);
      scrollToBottom();

      toast('已清空对谈', {
        duration: 5000,
        action: {
          label: '撤销',
          onClick: () => {
            writeDraft(
              draftKey,
              stage,
              backup.messages,
              backup.input,
              backup.judgeResult
            );
            setMessages(backup.messages);
            setInput(backup.input ?? '');
            setJudgeResult(backup.judgeResult ?? null);
            setIsPinnedToBottom(true);
            scrollToBottom();
          },
        },
      });
    } else {
      setConfirmClearing(true);
      clearTimer.current = setTimeout(() => setConfirmClearing(false), 3000);
    }
  }, [confirmClearing, draftKey, stage, philosopher, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const passed = judgeResult ? judgeResult.total >= stage.threshold : false;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="campaign-overlay"
        className="max-w-4xl h-[88vh] overflow-hidden campaign-panel rounded-2xl"
      >
        <DialogDescription className="sr-only">
          与哲学家{philosopher?.name ?? stage.philosopherId}的思辨闯关对谈
        </DialogDescription>

        <DialogHeader className="border-b border-[oklch(0.7_0.14_85/0.25)] pb-4">
          <DialogTitle className="flex items-center gap-3">
            <div className="relative">
              {philosopher ? (
                <img
                  src={philosopher.portrait}
                  alt={philosopher.name}
                  className={cn(
                    'w-12 h-12 rounded-full object-cover border-2 border-campaign-gold ring-2 ring-offset-2 ring-offset-campaign-panel glow-arcane',
                    ERA_RING[philosopher.era]
                  )}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-campaign-surface flex items-center justify-center">
                  <Bot className="w-5 h-5 text-campaign-gold-strong" />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-campaign-gold rounded-full flex items-center justify-center ring-2 ring-campaign-panel shadow-[0_0_12px_oklch(0.7_0.14_85/0.6)]">
                <Swords className="w-3 h-3 text-campaign-user-fg" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg">
                  <span className="text-foreground">挑战 · </span>
                  <span className="gradient-text-gold">
                    {philosopher?.name ?? stage.philosopherId}
                  </span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-campaign-gold/15 text-campaign-gold-strong">
                  关 {stage.id.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {philosopher && (
                  <span
                    className={cn(
                      'inline-block w-2 h-2 rounded-full',
                      ERA_DOT[philosopher.era]
                    )}
                    aria-hidden="true"
                  />
                )}
                {philosopher?.school[0] ?? '哲学'} · 通关线 {stage.threshold} 分
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-full min-h-0">
          {/* 草稿恢复提示（可选增强，UX §2.5 / art §8） */}
          {showRecovered && (
            <div className="mx-4 mt-3 inline-flex items-center gap-1.5 text-xs text-campaign-gold-strong bg-campaign-gold/10 border border-campaign-gold/30 rounded-full px-3 py-1 self-start">
              <History className="w-3.5 h-3.5" /> 已恢复上次对谈
            </div>
          )}

          {/* 评分结果面板 */}
          {judgeResult && (
            <div
              className={cn(
                'mx-4 mt-4 p-4 rounded-xl border',
                passed
                  ? 'bg-campaign-gold/10 border-campaign-gold/40 glow-gold'
                  : 'bg-campaign-fail/15 border-campaign-fail/40'
              )}
            >
              {passed && <div className="gold-line mb-3" />}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {passed ? (
                    <Trophy className="w-5 h-5 text-campaign-gold glow-gold" />
                  ) : (
                    <RotateCcw className="w-5 h-5 text-campaign-fail" />
                  )}
                  <span className="font-display text-base">
                    {passed ? '评判通过' : '尚未达标'}
                  </span>
                  <span
                    className={cn(
                      'text-lg font-semibold',
                      passed ? 'text-campaign-gold-strong' : 'text-campaign-fail'
                    )}
                  >
                    {judgeResult.total} / 100
                  </span>
                </div>
                {justCleared && (
                  <span className="flex items-center gap-1 text-xs text-campaign-gold">
                    <CheckCircle2 className="w-4 h-4" /> 已解锁下一关
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {(Object.keys(DIMENSION_LABELS) as (keyof JudgeDimensions)[]).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">
                      {DIMENSION_LABELS[key]}
                    </span>
                    <Progress
                      value={judgeResult.dimensions[key]}
                      trackClassName="bg-campaign-surface/70"
                      indicatorClassName={scoreBarClass(judgeResult.dimensions[key])}
                      className="flex-1 h-1.5"
                    />
                    <span className="text-xs tabular-nums w-6 text-right">
                      {judgeResult.dimensions[key]}
                    </span>
                  </div>
                ))}
              </div>

              {judgeResult.comment && (
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {judgeResult.comment}
                </p>
              )}
            </div>
          )}

          {/* 对谈消息（可靠滚动容器，UX §2.3） */}
          <div className="relative flex-1 min-h-0">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              className="h-full overflow-y-auto dark-scroll px-4"
            >
              <div className="space-y-4 py-4">
                {messages.map((message, index) => (
                  <MessageRow key={index} message={message} philosopher={philosopher} />
                ))}

                {/* 流式输出（在 map 之外，避免重渲染所有消息行） */}
                {isStreaming && streamingText && (
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-campaign-philosopher',
                        philosopher ? ERA_RING_COLOR[philosopher.era] : '',
                        'glow-arcane'
                      )}
                    >
                      {philosopher ? (
                        <img
                          src={philosopher.portrait}
                          alt={philosopher.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <Bot className="w-4 h-4 text-campaign-gold-strong m-auto" />
                      )}
                    </div>
                    <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-campaign-philosopher text-foreground border border-campaign-arcane/30">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" aria-hidden="true">
                        {streamingText}
                        <span className="inline-block w-2 h-4 ml-1 bg-campaign-gold animate-pulse" />
                      </p>
                    </div>
                  </div>
                )}

                {isStreaming && !streamingText && (
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-campaign-philosopher',
                        philosopher ? ERA_RING_COLOR[philosopher.era] : '',
                        'glow-arcane'
                      )}
                    >
                      {philosopher ? (
                        <img
                          src={philosopher.portrait}
                          alt={philosopher.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <Bot className="w-4 h-4 text-campaign-gold-strong m-auto" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-4 py-3 bg-campaign-philosopher rounded-2xl border border-campaign-arcane/30">
                      <Loader2 className="w-4 h-4 animate-spin text-campaign-arcane" />
                      <span className="text-sm text-muted-foreground">思考中...</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex justify-center">
                    <div className="px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm">
                      {error}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 回到底部浮钮（未贴底时显示，UX §2.3） */}
            {!isPinnedToBottom && (
              <button
                type="button"
                onClick={() => {
                  setIsPinnedToBottom(true);
                  scrollToBottom();
                }}
                aria-label="回到底部"
                className="absolute bottom-4 right-4 z-10 h-9 w-9 rounded-full glass-card border border-campaign-gold/30 text-campaign-gold-strong ring-glow-gold flex items-center justify-center"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* 输入区 + 主行动按钮 */}
          <div className="border-t border-[oklch(0.7_0.14_85/0.2)] pt-4 mt-2 px-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    scheduleSave(); // 半写 input 也纳入草稿（决策 C）
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={`向${philosopher?.name ?? '哲学家'}作答...`}
                  className="w-full px-4 py-3 pr-12 bg-campaign-surface/60 border border-[oklch(0.7_0.14_85/0.25)] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-campaign-gold/50 focus:border-campaign-gold transition-all text-sm min-h-[48px] max-h-[120px] placeholder:text-muted-foreground/70"
                  rows={1}
                  disabled={isStreaming || isJudging}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming || isJudging}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all',
                    input.trim() && !isStreaming && !isJudging
                      ? 'bg-campaign-gold text-campaign-user-fg hover:bg-campaign-gold-strong glow-gold'
                      : 'bg-campaign-surface text-muted-foreground cursor-not-allowed'
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                {/* 返回关卡：= 关闭对话框，保留草稿（UX §2.8） */}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="返回关卡"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-campaign-gold-strong border border-[oklch(0.7_0.14_85/0.25)] rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> 返回关卡
                </button>
                {/* 重新开始 / 清空重来：两态按钮（UX §2.6 / 决策 B） */}
                <button
                  type="button"
                  onClick={handleResetClick}
                  disabled={isStreaming || isJudging}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-100 disabled:cursor-not-allowed',
                    confirmClearing
                      ? 'text-destructive border border-destructive/60'
                      : 'text-campaign-fail hover:text-destructive border border-campaign-fail/40 hover:border-destructive/50'
                  )}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  {confirmClearing ? '确认清空？' : '重新开始'}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground hidden sm:block">
                  AI 模拟对战 · 提交后由评委模型五维打分
                </p>
                {/* 提交评判：二次确认弹窗（UX §2.7 / 决策 B） */}
                <button
                  type="button"
                  onClick={handleJudgeClick}
                  disabled={isStreaming || isJudging}
                  className="btn-campaign-primary gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-100"
                >
                  {isJudging ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Swords className="w-4 h-4" />
                  )}
                  {isJudging ? '评判中...' : '提交评判'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 提交二次确认弹窗（复用 Dialog 结构，art §8） */}
        <Dialog
          open={confirmJudgeOpen}
          onOpenChange={setConfirmJudgeOpen}
        >
          <DialogContent
            overlayClassName="campaign-overlay"
            className="campaign-panel rounded-2xl border-campaign-gold/40 glow-gold max-w-md"
            aria-describedby="judge-confirm-desc"
          >
            <DialogHeader>
              <DialogTitle className="font-display text-lg text-campaign-gold-strong">
                确认提交评判？
              </DialogTitle>
              <DialogDescription
                id="judge-confirm-desc"
                className="text-sm text-campaign-gold-strong/90 leading-relaxed"
              >
                提交后评委模型将五维打分并锁分发奖，且可继续对谈再次提交（取最高分）。确定提交吗？
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setConfirmJudgeOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[oklch(0.7_0.14_85/0.3)] px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmJudge}
                disabled={isStreaming || isJudging}
                className="btn-campaign-primary gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-100"
              >
                确认提交
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
