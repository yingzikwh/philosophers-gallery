import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, BookOpen, Loader2, Wifi, WifiOff, FileText, List, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { philosopherFullTexts, type FullWork } from '@/data/philosopher-fulltexts';

/** 极简 IndexedDB 文本缓存（key -> text），用于离线重读 */
const DB_NAME = 'philosopher-works';
const STORE = 'texts';
function idbGet(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const tx = req.result.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        tx.onsuccess = () => resolve((tx.result as string) || null);
        tx.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
function idbSet(key: string, val: string): void {
  try {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      req.result.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
    };
  } catch {}
}

interface WorkReaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  philosopherId: string;
  workTitle: string;
  summary?: string;
  excerpt?: string;
}

interface Chapter {
  title: string;
  content: string;
}

function splitChapters(text: string): Chapter[] {
  const lines = text.split('\n');
  const chapters: Chapter[] = [];
  let cur: Chapter | null = null;
  for (const line of lines) {
    if (/^#\s+/.test(line.trim())) {
      if (cur) chapters.push(cur);
      cur = { title: line.trim().replace(/^#\s+/, ''), content: '' };
    } else if (cur) {
      cur.content += (cur.content ? '\n' : '') + line;
    } else {
      if (!cur) {
        cur = { title: '前言', content: '' };
        chapters.push(cur);
      }
      cur.content += (cur.content ? '\n' : '') + line;
    }
  }
  if (cur) chapters.push(cur);
  return chapters.map((c) => ({ ...c, content: c.content.trim() }));
}

export function WorkReader({ open, onOpenChange, philosopherId, workTitle, summary, excerpt }: WorkReaderProps) {
  const full = useMemo<FullWork | undefined>(
    () => philosopherFullTexts[philosopherId]?.find((w) => w.title === workTitle),
    [philosopherId, workTitle]
  );

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [activeCh, setActiveCh] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const chapters = useMemo(() => (text ? splitChapters(text) : []), [text]);

  const loadText = useCallback(async () => {
    if (!full || !open) return;
    if (full.copyright) return;
    if (full.fullText) {
      setText(full.fullText);
      return;
    }
    if (!full.source) return;

    const s = full.source;
    const key = `work_${philosopherId}_${workTitle}`;
    setLoading(true);
    setError('');
    try {
      const cachedText = await idbGet(key);
      if (cachedText) {
        setText(cachedText);
        setCached(true);
        return;
      }
      const params = new URLSearchParams({
        type: s.type,
        query: s.query,
        lang: s.lang,
      });
      const resp = await fetch(`/api/philosopher-work?${params.toString()}`);
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || '抓取失败');
      setText(data.text || '');
      setCached(!!data.cached);
      if (data.text) idbSet(key, data.text);
    } catch (e: any) {
      setError(e?.message || '联网获取失败，且本地无缓存。');
    } finally {
      setLoading(false);
    }
  }, [full, open, philosopherId, workTitle]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setText('');
    setCached(false);
    setActiveCh(0);
    loadText();
  }, [open, loadText, retryCount]);

  if (!open) return null;

  const handleRetry = () => setRetryCount((c) => c + 1);

  const scrollTo = (i: number) => {
    setActiveCh(i);
    setShowToc(false);
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-ch="${i}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isCopyright = full?.copyright;
  const hasText = !!text;
  const hasFallback = !!(summary || excerpt);

  const sourceLabel = isCopyright
    ? '版权保护期内 · 仅提供概要'
    : full?.fullText
    ? '内置完整公版全文 · 离线可读'
    : cached
    ? '本地缓存全文 · 离线可读'
    : full?.source
    ? `来源：${full.source.note}`
    : hasFallback
    ? '离线可读 · 内容概要/节选'
    : '著作原文';

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="relative w-full h-full sm:max-w-5xl sm:h-[92vh] bg-card border border-border/60 rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border/50 bg-gradient-to-r from-amber-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold text-foreground truncate">{workTitle}</div>
              <div className="text-[11px] text-muted-foreground truncate">{sourceLabel}</div>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors shrink-0"
            aria-label="关闭"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* 正文区 */}
        <div className="flex-1 overflow-hidden flex">
          {/* 章节导航（宽屏侧栏） */}
          {chapters.length > 1 && (
            <aside className="hidden md:flex w-56 shrink-0 border-r border-border/40 flex-col">
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/40 flex items-center gap-1.5">
                <List className="w-3.5 h-3.5" /> 目录
              </div>
              <nav className="flex-1 overflow-y-auto py-2">
                {chapters.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => scrollTo(i)}
                    className={cn(
                      'w-full text-left px-4 py-1.5 text-sm transition-colors border-l-2',
                      activeCh === i
                        ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/5'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                  >
                    {c.title}
                  </button>
                ))}
              </nav>
            </aside>
          )}

          {/* 阅读区 */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-5 sm:px-10 py-6 leading-loose">
            {loading && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-20">
                <Loader2 className="w-5 h-5 animate-spin" /> 正在从权威公版书库获取全文…
              </div>
            )}

            {!loading && error && (
              <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p>{error}</p>
                    <button
                      onClick={handleRetry}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> 重新获取
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isCopyright && !hasText && (
              <div className="mb-6 rounded-lg border border-zinc-500/30 bg-zinc-500/10 p-4 text-sm">
                <p className="font-medium text-zinc-600 dark:text-zinc-300">版权保护期内作品</p>
                <p className="mt-1 text-muted-foreground">{full?.note}</p>
              </div>
            )}

            {(hasText || hasFallback) && (
              <article className="max-w-2xl mx-auto">
                {hasText ? (
                  <>
                    {/* 窄屏章节下拉 */}
                    {chapters.length > 1 && (
                      <div className="md:hidden mb-6">
                        <button
                          onClick={() => setShowToc((v) => !v)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/50 text-sm bg-muted/30"
                        >
                          <span className="flex items-center gap-1.5"><List className="w-4 h-4" /> {chapters[activeCh]?.title}</span>
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        {showToc && (
                          <div className="mt-2 rounded-lg border border-border/50 bg-card overflow-hidden">
                            {chapters.map((c, i) => (
                              <button
                                key={i}
                                onClick={() => scrollTo(i)}
                                className={cn(
                                  'w-full text-left px-3 py-2 text-sm border-b border-border/30 last:border-0',
                                  activeCh === i ? 'text-amber-600 dark:text-amber-400 bg-amber-500/5' : 'text-muted-foreground'
                                )}
                              >
                                {c.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {chapters.map((c, i) => (
                      <section key={i} data-ch={i} className={cn(i > 0 && 'mt-8')}>
                        {chapters.length > 1 && (
                          <h3 className="font-display text-xl font-semibold text-foreground mb-3 pb-2 border-b border-border/40">
                            {c.title}
                          </h3>
                        )}
                        <p className="text-[15px] sm:text-base text-foreground/90 whitespace-pre-line">{c.content}</p>
                      </section>
                    ))}

                    <div className="mt-10 pt-4 border-t border-border/40 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {cached ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                      {cached ? '本地缓存文本（离线可读）' : '来源：维基文库 / 古登堡（公共领域权威底本）'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-4">
                      {summary && <p className="text-[15px] sm:text-base text-foreground/90 leading-loose">{summary}</p>}
                      {excerpt && (
                        <blockquote className="text-[15px] sm:text-base italic text-foreground/80 border-l-2 border-primary/40 pl-4 py-2 bg-primary/5 rounded-r">
                          “{excerpt}”
                        </blockquote>
                      )}
                    </div>
                    <p className="mt-6 text-xs text-muted-foreground">
                      该著作暂无完整公版全文，以上为内容概要/节选。若已联网，可点击上方「重新获取」尝试从权威公版书库拉取全文。
                    </p>
                  </>
                )}
              </article>
            )}

            {!hasText && !hasFallback && !isCopyright && (
              <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-3">
                <FileText className="w-8 h-8 opacity-30" />
                <p>该著作暂无可读内容。</p>
              </div>
            )}
          </div>
        </div>

        {/* 底部退出栏（亮色按钮） */}
        <div className="shrink-0 border-t border-border/50 px-4 py-3 bg-card/95 flex items-center justify-center gap-3">
          <button
            onClick={handleRetry}
            disabled={loading || !full?.source}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-foreground bg-muted/60 hover:bg-muted/80 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> 重新获取
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-white text-black dark:bg-zinc-100 dark:text-black font-medium text-sm shadow-lg hover:bg-zinc-100 dark:hover:bg-white transition-colors"
          >
            <X className="w-4 h-4" /> 退出阅读
          </button>
        </div>
      </div>
    </div>
  );
}
