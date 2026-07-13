import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { GitBranch, ArrowRight, ZoomIn, ZoomOut, Maximize2, ExternalLink, Home } from 'lucide-react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, type Simulation } from 'd3-force';
import { philosophers, influenceRelations } from '@/data/philosophers';
import { getPhilosopherLinks } from '@/data/philosopher-links';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface InfluenceGraphProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const VIEW_W = 1400;
const VIEW_H = 950;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

const ERA_COLORS: Record<string, string> = {
  ancient: '#F0C060',
  modern: '#5BA3E8',
  contemporary: '#B088E0',
};

const ERA_LABELS: Record<string, string> = {
  ancient: '古代',
  modern: '近代',
  contemporary: '现代',
};

const RELATION_COLORS: Record<string, string> = {
  direct: '#F0C060',
  critical: '#E0556B',
  indirect: '#5BA3E8',
  parallel: '#B088E0',
};

const RELATION_LABELS: Record<string, string> = {
  direct: '直接影响',
  critical: '批判继承',
  indirect: '间接影响',
  parallel: '平行发展',
};

// Force simulation types
interface ForceNode {
  id: string;
  name: string;
  nameEn: string;
  era: string;
  portrait: string;
  school: string[];
  connCount: number;
  x: number;
  y: number;
}

interface ForceLink {
  source: string | ForceNode;
  target: string | ForceNode;
  type: string;
}

