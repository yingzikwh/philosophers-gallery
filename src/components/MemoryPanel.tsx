/**
 * 记忆与隐私面板（阶段 4）
 *
 * 从对话窗头部打开的嵌套 Dialog。集中管理四类授权开关（默认全 off）、
 * 画像（称呼 / 钉住的事实）、一键撤销 / 彻底删除，以及授权审计时间线。
 * 隐私优先：所有数据只存本地 DATA_DIR/memory/，绝不入库、不上云。
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, User as UserIcon, Share2, FileText, ShieldCheck,
  Undo2, Trash2, Loader2, Plus, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  fetchConsent, fetchProfile, setScope, revokeScope, deleteScope, updateProfile,
  type MemoryConsent, type MemoryProfile, type MemoryScope,
} from '@/services/memory';

interface MemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 面板关闭后通知外层刷新记忆状态（对话窗据此决定是否自动提炼） */
  onAfterChange?: () => void;
}

const SCOPE_META: {
  scope: MemoryScope; label: string; desc: string; icon: typeof Brain;
  sensitive?: boolean; soon?: boolean;
}[] = [
  { scope: 'profile', label: '用户画像', desc: '称呼、思想倾向、你钉住的事实——让哲学家「认得你」', icon: UserIcon },
  { scope: 'episodic', label: '情景记忆', desc: '跨会话记住你们谈过什么，下次自然延续话题', icon: Brain },
  { scope: 'crossPhilosopher', label: '跨哲学家共享', desc: '开启后，一位哲学家知道的你，会共享给其他哲学家', icon: Share2, sensitive: true },
  { scope: 'lifeData', label: '人生数据', desc: '上传自传 / 人生时间线等敏感资料（本阶段仅本地文本）', icon: FileText, sensitive: true, soon: true },
];

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function MemoryPanel({ open, onOpenChange, onAfterChange }: MemoryPanelProps) {
  const [consent, setConsent] = useState<MemoryConsent | null>(null);
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [newFact, setNewFact] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([fetchConsent(), fetchProfile()]);
      setConsent(c);
      setProfile(p);
      setName(p.displayName || '');
    } catch (e) {
      toast.error((e as Error).message || '加载记忆设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { setLoading(true); load(); }
  }, [open, load]);

  const changed = useCallback(() => { onAfterChange?.(); }, [onAfterChange]);

  const handleToggle = async (scope: MemoryScope, label: string, sensitive?: boolean) => {
    if (!consent) return;
    const next = consent.scopes[scope] !== 'on';
    if (next && sensitive && !window.confirm(`「${label}」较为敏感，开启后相关内容会被用于对话注入。确定开启？`)) return;
    setBusy(scope);
    try {
      setConsent(await setScope(scope, next));
      toast.success(next ? `已开启${label}` : `已关闭${label}（数据保留，仅停止注入）`);
      changed();
    } catch (e) {
      toast.error((e as Error).message || '设置失败');
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async (scope: MemoryScope, label: string) => {
    if (!window.confirm(`撤销「${label}」将立即抹除其全部内容（仅保留审计时间），不可恢复。确定撤销？`)) return;
    setBusy(scope);
    try {
      setConsent(await revokeScope(scope));
      await load();
      toast.success(`已撤销并抹除「${label}」内容`);
      changed();
    } catch (e) {
      toast.error((e as Error).message || '撤销失败');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (scope: MemoryScope, label: string) => {
    if (!window.confirm(`彻底删除「${label}」的全部数据，不可恢复。确定删除？`)) return;
    setBusy(scope);
    try {
      setConsent(await deleteScope(scope));
      await load();
      toast.success(`已彻底删除「${label}」`);
      changed();
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
    } finally {
      setBusy(null);
    }
  };

  const handleSaveName = async () => {
    setBusy('name');
    try {
      setProfile(await updateProfile({ displayName: name }));
      toast.success('称呼已保存');
    } catch (e) {
      toast.error((e as Error).message || '保存失败');
    } finally {
      setBusy(null);
    }
  };

  const handleAddFact = async () => {
    if (!newFact.trim() || !profile) return;
    setBusy('facts');
    try {
      setProfile(await updateProfile({ facts: [...profile.facts, { text: newFact.trim() }] }));
      setNewFact('');
      toast.success('已钉住这条事实');
    } catch (e) {
      toast.error((e as Error).message || '添加失败');
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveFact = async (id: string) => {
    if (!profile) return;
    setBusy('facts');
    try {
      setProfile(await updateProfile({ facts: profile.facts.filter((f) => f.id !== id) }));
    } catch (e) {
      toast.error((e as Error).message || '移除失败');
    } finally {
      setBusy(null);
    }
  };

  const audit = consent?.audit?.slice(-8).reverse() ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] overflow-hidden bg-card border-border/50 flex flex-col">
        <DialogHeader className="border-b border-border/50 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Brain className="w-5 h-5 text-primary" /> 记忆与隐私
          </DialogTitle>
          <p className="text-xs text-white/60 mt-1">
            默认全部关闭；开启后哲学家才会「记得你」。数据只存本地，绝不入库、不上云。
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-3" scrollbarType="always">
          <div className="space-y-5 py-2">
            {loading ? (
              <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <>
                {/* ===== 授权开关（L4 治理）===== */}
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" /> 授权开关（随时可撤销 / 删除）
                  </div>
                  <div className="space-y-2">
                    {SCOPE_META.map((meta) => {
                      const Icon = meta.icon;
                      const on = consent?.scopes[meta.scope] === 'on';
                      return (
                        <Card key={meta.scope}>
                          <CardContent className="p-3 flex items-start gap-3">
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', on ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{meta.label}</span>
                                {meta.soon && <Badge variant="outline" className="text-[10px]">即将推出</Badge>}
                                {meta.sensitive && !meta.soon && <Badge variant="outline" className="text-[10px] border-amber-400/30 text-amber-300">敏感</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{meta.desc}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Button
                                  variant="outline" size="sm"
                                  disabled={busy !== null || meta.soon}
                                  onClick={() => handleRevoke(meta.scope, meta.label)}
                                  className="gap-1 text-xs"
                                >
                                  {busy === meta.scope ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />} 撤销
                                </Button>
                                <Button
                                  variant="outline" size="sm"
                                  disabled={busy !== null || meta.soon}
                                  onClick={() => handleDelete(meta.scope, meta.label)}
                                  className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-3 h-3" /> 删除
                                </Button>
                              </div>
                            </div>
                            {/* 开关 */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              disabled={busy !== null || meta.soon}
                              onClick={() => handleToggle(meta.scope, meta.label, meta.sensitive)}
                              title={meta.soon ? '人生数据接入将在后续阶段提供' : (on ? '点击关闭' : '点击开启')}
                              className={cn(
                                'relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed',
                                on ? 'bg-primary' : 'bg-muted-foreground/30',
                              )}
                            >
                              <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
                            </button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>

                {/* ===== 画像（L2）===== */}
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <UserIcon className="w-3.5 h-3.5 text-primary" /> 我的画像
                    {consent?.scopes.profile !== 'on' && <span className="text-[10px] font-normal">（未开启「用户画像」，以下不会注入对话）</span>}
                  </div>
                  <Card>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value.slice(0, 40))}
                          placeholder="希望哲学家怎么称呼你？"
                          className="flex-1 rounded-md border border-border/60 bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
                        />
                        <Button size="sm" disabled={busy !== null} onClick={handleSaveName} className="shrink-0">保存</Button>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">钉住的事实（长期记住）</div>
                        {(profile?.facts ?? []).map((f) => (
                          <div key={f.id} className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5">
                            <span className="flex-1 text-sm text-foreground">{f.text}</span>
                            <button type="button" onClick={() => handleRemoveFact(f.id)} disabled={busy !== null} className="text-muted-foreground hover:text-destructive disabled:opacity-50" title="移除">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            value={newFact}
                            onChange={(e) => setNewFact(e.target.value.slice(0, 200))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFact(); } }}
                            placeholder="例如：我是一名教师"
                            className="flex-1 rounded-md border border-border/60 bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
                          />
                          <Button variant="outline" size="sm" disabled={busy !== null || !newFact.trim()} onClick={handleAddFact} className="gap-1 shrink-0">
                            <Plus className="w-3.5 h-3.5" /> 添加
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>

                {/* ===== 审计时间线 ===== */}
                <section className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">授权审计</div>
                  <Card>
                    <CardContent className="p-3">
                      {audit.length === 0 ? (
                        <p className="text-xs text-muted-foreground">暂无授权变更记录。</p>
                      ) : (
                        <ul className="space-y-1">
                          {audit.map((a, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">
                                {a.action === 'grant' ? '开启' : a.action === 'revoke' ? '撤销' : '删除'}
                              </Badge>
                              <span>{SCOPE_META.find((m) => m.scope === a.scope)?.label || a.scope}</span>
                              <span className="ml-auto tabular-nums">{fmtTime(a.at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
