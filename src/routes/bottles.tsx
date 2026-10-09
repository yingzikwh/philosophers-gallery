/**
 * 思考漂流瓶（阶段 3 · 最小闭环）
 *
 * 扔瓶（选授权范围）→ 主题匹配 → 哲学家拾瓶而答 → 撤销授权 / 彻底删除。
 * 授权三件套在 UI 上显式呈现：用途范围选择、一键撤销、彻底删除。
 */

import { useState, useEffect, useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Waves as BottleIcon,
  Send,
  Loader2,
  Undo2,
  Trash2,
  ShieldCheck,
  MessagesSquare,
  Lock,
  Globe,
  MailOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  throwBottle,
  fetchBottles,
  fetchWall,
  replyBottle,
  revokeBottle,
  deleteBottle,
  type Bottle,
  type BottleScope,
  type WallBottle,
} from '@/services/bottles';

export const Route = createFileRoute('/bottles')({
  component: BottlesPage,
});

const TEXT_MAX = 2000;

const SCOPE_OPTIONS: {
  value: BottleScope;
  label: string;
  desc: string;
  icon: typeof Lock;
}[] = [
  { value: 'reply-only', label: '仅供回信（推荐）', desc: '不进瓶墙；匹配到这只瓶子的哲学家可读取并回应', icon: MailOpen },
  { value: 'private', label: '仅自己可见', desc: '不进瓶墙；只有你主动邀请的哲学家会读到这只瓶子', icon: Lock },
  { value: 'public-anon', label: '匿名公开', desc: '以笔名进入公共瓶墙展示，并可被拾瓶回应', icon: Globe },
];

