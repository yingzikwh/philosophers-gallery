import type { Philosopher } from '@/data/philosophers';
import { cn } from '@/lib/utils';
import { Portrait } from './Portrait';

function formatYears(p: Philosopher): string {
  const fmt = (y: number) => (y < 0 ? `前${-y}` : `${y}`);
  return `${fmt(p.birthYear)}–${fmt(p.deathYear)}`;
}

/**
 * 对话页「人格卡」小条：在对话弹窗顶部展示该哲学家的身份速览。
 * 字段全部来自现有数据，不新增 59 条数据：
 *  - 一句话简介：国籍 + 核心主张首条
 *  - 学派：school 标签（高亮）
 *  - 立场：themes 标签（代表其关注/立场）
 */
export function PhilosopherPersonaCard({
  philosopher,
  className,
}: {
  philosopher: Philosopher;
  className?: string;
}) {
  const p = philosopher;
  const tagline = `${p.nationality}哲学家 · 主张「${p.coreIdeas?.[0] ?? ''}」`;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-muted/30 p-3',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Portrait
          src={p.portrait}
          alt={p.name}
          className="w-11 h-11 rounded-full object-cover border border-primary/40 flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-base text-foreground">{p.name}</span>
            <span className="text-[11px] text-muted-foreground">{p.nameEn}</span>
            <span className="text-[11px] text-muted-foreground">
              {p.nationality} · {formatYears(p)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed truncate">
            {tagline}
          </p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground/70 w-7 flex-shrink-0">
                学派
              </span>
              {p.school.map((s) => (
                <span
                  key={`s-${s}`}
                  className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[11px]"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground/70 w-7 flex-shrink-0">
                立场
              </span>
              {p.themes.slice(0, 4).map((t) => (
                <span
                  key={`t-${t}`}
                  className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
