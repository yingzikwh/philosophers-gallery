import { useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Quote, Lightbulb, Globe, Calendar, ChevronDown, ChevronUp, Check, Heart, Share2, Maximize2, Tag, MessageCircle, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Philosopher } from '@/data/philosophers';
import { philosopherWorks } from '@/data/philosopher-works';
import { philosopherFullTexts } from '@/data/philosopher-fulltexts';
import { getPhilosopherLinks } from '@/data/philosopher-links';
import { TypewriterText } from './TypewriterText';
import { WorkReader } from './WorkReader';
import { PhilosopherChat } from './PhilosopherChat';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EnhancedPhilosopherCardProps {
  philosopher: Philosopher;
  isSelected: boolean;
  isFavorited: boolean;
  onSelect: (id: string) => void;
  onFavorite: (id: string) => void;
  onChat: (id: string) => void;
  index: number;
}

export function EnhancedPhilosopherCard({
  philosopher,
  isSelected,
  isFavorited,
  onSelect,
  onFavorite,
  onChat,
  index,
}: EnhancedPhilosopherCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // 著作展开状态（离线可读，无需 API/网络）
  const [expandedWorks, setExpandedWorks] = useState<Record<number, boolean>>({});
  const toggleWork = (i: number) => setExpandedWorks((p) => ({ ...p, [i]: !p[i] }));

  // 最新消息（联网抓取，失败回退离线快照）
  const [news, setNews] = useState<{ title: string; link: string; source?: string; pubDate?: string; description?: string }[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsOnline, setNewsOnline] = useState<boolean | null>(null);
  const [newsSource, setNewsSource] = useState('');
  const [newsNote, setNewsNote] = useState('');
  const abortNewsRef = useRef<AbortController | null>(null);

  // 原著阅读器
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerWork, setReaderWork] = useState('');

  const fetchNews = useCallback(async () => {
    if (newsLoading) return;
    setNewsLoading(true);
    try {
      const ctrl = new AbortController();
      abortNewsRef.current = ctrl;
      const params = new URLSearchParams({ name: philosopher.name, nameEn: philosopher.nameEn });
      const resp = await fetch(`/api/philosopher-news?${params.toString()}`, { signal: ctrl.signal });
      const data = await resp.json();
      setNews(data.items || []);
      setNewsOnline(data.online);
      setNewsSource(data.source || (data.online ? 'bing' : 'snapshot'));
      setNewsNote(data.note || '');
    } catch (e) {
      setNews([]);
      setNewsOnline(false);
      setNewsNote('加载失败，请稍后重试。');
    } finally {
      setNewsLoading(false);
    }
  }, [philosopher.name, philosopher.nameEn, newsLoading]);

  useEffect(() => {
    return () => { abortNewsRef.current?.abort(); };
  }, []);

  const formatYear = (year: number) => {
    if (year < 0) {
      return `公元前${Math.abs(year)}年`;
    }
    return `${year}年`;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (rafRef.current) return; // Skip if a frame is already pending
    const clientX = e.clientX;
    const clientY = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width - 0.5;
      const y = (clientY - rect.top) / rect.height - 0.5;
      cardRef.current.style.transform = `perspective(1000px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(10px)`;
    });
  };

  const handleMouseLeave = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) translateZ(0)';
    setIsHovered(false);
  };

  return (
    <>
      <div
        ref={cardRef}
        className={cn(
          'group relative rounded-xl overflow-hidden',
          'bg-card/80 backdrop-blur-sm border border-border/50',
          'transition-all duration-300 ease-out',
          'hover:shadow-2xl hover:shadow-primary/10',
          isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
          'animate-fade-in'
        )}
        style={{
          animationDelay: `${Math.min(index * 50, 500)}ms`,
          transformStyle: 'preserve-3d',
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
      >
        {/* Glow Effect */}
        <div
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-500 pointer-events-none',
            isHovered && 'opacity-100'
          )}
          style={{
            background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), oklch(0.65 0.12 85 / 0.15), transparent 40%)`,
          }}
        />

        {/* Action Buttons - Floating Glass Bar */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
          {/* Chat Button */}
          <button
            onClick={() => setIsChatOpen(true)}
            className="group/btn relative w-9 h-9 rounded-xl flex items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-110 bg-black/40 border border-white/20 hover:bg-indigo-500/50 hover:border-indigo-300/60 hover:shadow-lg hover:shadow-indigo-500/40"
            title="对话"
          >
            <MessageCircle className="w-4 h-4 text-white/80 group-hover/btn:text-white transition-colors" />
            <span className="absolute right-full mr-2 px-2 py-1 text-[10px] rounded-md bg-slate-900/95 text-white opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">对话</span>
          </button>

          {/* Favorite Button */}
          <button
            onClick={() => onFavorite(philosopher.id)}
            className={cn(
              'group/btn relative w-9 h-9 rounded-xl flex items-center justify-center backdrop-blur-md transition-all duration-300 border hover:scale-110',
              isFavorited
                ? 'bg-rose-500/50 border-rose-300/60 shadow-lg shadow-rose-500/40'
                : 'bg-black/40 border-white/20 hover:bg-rose-500/40 hover:border-rose-300/50 hover:shadow-lg hover:shadow-rose-500/30'
            )}
            title="收藏"
          >
            <Heart className={cn('w-4 h-4 transition-colors', isFavorited ? 'text-white fill-current' : 'text-white/80 group-hover/btn:text-white')} />
            <span className="absolute right-full mr-2 px-2 py-1 text-[10px] rounded-md bg-slate-900/95 text-white opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">收藏</span>
          </button>

          {/* Compare/Select Button */}
          <button
            onClick={() => onSelect(philosopher.id)}
            className={cn(
              'group/btn relative w-9 h-9 rounded-xl flex items-center justify-center backdrop-blur-md transition-all duration-300 border hover:scale-110',
              isSelected
                ? 'bg-emerald-500/50 border-emerald-300/60 shadow-lg shadow-emerald-500/40'
                : 'bg-black/40 border-white/20 hover:bg-emerald-500/40 hover:border-emerald-300/50 hover:shadow-lg hover:shadow-emerald-500/30'
            )}
            title="思想对比"
          >
            <Check className={cn('w-4 h-4 transition-colors', isSelected ? 'text-white' : 'text-white/80 group-hover/btn:text-white')} />
            <span className="absolute right-full mr-2 px-2 py-1 text-[10px] rounded-md bg-slate-900/95 text-white opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">对比</span>
          </button>
        </div>

        {/* Card Header with Portrait */}
        <div className="relative h-52 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
          <img
            src={philosopher.portrait}
            alt={philosopher.name}
            className={cn(
              'w-full h-full object-cover object-top',
              'transition-transform duration-700',
              isHovered && 'scale-110'
            )}
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          
          {/* Header Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="font-display text-xl font-semibold text-foreground drop-shadow-lg">
              {philosopher.name}
            </h3>
            <p className="text-sm text-muted-foreground font-body">
              {philosopher.nameEn}
            </p>
          </div>

          {/* Key Concepts Tags */}
          {philosopher.keyConcepts && (
            <div className="absolute top-3 left-3 flex flex-wrap gap-1 max-w-[70%]">
              {philosopher.keyConcepts.slice(0, 3).map((concept) => (
                <span
                  key={concept}
                  className="px-2 py-0.5 text-[10px] rounded-full bg-primary/20 text-primary backdrop-blur-sm"
                >
                  {concept}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Card Content */}
        <div className="p-4 space-y-4">
          {/* Basic Info */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatYear(philosopher.birthYear)} - {formatYear(philosopher.deathYear)}
            </span>
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {philosopher.nationality}
            </span>
          </div>

          {/* School Tags */}
          <div className="flex flex-wrap gap-1.5">
            {philosopher.school.slice(0, 2).map((school) => (
              <span
                key={school}
                className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground"
              >
                {school}
              </span>
            ))}
          </div>

          {/* Core Ideas Preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lightbulb className="w-4 h-4 text-primary" />
              <span>核心观点</span>
            </div>
            <ul className="space-y-1.5">
              {philosopher.coreIdeas.slice(0, isExpanded ? undefined : 2).map((idea, i) => (
                <li
                  key={i}
                  className="text-xs text-muted-foreground leading-relaxed pl-2 border-l border-primary/30 hover:border-primary transition-colors"
                >
                  {idea}
                </li>
              ))}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  收起
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  展开
                </>
              )}
            </button>
            <button
              onClick={() => setShowDetail(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              详情
            </button>
          </div>

          {/* Expanded Content */}
          {isExpanded && (
            <div className="space-y-4 pt-2 border-t border-border/50 animate-fade-in">
              {/* Representative Works */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span>代表著作</span>
                </div>
                <ul className="space-y-1">
                  {philosopher.works.slice(0, 4).map((work, i) => (
                    <li key={i} className="text-xs text-muted-foreground pl-2">
                      {work}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Classic Quotes with Typewriter */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowQuote(!showQuote)}
                  className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  <Quote className="w-4 h-4 text-primary" />
                  <span>经典语录</span>
                </button>
                {showQuote && (
                  <div className="relative p-3 bg-muted/50 rounded-lg animate-fade-in">
                    <span className="quote-mark absolute -top-2 left-2 text-3xl">"</span>
                    <p className="text-sm text-foreground italic font-body pl-4">
                      <TypewriterText
                        text={philosopher.quotes[0]}
                        speed={40}
                        showCursor
                      />
                    </p>
                  </div>
                )}
              </div>

              {/* Historical Context */}
              {philosopher.historicalContext && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Tag className="w-4 h-4 text-primary" />
                    <span>历史背景</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {philosopher.historicalContext}
                  </p>
                </div>
              )}

              {/* Official Reference Links */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ExternalLink className="w-4 h-4 text-primary" />
                  <span>参考链接</span>
                </div>
                {(() => {
                  const links = getPhilosopherLinks(philosopher);
                  return (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={links.zhWiki}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        维基百科(中)
                      </a>
                      <a
                        href={links.enWiki}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        维基百科(英)
                      </a>
                      <a
                        href={links.sep}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        SEP哲学百科
                      </a>
                      <a
                        href={links.baidu}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        百度百科
                      </a>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat Dialog */}
      <PhilosopherChat
        philosopher={philosopher}
        isOpen={isChatOpen}
        onOpenChange={setIsChatOpen}
      />

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={(o) => { setShowDetail(o); if (o) fetchNews(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-3">
              <img
                src={philosopher.portrait}
                alt={philosopher.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-primary"
              />
              <div>
                {philosopher.name}
                <span className="text-sm text-muted-foreground ml-2">{philosopher.nameEn}</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatYear(philosopher.birthYear)} - {formatYear(philosopher.deathYear)}
              </span>
              <span className="flex items-center gap-1">
                <Globe className="w-4 h-4" />
                {philosopher.nationality}
              </span>
            </div>

            {/* Key Concepts */}
            {philosopher.keyConcepts && (
              <div className="space-y-2">
                <h4 className="font-display text-sm font-medium text-foreground">关键概念</h4>
                <div className="flex flex-wrap gap-2">
                  {philosopher.keyConcepts.map((concept) => (
                    <span
                      key={concept}
                      className="px-3 py-1 text-sm rounded-full bg-primary/10 text-primary border border-primary/20"
                    >
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Core Ideas */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                核心哲学观点
              </h4>
              <ul className="space-y-2">
                {philosopher.coreIdeas.map((idea, i) => (
                  <li
                    key={i}
                    className="text-sm text-foreground leading-relaxed pl-3 border-l-2 border-primary/30"
                  >
                    {idea}
                  </li>
                ))}
              </ul>
            </div>

            {/* Works（离线可读：点击展开简介/论点/原文节选；可进入完整原著阅读器） */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                代表著作
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">离线可读</span>
              </h4>
              <div className="space-y-2">
                {philosopher.works.map((workTitle, i) => {
                  const w = philosopherWorks[philosopher.id]?.find((wd) => wd.title === workTitle);
                  const fullEntry = philosopherFullTexts[philosopher.id]?.find((f) => f.title === workTitle);
                  const hasFullText = !!fullEntry && !fullEntry.copyright;
                  const isCopyright = !!fullEntry?.copyright;
                  const canRead = hasFullText || !!w;
                  return (
                    <div key={i} className="rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <button
                          onClick={() => toggleWork(i)}
                          className="flex-1 min-w-0 text-left hover:bg-muted/50 transition-colors rounded px-1 -mx-1"
                        >
                          <span className="text-sm text-foreground font-medium">{workTitle}</span>
                        </button>
                        {canRead && (
                          <button
                            onClick={() => { setReaderWork(workTitle); setReaderOpen(true); }}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                          >
                            <BookOpen className="w-3 h-3" /> {hasFullText ? '读原著' : '阅读'}
                          </button>
                        )}
                        {isCopyright && (
                          <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                            版权保护
                          </span>
                        )}
                        <button onClick={() => toggleWork(i)} className="shrink-0">
                          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', expandedWorks[i] && 'rotate-180')} />
                        </button>
                      </div>
                      {expandedWorks[i] && w && (
                        <div className="px-3 pb-3 pt-1 space-y-2 animate-fade-in">
                          <p className="text-xs text-muted-foreground leading-relaxed">{w.summary}</p>
                          {w.keyArguments && w.keyArguments.length > 0 && (
                            <ul className="space-y-1">
                              {w.keyArguments.map((a, j) => (
                                <li key={j} className="text-xs text-foreground/80 pl-2 border-l border-primary/30">{a}</li>
                              ))}
                            </ul>
                          )}
                          {w.excerpt && (
                            <blockquote className="text-xs italic text-foreground/70 border-l-2 border-primary/40 pl-3 py-1 bg-primary/5 rounded-r">
                              {w.excerpt}
                            </blockquote>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quotes */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <Quote className="w-4 h-4 text-primary" />
                经典语录
              </h4>
              <div className="space-y-3">
                {philosopher.quotes.map((quote, i) => (
                  <div key={i} className="relative p-4 bg-muted/50 rounded-lg">
                    <span className="quote-mark absolute -top-1 left-2 text-2xl">"</span>
                    <p className="text-sm text-foreground italic font-body pl-4">
                      {quote}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Context */}
            {philosopher.historicalContext && (
              <div className="space-y-3">
                <h4 className="font-display text-sm font-medium text-foreground">历史背景</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {philosopher.historicalContext}
                </p>
              </div>
            )}

            {/* Influence */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground">思想影响力</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {philosopher.influence}
              </p>
            </div>

            {/* Influence Relations */}
            {(philosopher.influences?.length || philosopher.influenced?.length) && (
              <div className="space-y-3">
                <h4 className="font-display text-sm font-medium text-foreground">思想传承</h4>
                {philosopher.influences && philosopher.influences.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">受其影响：</span>
                    <span className="text-foreground">{philosopher.influences.join('、')}</span>
                  </div>
                )}
                {philosopher.influenced && philosopher.influenced.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">影响后世：</span>
                    <span className="text-foreground">{philosopher.influenced.join('、')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Latest News（联网抓取，失败回退离线快照） */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-primary" />
                最新消息
                {newsOnline === true && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                    {newsSource === 'bing' ? '必应' : newsSource === 'google' ? 'Google' : newsSource === 'wikipedia' ? '维基百科' : '联网'}
                  </span>
                )}
                {newsOnline === false && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400">离线快照</span>
                )}
              </h4>
                <button
                  onClick={fetchNews}
                  disabled={newsLoading}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn('w-3 h-3', newsLoading && 'animate-spin')} />
                  刷新
                </button>
              </div>
              {newsLoading && <p className="text-xs text-muted-foreground">正在获取最新消息…</p>}
              {!newsLoading && news.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {newsNote || '暂无相关新闻，点击右上角“刷新”重试。'}
                </p>
              )}
              {!newsLoading && news.length > 0 && (
                <>
                  {newsNote && newsOnline === false && (
                    <p className="text-[11px] text-amber-500/80">{newsNote}</p>
                  )}
                  <ul className="space-y-2">
                    {news.map((n, i) => (
                      <li key={i} className="text-sm">
                        <a
                          href={n.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:text-primary transition-colors flex items-start gap-1.5"
                        >
                          <ExternalLink className="w-3 h-3 mt-1 shrink-0" />
                          <span>
                            <span className="leading-relaxed">{n.title}</span>
                            {n.description && (
                              <span className="block text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">{n.description}</span>
                            )}
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              {[n.source, n.pubDate && new Date(n.pubDate).toLocaleDateString('zh-CN')].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Official Reference Links */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-medium text-foreground flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-primary" />
                参考链接
              </h4>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://zh.wikipedia.org/wiki/${philosopher.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  维基百科（中文）
                </a>
                <a
                  href={`https://en.wikipedia.org/wiki/${philosopher.nameEn.replace(/\s+/g, '_')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  维基百科（英文）
                </a>
                <a
                  href={`https://plato.stanford.edu/search/search?query=${philosopher.nameEn}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  斯坦福哲学百科 (SEP)
                </a>
                <a
                  href={`https://baike.baidu.com/item/${philosopher.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  百度百科
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 原著阅读器：完整阅读思想家的代表著作 */}
      <WorkReader
        open={readerOpen}
        onOpenChange={setReaderOpen}
        philosopherId={philosopher.id}
        workTitle={readerWork}
        summary={philosopherWorks[philosopher.id]?.find((w) => w.title === readerWork)?.summary}
        excerpt={philosopherWorks[philosopher.id]?.find((w) => w.title === readerWork)?.excerpt}
      />
    </>
  );
}
