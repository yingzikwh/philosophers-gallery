import { useState, useEffect, useMemo, useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Swords,
  Trophy,
  Lock,
  Star,
  Coins,
  Sparkles,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { philosophers } from '@/data/philosophers';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  fetchStages,
  fetchProgress,
  type Stage,
  type StagesResponse,
  type ProgressResponse,
} from '@/services/campaign';
import { CampaignChallenge } from '@/components/CampaignChallenge';

export const Route = createFileRoute('/campaign')({
  component: CampaignPage,
});

function CampaignPage() {
  const navigate = useNavigate();
  const [stages, setStages] = useState<Stage[]>([]);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<Stage | null>(null);
  const [isChallengeOpen, setIsChallengeOpen] = useState(false);

  const philosopherMap = useMemo(() => {
    const m = new Map<string, (typeof philosophers)[number]>();
    philosophers.forEach((p) => m.set(p.id, p));
    return m;
  }, []);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [stagesRes, progressRes] = await Promise.all([
        fetchStages(),
        fetchProgress(),
      ]);
      setStages(stagesRes.stages);
      setProgress(progressRes);
    } catch (e) {
      setError((e as Error).message || '加载关卡失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 按章节分组（保持 stages 数组顺序）
  const chapters = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Stage[]>();
    stages.forEach((s) => {
      if (!map.has(s.chapter)) {
        map.set(s.chapter, []);
        order.push(s.chapter);
      }
      map.get(s.chapter)!.push(s);
    });
    return order.map((c) => ({ chapter: c, stages: map.get(c)! }));
  }, [stages]);

  const totalStages = progress?.totalStages ?? stages.length;
  const clearedCount = progress?.clearedCount ?? 0;
  const progressPct = totalStages ? Math.round((clearedCount / totalStages) * 100) : 0;

  const openChallenge = (stage: Stage) => {
    if (stage.status === 'locked') return;
    setActiveStage(stage);
    setIsChallengeOpen(true);
  };

  const handleCleared = useCallback(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 返回主页：直达 /，不清除任何草稿（UX §2.9） */}
              <button
                type="button"
                onClick={() => navigate({ to: '/' })}
                aria-label="返回主页"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-campaign-gold-strong transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" /> 返回主页
              </button>
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Swords className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-xl lg:text-2xl font-semibold text-foreground gradient-text-gold">
                  思辨闯关
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  与哲学先贤论道，逐关解锁思想疆域
                </p>
              </div>
            </div>

            {/* 总进度 */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end gap-1 w-48">
                <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
                  <span>通关进度</span>
                  <span className="tabular-nums">
                    {clearedCount} / {totalStages}
                  </span>
                </div>
                <Progress value={progressPct} className="w-full h-2" />
              </div>
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 text-primary bg-primary/10"
              >
                <Coins className="w-3.5 h-3.5" />
                TP {progress?.totals.tp ?? 0}
              </Badge>
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 text-primary bg-primary/10"
              >
                <Sparkles className="w-3.5 h-3.5" />
                IN {progress?.totals.in ?? 0}
              </Badge>
            </div>
          </div>

          {/* 移动端进度条 */}
          <div className="sm:hidden mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>通关进度</span>
              <span className="tabular-nums">
                {clearedCount} / {totalStages}
              </span>
            </div>
            <Progress value={progressPct} className="w-full h-2" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            加载关卡中...
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={loadData}>
              重试
            </Button>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-10">
            {chapters.map(({ chapter, stages: chapterStages }) => (
              <section key={chapter}>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-4 h-4 text-primary" />
                  <h2 className="font-display text-lg text-foreground">{chapter}</h2>
                </div>
                <div className="grid gap-4 lg:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {chapterStages.map((stage) => (
                    <StageCard
                      key={stage.id}
                      stage={stage}
                      philosopher={philosopherMap.get(stage.philosopherId)}
                      onOpen={() => openChallenge(stage)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {activeStage && (
        <CampaignChallenge
          stage={activeStage}
          isOpen={isChallengeOpen}
          onOpenChange={setIsChallengeOpen}
          onCleared={handleCleared}
        />
      )}
    </div>
  );
}

interface StageCardProps {
  stage: Stage;
  philosopher?: (typeof philosophers)[number];
  onOpen: () => void;
}

function StageCard({ stage, philosopher, onOpen }: StageCardProps) {
  const locked = stage.status === 'locked';
  const cleared = stage.status === 'cleared';

  return (
    <Card
      className={cn(
        'flex flex-col transition-all',
        locked
          ? 'opacity-60 bg-card/60 border-border/30'
          : 'bg-card border-border/50 hover:border-primary/40 hover:shadow-lg',
        !locked && 'cursor-pointer'
      )}
      onClick={() => !locked && onOpen()}
    >
      <CardContent className="p-5 flex flex-col gap-3 flex-1">
        {/* 头部：头像 + 哲学家 + 状态 */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            {philosopher ? (
              <img
                src={philosopher.portrait}
                alt={philosopher.name}
                className="w-12 h-12 rounded-full object-cover border border-border/50"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Swords className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            {cleared && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-base text-foreground truncate">
                {philosopher?.name ?? stage.philosopherId}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {philosopher?.school[0] ?? '哲学'} · {stage.title}
            </p>
          </div>

          <StatusBadge status={stage.status ?? 'locked'} />
        </div>

        {/* 题目预览 */}
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 min-h-[3.5rem]">
          {stage.topic}
        </p>

        {/* 难度 */}
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                'w-3.5 h-3.5',
                i < stage.difficulty
                  ? 'fill-primary text-primary'
                  : 'text-muted-foreground/40'
              )}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            难度 {stage.difficulty} · 通关线 {stage.threshold}
          </span>
        </div>

        {/* 底部：奖励 + 最佳分 + 按钮 */}
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 text-primary">
              <Coins className="w-3.5 h-3.5" /> TP {stage.reward.tp}
            </span>
            <span className="flex items-center gap-1 text-primary">
              <Sparkles className="w-3.5 h-3.5" /> IN {stage.reward.in}
            </span>
            {stage.bestScore !== undefined && (
              <span className="text-muted-foreground">最佳 {stage.bestScore}</span>
            )}
          </div>

          {locked ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5" /> 锁定
            </span>
          ) : (
            <Button size="sm" variant={cleared ? 'outline' : 'default'} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              {cleared ? '再战' : '挑战'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Stage['status'] }) {
  if (status === 'cleared') {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-primary/30 text-primary bg-primary/10">
        <CheckCircle2 className="w-3 h-3" /> 已通关
      </Badge>
    );
  }
  if (status === 'available') {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-primary/30 text-foreground">
        <Swords className="w-3 h-3 text-primary" /> 可挑战
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
      <Lock className="w-3 h-3" /> 锁定
    </Badge>
  );
}
