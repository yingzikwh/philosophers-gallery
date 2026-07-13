import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Clock, ZoomIn, ZoomOut, Maximize2, ArrowRight, ExternalLink, Home } from 'lucide-react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom';
import { philosophers } from '@/data/philosophers';
import { getPhilosopherLinks } from '@/data/philosopher-links';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TimelineProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const VIEW_W = 2400;
const VIEW_H = 600;
const TL_Y = 300;

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

const ERA_RANGES: Record<string, [number, number]> = {
  ancient: [-600, 500],
  modern: [1500, 1860],
  contemporary: [1860, 2000],
};

function formatYear(year: number) {
  if (year < 0) return `公元前${Math.abs(year)}`;
  return `${year}年`;
}

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function Timeline({ isOpen, onOpenChange }: TimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<any>(null);

  const { sorted, minYear, maxYear, yearRange } = useMemo(() => {
    const s = [...philosophers].sort((a, b) => a.birthYear - b.birthYear);
    return { sorted: s, minYear: s[0].birthYear, maxYear: s[s.length - 1].deathYear, yearRange: s[s.length - 1].deathYear - s[0].birthYear };
  }, []);

  const yearToX = useCallback((year: number) => {
    const pad = 80;
    return pad + ((year - minYear) / yearRange) * (VIEW_W - pad * 2);
  }, [minYear, yearRange]);

  const philPositions = useMemo(() => {
    return sorted.map((p, i) => {
      const x = yearToX(p.birthYear);
      const isEven = i % 2 === 0;
      const yOffset = isEven ? -(90 + (i % 3) * 35) : (90 + (i % 3) * 35);
      return { ...p, x, y: TL_Y + yOffset, isEven, index: i };
    });
  }, [sorted, yearToX]);

  const stars = useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = [];
    const rng = seededRand(137);
    for (let i = 0; i < 50; i++) {
      arr.push({ x: rng() * VIEW_W, y: rng() * VIEW_H, r: rng() * 1.2 + 0.3, o: rng() * 0.4 + 0.1 });
    }
    return arr;
  }, []);

  const particles = useMemo(() => {
    const arr: { offset: number; speed: number; size: number; alpha: number }[] = [];
    const rng = seededRand(99);
    for (let i = 0; i < 10; i++) {
      arr.push({ offset: rng(), speed: rng() * 0.3 + 0.1, size: rng() * 1.5 + 0.5, alpha: rng() * 0.4 + 0.2 });
    }
    return arr;
  }, []);

  const yearTicks = useMemo(() => {
    const ticks: { year: number; x: number; isMajor: boolean }[] = [];
    const tickStep = yearRange > 2500 ? 500 : yearRange > 1000 ? 200 : 100;
    const startTick = Math.ceil(minYear / tickStep) * tickStep;
    for (let y = startTick; y <= maxYear; y += tickStep) {
      ticks.push({ year: y, x: yearToX(y), isMajor: y % (tickStep * 2) === 0 });
    }
    return ticks;
  }, [minYear, maxYear, yearRange, yearToX]);

  // d3-zoom (use setTimeout for immediate binding after render)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (!svgRef.current || !gRef.current) return;

      try {
        const svg = select(svgRef.current);
        const g = select(gRef.current);

        const zoomBehavior = zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.4, 8])
          .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
            g.attr('transform', event.transform.toString());
            setScale(event.transform.k);
          });

        zoomRef.current = zoomBehavior;
        svg.call(zoomBehavior);
      } catch (err) {
        console.error('Timeline d3-zoom setup error:', err);
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (svgRef.current) {
        select(svgRef.current).on('.zoom', null);
      }
    };
  }, [isOpen]);

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.scaleBy, factor);
  }, []);

  const resetView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  }, []);

  const selectedPhil = philosophers.find((p) => p.id === selectedId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-hidden p-0 gap-0 border-0"
        style={{ background: 'linear-gradient(135deg, #060614 0%, #0c0c24 50%, #080818 100%)' }}>
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display text-xl flex items-center gap-2 text-slate-100">
              <Clock className="w-5 h-5 text-sky-300/80" />
              星河思想时间轴
              <span className="text-xs text-slate-400 font-normal ml-3">
                滚轮缩放 · 拖拽移动 · 点击星点查看
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

        <div className="flex flex-col lg:flex-row gap-0 h-[72vh]">
          {/* Timeline Canvas */}
          <div ref={containerRef} className="flex-1 relative overflow-hidden select-none" style={{ minHeight: '400px' }}>
            <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" style={{ cursor: 'grab' }}>
              <defs>
                <filter id="tlNodeGlow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="tlBigGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="8" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="tlLineGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="2" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id="riverGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#F0C060" stopOpacity="0.6" />
                  <stop offset="35%" stopColor="#F0C060" stopOpacity="0.3" />
                  <stop offset="35%" stopColor="#5BA3E8" stopOpacity="0.3" />
                  <stop offset="75%" stopColor="#5BA3E8" stopOpacity="0.3" />
                  <stop offset="75%" stopColor="#B088E0" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#B088E0" stopOpacity="0.6" />
                </linearGradient>
                <linearGradient id="eraAncient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F0C060" stopOpacity="0" />
                  <stop offset="50%" stopColor="#F0C060" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#F0C060" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="eraModern" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5BA3E8" stopOpacity="0" />
                  <stop offset="50%" stopColor="#5BA3E8" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#5BA3E8" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="eraContemporary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B088E0" stopOpacity="0" />
                  <stop offset="50%" stopColor="#B088E0" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#B088E0" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Starfield (not transformed) */}
              <g>
                {stars.map((s, i) => (
                  <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
                ))}
              </g>

              {/* Transformable content via d3-zoom */}
              <g ref={gRef}>
                {/* Era background bands */}
                {(['ancient', 'modern', 'contemporary'] as const).map((era) => {
                  const [start, end] = ERA_RANGES[era];
                  const x1 = yearToX(start);
                  const x2 = yearToX(end);
                  const w = Math.max(1, x2 - x1);
                  const gradId = era === 'ancient' ? 'eraAncient' : era === 'modern' ? 'eraModern' : 'eraContemporary';
                  return (
                    <g key={era}>
                      <rect x={x1} y={0} width={w} height={VIEW_H} fill={`url(#${gradId})`} />
                      <text x={(x1 + x2) / 2} y={50} textAnchor="middle" fontSize="14" fill={ERA_COLORS[era]} opacity="0.4" fontFamily="serif" letterSpacing="4">{ERA_LABELS[era]}</text>
                    </g>
                  );
                })}

                {/* Era divider lines */}
                {(['ancient', 'modern', 'contemporary'] as const).map((era) => {
                  const [start] = ERA_RANGES[era];
                  const x = yearToX(start);
                  return <line key={era} x1={x} y1={80} x2={x} y2={VIEW_H - 80} stroke={ERA_COLORS[era]} strokeWidth="0.5" opacity="0.15" strokeDasharray="4 4" />;
                })}

                {/* Main timeline river */}
                <line x1={yearToX(minYear)} y1={TL_Y} x2={yearToX(maxYear)} y2={TL_Y} stroke="url(#riverGrad)" strokeWidth="4" filter="url(#tlLineGlow)" />
                <line x1={yearToX(minYear)} y1={TL_Y} x2={yearToX(maxYear)} y2={TL_Y} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

                {/* Static bright dots along the river */}
                {particles.map((p, i) => {
                  const px = yearToX(minYear) + p.offset * (yearToX(maxYear) - yearToX(minYear));
                  return (
                    <circle key={i} cx={px} cy={TL_Y} r={p.size} fill="#fff" opacity={p.alpha} />
                  );
                })}

                {/* Year tick marks */}
                {yearTicks.map((tick, i) => (
                  <g key={i}>
                    <line x1={tick.x} y1={TL_Y - (tick.isMajor ? 12 : 6)} x2={tick.x} y2={TL_Y + (tick.isMajor ? 12 : 6)} stroke="rgba(255,255,255,0.2)" strokeWidth={tick.isMajor ? 1 : 0.5} />
                    {tick.isMajor && (
                      <text x={tick.x} y={TL_Y + 28} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">
                        {tick.year < 0 ? `公元前${Math.abs(tick.year)}` : tick.year}
                      </text>
                    )}
                  </g>
                ))}

                {/* Philosopher life span bars */}
                {philPositions.map((p) => {
                  const x1 = yearToX(p.birthYear);
                  const x2 = yearToX(p.deathYear);
                  const eraColor = ERA_COLORS[p.era] || '#888';
                  const isSel = selectedId === p.id;
                  const isHov = hoveredId === p.id;
                  return <line key={`life-${p.id}`} x1={x1} y1={TL_Y} x2={x2} y2={TL_Y} stroke={eraColor} strokeWidth={isSel || isHov ? 3 : 1.5} opacity={isSel || isHov ? 0.8 : 0.3} style={{ transition: 'all 0.3s' }} />;
                })}

                {/* Connection lines from timeline to nodes */}
                {philPositions.map((p) => {
                  const isSel = selectedId === p.id;
                  const isHov = hoveredId === p.id;
                  return <line key={`conn-${p.id}`} x1={p.x} y1={TL_Y} x2={p.x} y2={p.y} stroke={isSel || isHov ? ERA_COLORS[p.era] : 'rgba(255,255,255,0.1)'} strokeWidth={isSel ? 1.5 : isHov ? 1 : 0.5} strokeDasharray="3 3" opacity={isSel ? 0.7 : isHov ? 0.5 : 0.2} style={{ transition: 'all 0.3s' }} />;
                })}

                {/* Philosopher nodes */}
                {philPositions.map((p) => {
                  const eraColor = ERA_COLORS[p.era] || '#888';
                  const isSel = selectedId === p.id;
                  const isHov = hoveredId === p.id;
                  const baseR = 7;
                  const r = isSel ? baseR * 1.7 : isHov ? baseR * 1.35 : baseR;
                  const showLabel = isSel || isHov;
                  return (
                    <g key={p.id} className="tl-node" transform={`translate(${p.x} ${p.y})`}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(p.id); }}
                      onMouseEnter={() => setHoveredId(p.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{ cursor: 'pointer' }}>
                      <circle r={r * 2.5} fill={eraColor} opacity={isSel ? 0.3 : isHov ? 0.2 : 0.08} filter="url(#tlBigGlow)" style={{ transition: 'all 0.3s' }} />
                      <circle r={r} fill={eraColor} opacity={isSel ? 1 : isHov ? 0.95 : 0.75} filter="url(#tlNodeGlow)" stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 1.5 : 0} style={{ transition: 'all 0.3s' }}>
                        {(isSel || isHov) && <animate attributeName="r" values={`${r};${r * 1.15};${r}`} dur="2s" repeatCount="indefinite" />}
                      </circle>
                      <circle r={r * 0.4} fill="#fff" opacity={isSel ? 1 : 0.7} />
                      {(isSel || isHov) && (
                        <g transform={`translate(0 ${p.isEven ? -(r + 30) : r + 30})`}>
                          <clipPath id={`clip-tl-${p.id}`}><circle r={18} /></clipPath>
                          <circle r={19} fill={eraColor} opacity="0.5" filter="url(#tlNodeGlow)" />
                          <image href={p.portrait} x={-18} y={-18} width={36} height={36} clipPath={`url(#clip-tl-${p.id})`} preserveAspectRatio="xMidYMid slice" />
                          <circle r={19} fill="none" stroke={eraColor} strokeWidth="1.5" opacity="0.8" />
                        </g>
                      )}
                      {showLabel && (
                        <g transform={`translate(0 ${p.isEven ? r + 16 : -(r + 16)})`}>
                          <rect x={-32} y={-9} width={64} height={16} rx={8} fill="#0a0a1e" opacity="0.85" />
                          <text textAnchor="middle" y={3} fontSize="11" fill="#e8e8f0" fontFamily="sans-serif" fontWeight="500">{p.name}</text>
                        </g>
                      )}
                      {isSel && (
                        <g transform={`translate(0 ${p.isEven ? r + 34 : -(r + 34)})`}>
                          <text textAnchor="middle" fontSize="9" fill={eraColor} opacity="0.7" fontFamily="sans-serif">
                            {formatYear(p.birthYear)} — {formatYear(p.deathYear)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
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

            <div className="absolute bottom-4 left-4 text-xs text-slate-400 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
              {Math.round(scale * 100)}%
            </div>

            <div className="absolute top-3 right-3 flex flex-col gap-1 text-[10px] text-slate-400 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/10">
              {(Object.keys(ERA_LABELS) as string[]).map((k) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ERA_COLORS[k] }} />
                  <span>{ERA_LABELS[k]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          <div className="w-full lg:w-72 bg-slate-950/60 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-white/5 p-4 overflow-y-auto">
            {selectedPhil ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img src={selectedPhil.portrait} alt={selectedPhil.name} className="w-14 h-14 rounded-full object-cover border-2" style={{ borderColor: ERA_COLORS[selectedPhil.era] }} />
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-100">{selectedPhil.name}</h3>
                    <p className="text-xs text-slate-400">{selectedPhil.nameEn}</p>
                    <p className="text-xs text-slate-400">{ERA_LABELS[selectedPhil.era]} · {selectedPhil.school[0]}</p>
                    <p className="text-[10px] text-slate-500">{formatYear(selectedPhil.birthYear)} — {formatYear(selectedPhil.deathYear)}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-amber-300/70 mb-2">国籍</h4>
                  <p className="text-sm text-slate-200">{selectedPhil.nationality}</p>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-amber-300/70 mb-2">所属流派</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPhil.school.map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: `${ERA_COLORS[selectedPhil.era]}40`, color: ERA_COLORS[selectedPhil.era] }}>{s}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-amber-300/70 mb-2">代表著作</h4>
                  <div className="space-y-0.5">
                    {selectedPhil.works.map((w) => (
                      <p key={w} className="text-xs text-slate-300">《{w.replace(/《|》/g, '')}》</p>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-sky-300/70 mb-2">核心思想</h4>
                  <div className="space-y-1.5">
                    {selectedPhil.coreIdeas.slice(0, 3).map((idea) => (
                      <p key={idea} className="text-xs text-slate-300 leading-relaxed"><span className="text-slate-500 mr-1">·</span>{idea}</p>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-purple-300/70 mb-2">名言</h4>
                  <blockquote className="text-xs text-slate-300 italic border-l-2 pl-3" style={{ borderColor: ERA_COLORS[selectedPhil.era] }}>{selectedPhil.quotes[0]}</blockquote>
                </div>

                {/* Reference Links */}
                <div>
                  <h4 className="text-xs font-medium text-emerald-300/70 mb-2 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> 参考链接</h4>
                  {(() => {
                    const links = getPhilosopherLinks(selectedPhil);
                    return (
                      <div className="space-y-1">
                        <a href={links.zhWiki} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors"><ExternalLink className="w-3 h-3" /> 维基百科（中文）</a>
                        <a href={links.enWiki} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors"><ExternalLink className="w-3 h-3" /> 维基百科（英文）</a>
                        <a href={links.sep} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors"><ExternalLink className="w-3 h-3" /> 斯坦福哲学百科 (SEP)</a>
                        <a href={links.baidu} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 transition-colors"><ExternalLink className="w-3 h-3" /> 百度百科</a>
                      </div>
                    );
                  })()}
                </div>

                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => { const idx = sorted.findIndex((p) => p.id === selectedId); if (idx > 0) setSelectedId(sorted[idx - 1].id); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                      <ArrowRight className="w-3 h-3 rotate-180" /> 前一位
                    </button>
                    <button onClick={() => { const idx = sorted.findIndex((p) => p.id === selectedId); if (idx < sorted.length - 1) setSelectedId(sorted[idx + 1].id); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                      后一位 <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <button onClick={() => setSelectedId(null)} className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">清除选择</button>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">点击时间轴上的星点<br />查看哲学家详情</p>
                <div className="mt-6 space-y-2 text-left">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ERA_COLORS.ancient }} /> 古代哲学</div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ERA_COLORS.modern }} /> 近代哲学</div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ERA_COLORS.contemporary }} /> 现代哲学</div>
                </div>
                <div className="mt-6 pt-4 border-t border-white/5 space-y-1.5">
                  <p className="text-[10px] text-slate-600">共 {philosophers.length} 位哲学家</p>
                  <p className="text-[10px] text-slate-600">跨越 {formatYear(minYear)} — {formatYear(maxYear)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
