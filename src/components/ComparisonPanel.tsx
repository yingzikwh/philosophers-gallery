import { useState, useRef, useEffect } from 'react';
import { X, Scale, Quote, Lightbulb, BookOpen, MessageCircle, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Philosopher } from '@/data/philosophers';
import { requestPhilosopherChat } from '@/services/philosopherAI';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const EXAMPLE_QUESTIONS = ['什么是幸福？', '人应当如何生活？', '自由意志存在吗？', '什么是正义？'];

interface ComparisonPanelProps {
  selectedIds: string[];
  philosophers: Philosopher[];
  onRemove: (id: string) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComparisonPanel({
  selectedIds,
  philosophers,
  onRemove,
  onClear,
  open,
  onOpenChange,
}: ComparisonPanelProps) {
  const [sharedQuestion, setSharedQuestion] = useState('');
  const [answers, setAnswers] = useState<Record<string, { text: string; loading: boolean; error?: string }>>({});
  const abortRef = useRef<AbortController | null>(null);

  const selectedPhilosophers = philosophers.filter((p) => selectedIds.includes(p.id));

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const handleAskSharedQuestion = () => {
    const question = sharedQuestion.trim();
    if (selectedIds.length < 2 || !question) return;

    // 中断上一批作答，开始新一批
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    selectedPhilosophers.forEach((p) => {
      setAnswers((prev) => ({ ...prev, [p.id]: { text: '', loading: true } }));
    });

    selectedPhilosophers.forEach((p) => {
      requestPhilosopherChat(
        p.id,
        [{ role: 'user', content: question }],
        (chunk) => {
          setAnswers((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], text: (prev[p.id]?.text ?? '') + chunk },
          }));
        },
        { signal: controller.signal }
      )
        .then(() => {
          if (abortRef.current !== controller) return; // 已被新一批取代，忽略
          setAnswers((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], loading: false, error: undefined },
          }));
        })
        .catch((err: unknown) => {
          if (abortRef.current !== controller) return; // 已被新一批取代，忽略
          if ((err as Error)?.name === 'AbortError') return;
          setAnswers((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], loading: false, error: (err as Error).message },
          }));
        });
    });
  };

  const formatYear = (year: number) => {
    if (year < 0) {
      return `公元前${Math.abs(year)}`;
    }
    return `${year}`;
  };

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating comparison trigger — bottom-right FAB/pill (hidden while panel is open) */}
      {!open && (
      <div className="fixed bottom-6 right-6 z-[60]">
        <div className="flex items-center gap-2 pl-2 pr-1.5 py-1.5 bg-card/95 backdrop-blur-md border border-primary/40 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:border-primary/60 transition-all duration-300 group">
          {/* Scale icon + avatar stack */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-primary/10">
              <Scale className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex -space-x-2">
              {selectedPhilosophers.slice(0, 3).map((philosopher) => (
                <img
                  key={philosopher.id}
                  src={philosopher.portrait}
                  alt={philosopher.name}
                  className="w-7 h-7 rounded-full object-cover border-2 border-card"
                />
              ))}
              {selectedIds.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-primary/15 border-2 border-card flex items-center justify-center text-[10px] text-primary font-medium">
                  +{selectedIds.length - 3}
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-foreground px-1">
              {selectedIds.length}
            </span>
          </div>

          {/* Open button */}
          <button
            onClick={() => onOpenChange(true)}
            disabled={selectedIds.length < 2}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
              selectedIds.length >= 2
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {selectedIds.length >= 2 ? '打开对比' : '需2位'}
          </button>

          {/* Clear */}
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-destructive/20 hover:text-destructive rounded-full transition-colors"
            title="清空选择"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
      )}

      {/* Comparison Sheet — slides in from the right */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          overlayClassName="bg-transparent pointer-events-none"
          className="w-full sm:w-[36rem] lg:w-[42rem] xl:w-[44rem] sm:max-w-none h-full bg-card/95 backdrop-blur-xl border-l border-border/50 p-0 flex flex-col shadow-2xl z-[55]"
        >
          {/* Fixed header */}
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border/50 shrink-0">
            <Scale className="w-5 h-5 text-primary" />
            <SheetTitle className="font-display text-lg text-foreground">思想家对比</SheetTitle>
            <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">
              {selectedPhilosophers.length} 位
            </span>
          </div>

          {/* Scrollable content — wheel to browse selected philosophers */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Same Question, Different Views */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" />
                同一问题 · 不同看法
              </h4>
              <div className="p-3 bg-muted/30 border border-border/30 rounded-lg space-y-3">
                <textarea
                  value={sharedQuestion}
                  onChange={(e) => setSharedQuestion(e.target.value)}
                  placeholder={`向 ${selectedPhilosophers.length} 位思想家提出同一个问题…`}
                  rows={2}
                  className="w-full resize-none rounded-md bg-background/60 border border-border/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSharedQuestion(q)}
                      className="px-2.5 py-1 text-xs rounded-full bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAskSharedQuestion}
                  disabled={selectedIds.length < 2 || !sharedQuestion.trim()}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all',
                    selectedIds.length >= 2 && sharedQuestion.trim()
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  )}
                >
                  <Send className="w-4 h-4" />
                  请他们作答
                </button>
              </div>

              {selectedPhilosophers.length > 0 && (
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}
                >
                  {selectedPhilosophers.map((p) => {
                    const ans = answers[p.id];
                    return (
                      <div
                        key={p.id}
                        className="p-3 bg-muted/30 border border-border/30 rounded-lg space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={p.portrait}
                            alt={p.name}
                            className="w-8 h-8 rounded-full object-cover border border-border/50"
                          />
                          <h5 className="font-display text-sm font-semibold text-primary">
                            {p.name}
                          </h5>
                        </div>
                        {ans?.loading && !ans?.text && !ans?.error && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            思考中…
                          </div>
                        )}
                        {ans?.error && (
                          <p className="text-sm text-destructive">
                            {p.name} 作答失败：{ans.error}
                          </p>
                        )}
                        {ans?.text && (
                          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                            {ans.text}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Basic Info Comparison */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                基本信息
              </h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-muted-foreground font-medium">对比项</TableHead>
                      {selectedPhilosophers.map((p) => (
                        <TableHead key={p.id} className="text-foreground font-display">
                          {p.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="border-border/30">
                      <TableCell className="text-muted-foreground">生卒年份</TableCell>
                      {selectedPhilosophers.map((p) => (
                        <TableCell key={p.id} className="text-foreground">
                          {formatYear(p.birthYear)} - {formatYear(p.deathYear)}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow className="border-border/30">
                      <TableCell className="text-muted-foreground">国籍</TableCell>
                      {selectedPhilosophers.map((p) => (
                        <TableCell key={p.id} className="text-foreground">
                          {p.nationality}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow className="border-border/30">
                      <TableCell className="text-muted-foreground">哲学流派</TableCell>
                      {selectedPhilosophers.map((p) => (
                        <TableCell key={p.id} className="text-foreground">
                          {p.school.join('、')}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow className="border-border/30">
                      <TableCell className="text-muted-foreground">代表著作</TableCell>
                      {selectedPhilosophers.map((p) => (
                        <TableCell key={p.id} className="text-foreground text-xs">
                          {p.works.slice(0, 3).join('、')}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Core Ideas Comparison */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                核心观点对比
              </h4>
              <div className="grid gap-4">
                {selectedPhilosophers.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-muted/30 rounded-lg border border-border/30"
                  >
                    <h5 className="font-display text-sm font-semibold text-primary mb-3">
                      {p.name}
                    </h5>
                    <ul className="space-y-2">
                      {p.coreIdeas.slice(0, 3).map((idea, i) => (
                        <li
                          key={i}
                          className="text-sm text-foreground leading-relaxed pl-3 border-l-2 border-primary/30"
                        >
                          {idea}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Quotes Comparison */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <Quote className="w-4 h-4 text-primary" />
                经典语录
              </h4>
              <div className="grid gap-4">
                {selectedPhilosophers.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-muted/30 rounded-lg border border-border/30 relative"
                  >
                    <span className="quote-mark absolute -top-1 left-2 text-3xl">"</span>
                    <p className="text-sm text-foreground italic font-body pl-4 pt-2">
                      {p.quotes[0]}
                    </p>
                    <p className="text-xs text-muted-foreground text-right mt-2">
                      —— {p.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Influence Comparison */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                思想影响力
              </h4>
              <div className="grid gap-4">
                {selectedPhilosophers.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-muted/30 rounded-lg border border-border/30"
                  >
                    <h5 className="font-display text-sm font-semibold text-primary mb-2">
                      {p.name}
                    </h5>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {p.influence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
