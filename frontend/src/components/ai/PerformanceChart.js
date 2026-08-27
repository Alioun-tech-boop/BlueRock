import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart, Radio, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { fmtDate, fmtPct } from '../AiBits'
import { useDragScroll } from '../../lib/useSwipe'
import { t } from '../../lib/i18n'

const H = 240
const P = { top: 16, right: 12, bottom: 24, left: 46 }

const RANGES = [
  { id: '1m', days: 30 },
  { id: '3m', days: 90 },
  { id: '6m', days: 180 },
  { id: '1y', days: 365 },
  { id: 'all', days: null },
]

function monotone(points) {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const dxs = []
  const dys = []
  const ms = []
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i]
    dxs.push(dx)
    dys.push(ys[i + 1] - ys[i])
    ms.push(dx ? dys[i] / dx : 0)
  }
  const tang = [ms[0]]
  for (let i = 1; i < n - 1; i++) {
    const m1 = ms[i - 1]
    const m2 = ms[i]
    tang.push(m1 * m2 <= 0 ? 0 : (2 * m1 * m2) / (m1 + m2))
  }
  tang.push(ms[n - 2])
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const dx = dxs[i]
    const c1x = xs[i] + dx / 3
    const c1y = ys[i] + (tang[i] * dx) / 3
    const c2x = xs[i + 1] - dx / 3
    const c2y = ys[i + 1] - (tang[i + 1] * dx) / 3
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`
  }
  return d
}

function smoothPath(pairs) {
  const runs = []
  let cur = []
  for (const [x, y] of pairs) {
    if (y == null) {
      if (cur.length) {
        runs.push(cur)
        cur = []
      }
    } else {
      cur.push([x, y])
    }
  }
  if (cur.length) runs.push(cur)
  return runs.map((run) => monotone(run)).join('')
}

function smoothArea(pairs, bottomY) {
  const runs = []
  let cur = []
  for (const [x, y] of pairs) {
    if (y == null) {
      if (cur.length) {
        runs.push(cur)
        cur = []
      }
    } else {
      cur.push([x, y])
    }
  }
  if (cur.length) runs.push(cur)
  return runs
    .map((run) => {
      const top = monotone(run)
      const last = run[run.length - 1]
      const first = run[0]
      return `${top} L${last[0].toFixed(1)},${bottomY} L${first[0].toFixed(1)},${bottomY} Z`
    })
    .join('')
}

function yTicks(min, max) {
  const ticks = []
  for (let i = 0; i <= 3; i++) {
    ticks.push(min + ((max - min) * i) / 3)
  }
  return ticks
}

function fmtShort(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
  } catch (e) {
    return ''
  }
}

export default function PerformanceChart({ points }) {
  const [rangeId, setRangeId] = useState('all')
  const [showBench, setShowBench] = useState(true)
  const [hover, setHover] = useState(null)
  const [w, setW] = useState(0)
  const stageRef = useRef(null)
  const svgRef = useRef(null)
  const rangesRef = useRef(null)

  useDragScroll(rangesRef)

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const list = useMemo(() => (Array.isArray(points) ? points : []), [points])

  const filtered = useMemo(() => {
    if (!list.length) return []
    const range = RANGES.find((r) => r.id === rangeId)
    if (!range || !range.days) return list
    const cutoff = Date.now() - range.days * 86400000
    return list.filter((p) => p && p.date && new Date(p.date).getTime() >= cutoff)
  }, [list, rangeId])

  const series = useMemo(() => {
    if (filtered.length < 2 || w === 0) return null
    const pts = filtered
    const t0 = new Date(pts[0].date).getTime()
    const t1 = new Date(pts[pts.length - 1].date).getTime()
    const iw = w - P.left - P.right
    const ih = H - P.top - P.bottom
    if (iw <= 0 || ih <= 0) return null
    const nums = []
    pts.forEach((p) => {
      const v = Number(p.value)
      const b = Number(p.benchmark)
      if (p.value != null && !Number.isNaN(v)) nums.push(v)
      if (p.benchmark != null && !Number.isNaN(b)) nums.push(b)
    })
    if (!nums.length) return null
    let min = Math.min(...nums)
    let max = Math.max(...nums)
    if (min === max) {
      min -= 0.5
      max += 0.5
    }
    const pad = (max - min) * 0.12
    min -= pad
    max += pad
    const x = (ts) => P.left + ((ts - t0) / (t1 - t0 || 1)) * iw
    const y = (v) => P.top + ih - ((v - min) / (max - min)) * ih
    const pf = pts.map((p) => [x(new Date(p.date).getTime()), p.value != null ? y(Number(p.value)) : null])
    const bm = pts.map((p) => [x(new Date(p.date).getTime()), p.benchmark != null ? y(Number(p.benchmark)) : null])
    return { pts, t0, t1, min, max, x, y, iw, ih, pf, bm }
  }, [filtered, w])

  const pfPath = series ? smoothPath(series.pf) : ''
  const bmPath = series && showBench ? smoothPath(series.bm) : ''
  const areaPath = series ? smoothArea(series.pf, P.top + series.ih) : ''

  const first = series ? series.pts[0] : null
  const last = series ? series.pts[series.pts.length - 1] : null
  const delta = series && first && last && first.value != null && last.value != null
    ? Number(last.value) - Number(first.value)
    : null
  const deltaUp = delta != null && delta > 0
  const deltaDown = delta != null && delta < 0

  const onMove = (e) => {
    if (!series || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    let idx = Math.round(((px - P.left) / series.iw) * (series.pts.length - 1))
    idx = Math.max(0, Math.min(series.pts.length - 1, idx))
    setHover(idx)
  }

  const hoverPt = series && hover != null ? series.pts[hover] : null
  const hoverX = hoverPt && series ? ((series.x(new Date(hoverPt.date).getTime()) / w) * 100).toFixed(1) : 0
  const tipLeft = Math.min(92, Math.max(8, Number(hoverX)))

  const ticks = series ? yTicks(series.min, series.max) : []

  return (
    <div className="ai-pchart">
      <div className="ai-pchart-head">
        <div className="ai-pchart-title">
          <span className="ai-pchart-ico">
            <LineChart size={15} />
          </span>
          <div className="ai-pchart-title-text">
            <span className="ai-pchart-title-name">{t('aiStudioPerformance')}</span>
            <span className="ai-pchart-title-sub">{t('aiStudioVsBenchmark')}</span>
          </div>
        </div>
        {delta != null && (
          <span className={`ai-pchart-delta ${deltaUp ? 'up' : deltaDown ? 'down' : ''}`}>
            {deltaUp ? <TrendingUp size={13} /> : deltaDown ? <TrendingDown size={13} /> : <Minus size={13} />}
            {fmtPct(delta)}
          </span>
        )}
      </div>

        <div className="ai-pchart-toolbar">
        <div className="ai-pchart-ranges" ref={rangesRef} data-ai-scroll role="tablist" aria-label={t('aiStudioChartRange')}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={rangeId === r.id}
              className={`ai-prange ${rangeId === r.id ? 'active' : ''}`}
              onClick={() => setRangeId(r.id)}
            >
              {r.id === 'all' ? t('aiStudioChartAll') : r.id.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="ai-pchart-legend">
          <button className={`ai-plegend ${showBench ? 'on' : 'off'}`} onClick={() => setShowBench((s) => !s)}>
            <i className="ai-plegend-dot bm" />
            {t('aiStudioChartBenchmark')}
          </button>
        </div>
      </div>

      {!series ? (
        <div className="ai-pchart-empty">
          <svg width="100%" height="150" viewBox="0 0 320 150" preserveAspectRatio="none" className="ai-pchart-empty-bg">
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1="8" x2="312" y1={12 + 126 * g} y2={12 + 126 * g} className="ai-pchart-grid" />
            ))}
            <path
              d="M8,118 C60,108 92,128 132,104 C172,80 208,96 244,66 C266,48 288,52 312,40"
              className="ai-pchart-empty-path"
            />
          </svg>
          <div className="ai-pchart-empty-scan" />
          <div className="ai-pchart-empty-card">
            <span className="ai-pchart-empty-ico">
              <Radio size={16} />
            </span>
            <div className="ai-pchart-empty-text">
              <b>{t('aiStudioChartEmptyTitle')}</b>
              <span>{t('aiStudioChartEmptyHint')}</span>
              <i>
                {list.length} pt · {t('aiStudioCollecting')}
              </i>
            </div>
          </div>
        </div>
      ) : (
        <div className="ai-pchart-stage" ref={stageRef}>
          {w > 0 && (
            <svg
              ref={svgRef}
              width={w}
              height={H}
              className="ai-pchart-svg"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="aiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4C8DFF" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#4C8DFF" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="aiLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3B82F6" />
                  <stop offset="55%" stopColor="#4C8DFF" />
                  <stop offset="100%" stopColor="#A78BFA" />
                </linearGradient>
                <filter id="aiLineGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2.6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {ticks.map((v, i) => (
                <g key={i}>
                  <line
                    x1={P.left}
                    x2={w - P.right}
                    y1={series.y(v)}
                    y2={series.y(v)}
                    className="ai-pchart-grid"
                  />
                  <text x={P.left - 7} y={series.y(v) + 3} textAnchor="end" className="ai-pchart-ylabel">
                    {(v * 100).toFixed(1)}%
                  </text>
                </g>
              ))}

              <text x={P.left} y={H - 7} className="ai-pchart-xlabel">{fmtShort(first.date)}</text>
              <text x={w / 2 - 20} y={H - 7} className="ai-pchart-xlabel">
                {fmtShort(series.pts[Math.floor(series.pts.length / 2)].date)}
              </text>
              <text x={w - P.right - 44} y={H - 7} className="ai-pchart-xlabel">{fmtShort(last.date)}</text>

              {bmPath && <path d={bmPath} className="ai-pchart-bm" fill="none" />}

              <g key={rangeId} className="ai-pchart-anim">
                {areaPath && <path d={areaPath} fill="url(#aiAreaGrad)" />}
                {pfPath && <path d={pfPath} pathLength="1" className="ai-pchart-pf" fill="none" />}
              </g>

              {series.pf[0] && series.pf[0][1] != null && (
                <circle cx={series.pf[0][0]} cy={series.pf[0][1]} r="2.6" className="ai-pchart-dot" />
              )}
              {series.pf[series.pf.length - 1] && series.pf[series.pf.length - 1][1] != null && (
                <circle
                  cx={series.pf[series.pf.length - 1][0]}
                  cy={series.pf[series.pf.length - 1][1]}
                  r="3.6"
                  className="ai-pchart-enddot"
                />
              )}

              {hoverPt && hover != null && (
                <g>
                  <line x1={series.x(new Date(hoverPt.date).getTime())} x2={series.x(new Date(hoverPt.date).getTime())} y1={P.top} y2={P.top + series.ih} className="ai-pchart-cross" />
                  {hoverPt.value != null && (
                    <circle cx={series.x(new Date(hoverPt.date).getTime())} cy={series.y(Number(hoverPt.value))} r="4" className="ai-pchart-hdot pf" />
                  )}
                  {showBench && hoverPt.benchmark != null && (
                    <circle cx={series.x(new Date(hoverPt.date).getTime())} cy={series.y(Number(hoverPt.benchmark))} r="3.4" className="ai-pchart-hdot bm" />
                  )}
                </g>
              )}
            </svg>
          )}

          {hoverPt && (
            <div className="ai-pchart-tip" style={{ left: `${tipLeft}%` }}>
              <div className="ai-pchart-tip-date">{fmtDate(hoverPt.date)}</div>
              <div className="ai-pchart-tip-row">
                <i className="ai-plegend-dot pf" />
                <span>{t('aiStudioChartPortfolio')}</span>
                <b>{fmtPct(hoverPt.value)}</b>
              </div>
              {showBench && (
                <div className="ai-pchart-tip-row">
                  <i className="ai-plegend-dot bm" />
                  <span>{t('aiStudioChartBenchmark')}</span>
                  <b>{fmtPct(hoverPt.benchmark)}</b>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        .ai-pchart {
          margin-top: 10px;
          border-radius: 18px;
          border: 1px solid var(--tv-border);
          background: linear-gradient(180deg, var(--tv-bg-elevated), var(--tv-bg-secondary));
          padding: 14px 14px 10px;
        }
        .ai-pchart-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ai-pchart-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .ai-pchart-ico {
          width: 34px; height: 34px; border-radius: 11px; flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, rgba(0,82,252,0.2), rgba(124,58,237,0.2));
          border: 1px solid rgba(76,141,255,0.35); color: #7AB2FF;
        }
        .ai-pchart-title-text { display: flex; flex-direction: column; min-width: 0; }
        .ai-pchart-title-name { font-size: 14.5px; font-weight: 800; color: #fff; letter-spacing: -0.01em; }
        .ai-pchart-title-sub { font-size: 10.5px; color: var(--tv-text-muted); font-weight: 600; }
        .ai-pchart-delta {
          flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 11px; border-radius: 999px;
          font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums;
          border: 1px solid var(--tv-border); background: rgba(255,255,255,0.03);
          color: var(--tv-text-secondary);
        }
        .ai-pchart-delta.up { color: #18C27C; border-color: rgba(24,194,124,0.35); background: rgba(24,194,124,0.1); }
        .ai-pchart-delta.down { color: #F04438; border-color: rgba(240,68,56,0.35); background: rgba(240,68,56,0.1); }
        .ai-pchart-toolbar {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          margin-top: 12px;
        }
        .ai-pchart-ranges {
          display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none;
          padding: 3px; border-radius: 12px; border: 1px solid var(--tv-border);
          background: rgba(0,0,0,0.25);
          cursor: grab;
          -webkit-user-select: none; user-select: none;
          -webkit-touch-callout: none;
          scroll-behavior: smooth;
        }
        .ai-pchart-ranges:active { cursor: grabbing; }
        .ai-pchart-ranges::-webkit-scrollbar { display: none; }
        .ai-prange {
          flex: 0 0 auto; padding: 5px 11px; border-radius: 9px;
          font-size: 11px; font-weight: 800; letter-spacing: 0.02em;
          color: var(--tv-text-secondary); background: transparent;
          border: none; cursor: pointer; font-family: inherit;
          transition: all 0.18s ease;
        }
        .ai-prange:hover { color: #fff; }
        .ai-prange.active {
          color: #fff;
          background: linear-gradient(135deg, rgba(0,82,252,0.9), rgba(124,58,237,0.85));
          box-shadow: 0 4px 14px rgba(0,82,252,0.35);
        }
        .ai-pchart-legend { flex: 0 0 auto; }
        .ai-plegend {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 10px; border-radius: 999px;
          font-size: 10.5px; font-weight: 700; cursor: pointer;
          color: var(--tv-text-secondary);
          border: 1px solid var(--tv-border); background: transparent;
          font-family: inherit; transition: all 0.18s ease;
        }
        .ai-plegend.on { color: #fff; border-color: rgba(148,163,184,0.4); }
        .ai-plegend.off { opacity: 0.45; }
        .ai-plegend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .ai-plegend-dot.pf { background: #4C8DFF; box-shadow: 0 0 7px rgba(76,141,255,0.9); }
        .ai-plegend-dot.bm { background: #94A3B8; }

        .ai-pchart-stage { position: relative; margin-top: 8px; }
        .ai-pchart-svg { display: block; }
        .ai-pchart-grid { stroke: var(--tv-divider); stroke-width: 1; stroke-dasharray: 3 4; }
        .ai-pchart-ylabel { fill: var(--tv-text-muted); font-size: 9px; font-weight: 600; }
        .ai-pchart-xlabel { fill: var(--tv-text-muted); font-size: 9px; font-weight: 600; }
        .ai-pchart-bm {
          stroke: rgba(148,163,184,0.7); stroke-width: 1.5;
          stroke-dasharray: 5 4; stroke-linejoin: round; stroke-linecap: round;
        }
        .ai-pchart-anim { animation: aiPchartFade 0.55s ease; }
        @keyframes aiPchartFade { from { opacity: 0; } to { opacity: 1; } }
        .ai-pchart-pf {
          stroke: url(#aiLineGrad); stroke-width: 2.5;
          stroke-linejoin: round; stroke-linecap: round;
          filter: url(#aiLineGlow);
          stroke-dasharray: 1; stroke-dashoffset: 1;
          animation: aiPchartDraw 1.1s cubic-bezier(0.6, 0, 0.2, 1) forwards;
        }
        @keyframes aiPchartDraw { to { stroke-dashoffset: 0; } }
        .ai-pchart-dot { fill: #4C8DFF; }
        .ai-pchart-enddot {
          fill: #fff; stroke: #4C8DFF; stroke-width: 2.5;
          filter: url(#aiLineGlow);
        }
        .ai-pchart-cross { stroke: rgba(148,163,184,0.35); stroke-width: 1; stroke-dasharray: 2 3; }
        .ai-pchart-hdot.pf { fill: #fff; stroke: #3B82F6; stroke-width: 2.5; }
        .ai-pchart-hdot.bm { fill: #fff; stroke: #94A3B8; stroke-width: 2; }

        .ai-pchart-tip {
          position: absolute; top: 8px;
          transform: translateX(-50%);
          pointer-events: none; z-index: 5;
          min-width: 148px;
          padding: 9px 11px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(13,15,20,0.92);
          backdrop-filter: blur(12px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .ai-pchart-tip-date { font-size: 10px; color: var(--tv-text-muted); font-weight: 700; margin-bottom: 6px; }
        .ai-pchart-tip-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--tv-text-secondary); padding: 1.5px 0; }
        .ai-pchart-tip-row b { margin-left: auto; color: #fff; font-variant-numeric: tabular-nums; }

        .ai-pchart-empty {
          position: relative; overflow: hidden; margin-top: 10px;
          border-radius: 14px; border: 1px solid var(--tv-border);
          background: var(--tv-bg-secondary);
        }
        .ai-pchart-empty-bg { display: block; }
        .ai-pchart-empty-path {
          fill: none; stroke: rgba(76,141,255,0.22); stroke-width: 2;
          stroke-dasharray: 6 7; stroke-linecap: round;
        }
        .ai-pchart-empty-scan {
          position: absolute; top: 0; bottom: 0; left: 0;
          width: 90px;
          background: linear-gradient(100deg, transparent, rgba(76,141,255,0.07), transparent);
          animation: aiScan 2.6s ease-in-out infinite;
        }
        @keyframes aiScan { 0% { transform: translateX(-90px); } 100% { transform: translateX(calc(100vw)); } }
        .ai-pchart-empty-card {
          position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
          display: flex; align-items: center; gap: 11px;
          padding: 12px 16px; border-radius: 14px;
          border: 1px solid rgba(76,141,255,0.25);
          background: rgba(11,13,18,0.85);
          backdrop-filter: blur(10px);
          box-shadow: 0 12px 34px rgba(0,0,0,0.5);
          white-space: nowrap;
        }
        .ai-pchart-empty-ico {
          width: 36px; height: 36px; border-radius: 12px; flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          background: rgba(76,141,255,0.14); border: 1px solid rgba(76,141,255,0.35);
          color: #7AB2FF;
        }
        .ai-pchart-empty-ico svg { animation: aiPulse2 1.6s ease-in-out infinite; }
        @keyframes aiPulse2 { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .ai-pchart-empty-text { display: flex; flex-direction: column; gap: 1px; }
        .ai-pchart-empty-text b { font-size: 12.5px; font-weight: 800; color: #fff; }
        .ai-pchart-empty-text span { font-size: 10.5px; color: var(--tv-text-secondary); }
        .ai-pchart-empty-text i { font-style: normal; font-size: 9.5px; color: var(--tv-text-muted); margin-top: 2px; }

        @media (max-width: 430px) {
          .ai-pchart-empty-card { white-space: normal; max-width: 90%; }
        }
      `}</style>
    </div>
  )
}