function curvePath(x1: number, y1: number, x2: number, y2: number, offset: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  return `M ${x1} ${y1} Q ${mx + px * offset} ${my + py * offset} ${x2} ${y2}`;
}

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function InfluenceGraph({ isOpen, onOpenChange }: InfluenceGraphProps) {
  const [selectedPhilosopher, setSelectedPhilosopher] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isReady, setIsReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<any>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Connection counts
  const connCounts = useMemo(() => {
    const c: Record<string, number> = {};
    influenceRelations.forEach((r) => {
      c[r.from] = (c[r.from] || 0) + 1;
      c[r.to] = (c[r.to] || 0) + 1;
    });
    return c;
  }, []);

  // Run d3-force simulation to compute positions
  useEffect(() => {
    if (!isOpen) return;

    try {
      const philIds = new Set(philosophers.map((p) => p.id));
      const validLinks = influenceRelations.filter((r) => philIds.has(r.from) && philIds.has(r.to));

      const nodes: ForceNode[] = philosophers.map((p) => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        era: p.era,
        portrait: p.portrait,
        school: p.school,
        connCount: connCounts[p.id] || 0,
        x: CX + (Math.random() - 0.5) * 100,
        y: CY + (Math.random() - 0.5) * 100,
      }));

      const links: ForceLink[] = validLinks.map((r) => ({
        source: r.from,
        target: r.to,
        type: r.type,
      }));

      const simulation = forceSimulation<ForceNode>(nodes)
        .force('link', forceLink<ForceNode, ForceLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const t = (d as ForceLink).type;
            return t === 'direct' ? 90 : t === 'critical' ? 120 : t === 'indirect' ? 140 : 160;
          })
          .strength(0.15))
        .force('charge', forceManyBody().strength(-280))
        .force('collide', forceCollide<ForceNode>().radius((d) => 28 + (d.connCount * 1.5)).iterations(2))
        .force('x', forceCenter(CX, CY).strength(0.05))
        .force('y', forceCenter(CX, CY).strength(0.05))
        .alphaDecay(0.02)
        .velocityDecay(0.4)
        .stop();

      // Run simulation synchronously (200 ticks is sufficient for stable layout)
      for (let i = 0; i < 200; i++) simulation.tick();

      const pos: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => {
        pos[n.id] = { x: n.x, y: n.y };
      });
      setNodePositions(pos);
      setIsReady(true);

      return () => {
        simulation.stop();
        setIsReady(false);
      };
    } catch (err) {
      console.error('InfluenceGraph simulation error:', err);
      // Fallback: use simple circular layout
      const pos: Record<string, { x: number; y: number }> = {};
      philosophers.forEach((p, i) => {
        const angle = (i / philosophers.length) * Math.PI * 2;
        const radius = 250 + (i % 3) * 80;
        pos[p.id] = { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
      });
      setNodePositions(pos);
      setIsReady(true);
    }
  }, [isOpen, connCounts]);

  // Setup d3-zoom (use setTimeout for immediate binding after render)
  useEffect(() => {
    if (!isOpen || !isReady) return;

    const timer = setTimeout(() => {
      if (!svgRef.current || !gRef.current) return;

      try {
        const svg = select(svgRef.current);
        const g = select(gRef.current);

        const zoomBehavior = zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.3, 6])
          .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
            g.attr('transform', event.transform.toString());
            setScale(event.transform.k);
          });

        zoomRef.current = zoomBehavior;
        svg.call(zoomBehavior);
      } catch (err) {
        console.error('d3-zoom setup error:', err);
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (svgRef.current) {
        select(svgRef.current).on('.zoom', null);
      }
    };
  }, [isOpen, isReady]);

  // Zoom controls
  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = select(svgRef.current);
    svg.call(zoomRef.current.scaleBy, factor);
  }, []);

  const resetView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = select(svgRef.current);
    svg.call(zoomRef.current.transform, zoomIdentity);
  }, []);

  // Starfield (reduced count, no SMIL animate to avoid repaint overhead)
  const stars = useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = [];
    const rng = seededRand(137);
    for (let i = 0; i < 80; i++) {
      arr.push({ x: rng() * VIEW_W, y: rng() * VIEW_H, r: rng() * 1.5 + 0.3, o: rng() * 0.5 + 0.1 });
    }
    return arr;
  }, []);

  // Nebulae (reduced count)
  const nebulae = useMemo(() => {
    const arr: { x: number; y: number; r: number; color: string; opacity: number }[] = [];
    const rng = seededRand(256);
    const colors = ['#F0C060', '#5BA3E8', '#B088E0', '#E0556B', '#50C878'];
    for (let i = 0; i < 5; i++) {
      arr.push({ x: rng() * VIEW_W, y: rng() * VIEW_H, r: 100 + rng() * 250, color: colors[Math.floor(rng() * colors.length)], opacity: 0.025 + rng() * 0.04 });
    }
    return arr;
  }, []);

  const getInfluenceInfo = (id: string) => {
    const p = philosophers.find((x) => x.id === id);
    if (!p) return null;
    const by = influenceRelations.filter((r) => r.to === id).map((r) => ({ phil: philosophers.find((x) => x.id === r.from)!, type: r.type })).filter((x) => x.phil);
    const to = influenceRelations.filter((r) => r.from === id).map((r) => ({ phil: philosophers.find((x) => x.id === r.to)!, type: r.type })).filter((x) => x.phil);
    return { philosopher: p, influencedBy: by, influenced: to };
  };

  const isHighlighted = (fromId: string, toId: string) =>
    hoveredNode === fromId || hoveredNode === toId || selectedPhilosopher === fromId || selectedPhilosopher === toId;

  const isConnectedToActive = (id: string) => {
    const target = selectedPhilosopher || hoveredNode;
    if (!target) return false;
    return influenceRelations.some((r) => (r.from === id && r.to === target) || (r.to === id && r.from === target));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden p-0 gap-0 border-0"
        style={{ background: 'linear-gradient(135deg, #050512 0%, #0a0a20 50%, #070716 100%)' }}>
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display text-xl flex items-center gap-2 text-slate-100">
              <GitBranch className="w-5 h-5 text-amber-300/80" />
              思想星座脉络图
              <span className="text-xs text-slate-400 font-normal ml-3">
                滚轮缩放 · 拖拽移动 · 点击星点查看思想传承
              </span>
            </DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 hover:text-white text-sm font-medium transition-all duration-200 hover:scale-105 backdrop-blur-sm"
            >
              <Home className="w-4 h-4" />
              返回主页
            </button>
          </div>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-0 flex-1 min-h-0">
          {/* Canvas */}
          <div ref={containerRef} className="flex-1 relative overflow-hidden select-none" style={{ minHeight: '500px' }}>
            <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" style={{ cursor: 'grab' }}>
              <defs>
                <filter id="d3NodeGlow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="d3BigGlow" x="-150%" y="-150%" width="400%" height="400%">
                  <feGaussianBlur stdDeviation="12" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Background: nebulae + stars (not transformed) */}
              <g>
                {nebulae.map((n, i) => (
                  <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity={n.opacity} />
                ))}
              </g>
              <g>
                {stars.map((s, i) => (
                  <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
                ))}
              </g>

              {/* Transformable content via d3-zoom */}
              <g ref={gRef}>
                {/* Connection lines - single pass render */}
                <g>
                  {influenceRelations.map((rel, i) => {
                    const from = nodePositions[rel.from];
                    const to = nodePositions[rel.to];
                    if (!from || !to) return null;
                    const hi = isHighlighted(rel.from, rel.to);
                    const color = RELATION_COLORS[rel.type] || '#666';
                    const offset = rel.type === 'parallel' ? 35 : rel.type === 'indirect' ? 28 : 18;
                    const d = curvePath(from.x, from.y, to.x, to.y, offset);
                    return (
                      <path key={`line-${i}`} d={d} fill="none"
                        stroke={hi ? color : '#2a2a44'} strokeWidth={hi ? 2 : 0.6}
                        opacity={hi ? 0.8 : 0.12}
                        strokeDasharray={hi ? '6 6' : undefined}
                        style={{ transition: 'opacity 0.3s, stroke-width 0.3s' }} />
                    );
                  })}
                </g>

                {/* Philosopher nodes */}
                <g>
                  {philosophers.map((p) => {
                    const pos = nodePositions[p.id];
                    if (!pos) return null;
                    const eraColor = ERA_COLORS[p.era] || '#888';
                    const count = connCounts[p.id] || 0;
                    const baseR = 14 + Math.min(count * 1.2, 10);
                    const isSel = selectedPhilosopher === p.id;
                    const isHov = hoveredNode === p.id;
                    const isConn = isConnectedToActive(p.id);
                    const isDim = (selectedPhilosopher || hoveredNode) && !isSel && !isHov && !isConn;
                    const r = isSel ? baseR * 1.4 : isHov ? baseR * 1.2 : baseR;
                    const labelW = p.name.length * 14 + 12;

                    return (
                      <g key={p.id} className="philo-node" transform={`translate(${pos.x} ${pos.y})`}
                        onClick={(e) => { e.stopPropagation(); setSelectedPhilosopher(p.id); }}
                        onMouseEnter={() => setHoveredNode(p.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        style={{ cursor: 'pointer', opacity: isDim ? 0.2 : 1, transition: 'opacity 0.3s' }}>
                        {/* Outer aura - only apply filter when active to reduce GPU load */}
                        <circle r={r * 2} fill={eraColor}
                          opacity={isSel ? 0.35 : isHov ? 0.25 : isConn ? 0.15 : 0.07}
                          filter={isSel || isHov ? 'url(#d3BigGlow)' : undefined}
                          style={{ transition: 'opacity 0.3s' }} />
                        {/* Portrait */}
                        <defs>
                          <clipPath id={`clip-d3-${p.id}`}><circle r={r} /></clipPath>
                        </defs>
                        <circle r={r + 1.5} fill={eraColor} opacity={isSel ? 1 : 0.7} />
                        <image href={p.portrait} x={-r} y={-r} width={r * 2} height={r * 2}
                          clipPath={`url(#clip-d3-${p.id})`} preserveAspectRatio="xMidYMid slice" />
                        {/* Selection ring */}
                        {isSel && (
                          <circle r={r + 3} fill="none" stroke="#fff" strokeWidth={1.5} opacity={0.8}>
                            <animate attributeName="r" values={`${r + 3};${r + 7};${r + 3}`} dur="2s" repeatCount="indefinite" />
                          </circle>
                        )}
                        {/* Name label - always visible */}
                        <g transform={`translate(0 ${r + 16})`}>
                          <rect x={-labelW / 2} y={-10} width={labelW} height={18} rx={9}
                            fill="#06061a" opacity={isSel || isHov ? 0.9 : 0.45} style={{ transition: 'opacity 0.3s' }} />
                          <text textAnchor="middle" y={3} fontSize={isSel || isHov ? 12 : 10}
                            fill={isSel ? '#fff' : isHov ? '#e8e8f0' : '#9090a8'}
                            fontFamily="sans-serif" fontWeight={isSel || isHov ? 600 : 400}
                            style={{ transition: 'font-size 0.3s, fill 0.3s' }}>
                            {p.name}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
              <button onClick={() => zoomBy(1.4)} className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-slate-200 hover:bg-white/20 transition-colors" title="放大">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => zoomBy(0.7)} className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-slate-200 hover:bg-white/20 transition-colors" title="缩小">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button onClick={resetView} className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-slate-200 hover:bg-white/20 transition-colors" title="重置">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Scale indicator */}
            <div className="absolute bottom-4 left-4 text-xs text-slate-400 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
              {Math.round(scale * 100)}%
            </div>

            {/* Relation legend */}
            <div className="absolute top-3 right-3 flex flex-col gap-1 text-[10px] text-slate-400 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/10">
              {(Object.keys(RELATION_LABELS) as string[]).map((k) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: RELATION_COLORS[k] }} />
                  <span>{RELATION_LABELS[k]}</span>
                </div>
              ))}
            </div>

            {/* Loading indicator */}
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-slate-400 text-sm animate-pulse">正在计算星座布局...</div>
              </div>
            )}
          </div>

          {/* Info Panel */}
          <div className="w-full lg:w-80 bg-slate-950/70 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-white/5 p-4 overflow-y-auto shrink-0">
            {selectedPhilosopher ? (
              (() => {
                const info = getInfluenceInfo(selectedPhilosopher);
                if (!info) return null;
                const { philosopher: p, influencedBy, influenced } = info;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <img src={p.portrait} alt={p.name} className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: ERA_COLORS[p.era] }} />
                      <div>
                        <h3 className="font-display text-lg font-semibold text-slate-100">{p.name}</h3>
                        <p className="text-xs text-slate-400">{p.nameEn}</p>
                        <p className="text-xs text-slate-400">{ERA_LABELS[p.era]} · {p.school[0]}</p>
                        <p className="text-[10px] text-slate-500">
                          {p.birthYear < 0 ? `公元前${Math.abs(p.birthYear)}` : p.birthYear} — {p.deathYear < 0 ? `公元前${Math.abs(p.deathYear)}` : p.deathYear}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-medium text-emerald-300/70 mb-2 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> 参考链接
                      </h4>
                      {(() => {
                        const links = getPhilosopherLinks(p);
                        return (
                          <div className="space-y-1">
                            <a href={links.zhWiki} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors">
                              <ExternalLink className="w-3 h-3" /> 维基百科（中文）
                            </a>
                            <a href={links.enWiki} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors">
                              <ExternalLink className="w-3 h-3" /> 维基百科（英文）
                            </a>
                            <a href={links.sep} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors">
                              <ExternalLink className="w-3 h-3" /> 斯坦福哲学百科 (SEP)
                            </a>
                            <a href={links.baidu} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors">
                              <ExternalLink className="w-3 h-3" /> 百度百科
                            </a>
                          </div>
                        );
                      })()}
                    </div>

                    {influencedBy.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-300/70 mb-2 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 rotate-180" /> 思想来源 ({influencedBy.length})
                        </h4>
                        <div className="space-y-1">
                          {influencedBy.map(({ phil, type }) => (
                            <button key={phil.id} onClick={() => setSelectedPhilosopher(phil.id)} className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-white/5 transition-colors group">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ERA_COLORS[phil.era] }} />
                              <span className="text-sm text-slate-200 group-hover:text-white flex-1 text-left">{phil.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: RELATION_COLORS[type], backgroundColor: `${RELATION_COLORS[type]}22` }}>{RELATION_LABELS[type]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {influenced.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-sky-300/70 mb-2 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" /> 影响后世 ({influenced.length})
                        </h4>
                        <div className="space-y-1">
                          {influenced.map(({ phil, type }) => (
                            <button key={phil.id} onClick={() => setSelectedPhilosopher(phil.id)} className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-white/5 transition-colors group">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ERA_COLORS[phil.era] }} />
                              <span className="text-sm text-slate-200 group-hover:text-white flex-1 text-left">{phil.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: RELATION_COLORS[type], backgroundColor: `${RELATION_COLORS[type]}22` }}>{RELATION_LABELS[type]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button onClick={() => setSelectedPhilosopher(null)} className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                      清除选择
                    </button>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-12">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <GitBranch className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">点击星座中的星点<br />查看思想传承关系</p>
                <div className="mt-6 space-y-2 text-left">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ERA_COLORS.ancient }} /> 古代哲学
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ERA_COLORS.modern }} /> 近代哲学
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ERA_COLORS.contemporary }} /> 现代哲学
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