const STATUS_META: Record<Bottle['status'], { label: string; cls: string }> = {
  floating: { label: '漂流中', cls: 'border-sky-400/30 text-sky-300 bg-sky-400/10' },
  replied: { label: '已获回应', cls: 'border-primary/30 text-primary bg-primary/10' },
  revoked: { label: '已撤销授权', cls: 'border-border text-muted-foreground bg-muted/40' },
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function BottlesPage() {
  const navigate = useNavigate();

  // 扔瓶表单
  const [text, setText] = useState('');
  const [authorLabel, setAuthorLabel] = useState('');
  const [scope, setScope] = useState<BottleScope>('reply-only');
  const [throwing, setThrowing] = useState(false);

  // 数据
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [wall, setWall] = useState<WallBottle[]>([]);
  const [loading, setLoading] = useState(true);

  // 进行中的操作（防重复点击）
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, pub] = await Promise.all([fetchBottles(), fetchWall()]);
      setBottles(mine);
      setWall(pub);
    } catch (e) {
      toast.error((e as Error).message || '加载漂流瓶失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleThrow = async () => {
    if (!text.trim()) { toast.error('先写下一个思考，再扔进海里'); return; }
    setThrowing(true);
    try {
      const b = await throwBottle({ text, authorLabel, scope });
      toast.success(`瓶子已出海${b.matched.length ? `，匹配到 ${b.matched.map((m) => m.name).join('、')}` : ''}`);
      setText('');
      await load();
    } catch (e) {
      toast.error((e as Error).message || '扔瓶失败');
    } finally {
      setThrowing(false);
    }
  };

  const handleReply = async (id: string, philosopherId?: string) => {
    const key = `reply:${id}:${philosopherId || 'auto'}`;
    setBusyKey(key);
    try {
      const b = await replyBottle(id, philosopherId ? { philosopherId } : undefined);
      const last = b.replies[b.replies.length - 1];
      toast.success(`${last?.philosopherName || '哲学家'}拾起了你的瓶子`);
      await load();
    } catch (e) {
      toast.error((e as Error).message || '回信生成失败');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRevoke = async (b: Bottle) => {
    if (!window.confirm('撤销授权后，正文与回信将立即抹除且不可恢复（仅保留时间与范围等审计记录）。确定撤销？')) return;
    setBusyKey(`revoke:${b.id}`);
    try {
      await revokeBottle(b.id);
      toast.success('授权已撤销，平台已停止使用该瓶内容');
      await load();
    } catch (e) {
      toast.error((e as Error).message || '撤销失败');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('彻底删除后记录不可恢复。确定删除这只瓶子？')) return;
    setBusyKey(`delete:${id}`);
    try {
      await deleteBottle(id);
      toast.success('瓶子已彻底删除');
      await load();
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: '/' })}
            aria-label="返回主页"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> 返回主页
          </button>
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <BottleIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl lg:text-2xl font-semibold text-foreground">
              思考漂流瓶
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              写下一个思考扔进时间之海，懂它的哲学家会拾瓶而答
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-8">
        {/* ===== 扔瓶 ===== */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Send className="w-4 h-4 text-primary" />
              扔一只瓶子
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
              rows={4}
              placeholder="写下你正在想的一个问题或一段思考……（例如：我总在焦虑时间不够用，该怎么安顿内心？）"
              className="w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 resize-y"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <input
                value={authorLabel}
                onChange={(e) => setAuthorLabel(e.target.value.slice(0, 40))}
                placeholder="笔名（可留空，默认「匿名」）"
                className="w-56 rounded-md border border-border/60 bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
              />
              <span className="tabular-nums">{text.length} / {TEXT_MAX}</span>
            </div>

            {/* 授权范围（三件套之一：用途范围） */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                授权用途范围（随时可一键撤销）
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                {SCOPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = scope === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setScope(opt.value)}
                      className={cn(
                        'text-left rounded-lg border p-3 transition-all',
                        active
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border/50 bg-muted/20 hover:border-primary/30',
                      )}
                    >
                      <div className={cn('flex items-center gap-1.5 text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
                        <Icon className="w-4 h-4" /> {opt.label}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                提交即表示你授权本平台在上述范围内使用这段文字；撤销后内容立即抹除。
              </p>
              <Button onClick={handleThrow} disabled={throwing || !text.trim()} className="shrink-0 gap-1.5">
                {throwing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                扔进海里
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* ===== 我的瓶子 ===== */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <BottleIcon className="w-4 h-4 text-primary" /> 我的瓶子
              <Badge variant="outline" className="text-xs tabular-nums">{bottles.length}</Badge>
            </h2>

            {loading && (
              <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            )}
            {!loading && bottles.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">海里还没有你的瓶子。</p>
            )}

            {!loading && bottles.map((b) => {
              const st = STATUS_META[b.status];
              return (
                <Card key={b.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {b.authorLabel} · {fmtTime(b.createdAt)}
                        {b.consent?.revokedAt && ` · 撤销于 ${fmtTime(b.consent.revokedAt)}`}
                      </span>
                    </div>

                    <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', b.status === 'revoked' && 'text-muted-foreground italic')}>
                      {b.status === 'revoked' ? '（授权已撤销，正文与回信已抹除）' : b.text}
                    </p>

                    {b.status !== 'revoked' && (
                      <>
                        {/* 匹配候选：点名字即可请 TA 拾瓶而答 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {b.matched.length === 0 && (
                            <span className="text-xs text-muted-foreground">未匹配到哲学家——换个说法，或直接去对话页找 TA</span>
                          )}
                          {b.matched.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => handleReply(b.id, m.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs text-foreground hover:border-primary/50 hover:text-primary transition-all disabled:opacity-50"
                              title={`请 ${m.name} 拾瓶而答`}
                            >
                              {busyKey === `reply:${b.id}:${m.id}` && <Loader2 className="w-3 h-3 animate-spin" />}
                              <MessagesSquare className="w-3 h-3" />
                              {m.name}
                            </button>
                          ))}
                        </div>

                        {/* 回信 */}
                        {b.replies.map((r) => (
                          <div key={r.id} className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-primary">{r.philosopherName} 的回信</span>
                              <span className="text-muted-foreground">{fmtTime(r.createdAt)}</span>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{r.text}</p>
                          </div>
                        ))}
                      </>
                    )}

                    {/* 授权三件套之二/三：一键撤销、彻底删除 */}
                    <div className="flex items-center gap-2 pt-1">
                      {b.status !== 'revoked' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyKey !== null}
                          onClick={() => handleRevoke(b)}
                          className="gap-1 text-xs"
                        >
                          {busyKey === `revoke:${b.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                          撤销授权
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyKey !== null}
                        onClick={() => handleDelete(b.id)}
                        className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        {busyKey === `delete:${b.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        彻底删除
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          {/* ===== 公共瓶墙 ===== */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> 公共瓶墙
              <Badge variant="outline" className="text-xs tabular-nums">{wall.length}</Badge>
              <span className="text-xs text-muted-foreground font-normal">仅展示「匿名公开」授权的瓶子</span>
            </h2>

            {loading && (
              <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            )}
            {!loading && wall.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                瓶墙上还空着——扔瓶时选「匿名公开」，你的思考就会漂到这里。
              </p>
            )}

            {!loading && wall.map((w) => (
              <Card key={w.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{w.authorLabel}</span>
                    <span>{fmtTime(w.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{w.text}</p>
                  {w.replies.map((r, i) => (
                    <div key={i} className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                      <div className="text-xs font-medium text-primary mb-0.5">{r.philosopherName} 拾瓶而答</div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{r.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
