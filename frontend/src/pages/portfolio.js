import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies, getMarketSparklines, getPortfolio, placeOrder } from '../services/api'
import { useAuth } from '../lib/auth'
import {
  Wallet, TrendingUp, TrendingDown, Plus, Sparkles, ArrowUpRight, ArrowDownRight, UserRound,
} from 'lucide-react'
import { detectLang, t, fmtPrice, fmtChange } from '../lib/i18n'

const PORT_KEY = 'bluerock_portfolio_v1'

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const SECTOR_COLORS = {
  Banque: '#7266D9', 'Services Financiers': '#00C853', Télécommunications: '#facc15',
  Industriels: '#4ea8ff', Transport: '#ff8fa3', Assurance: '#ff9f43',
  Agroalimentaire: '#2ec4b6', 'Consommation de Base': '#2ec4b6',
  Énergie: '#e76f51', 'Consommation Discrétionnaire': '#c77dff',
  Matériaux: '#90e0ef', Immobilier: '#f4a261',
}

function AreaChart({ data, width = 340, height = 150 }) {
  if (!data || data.length < 2) return <div className="chart-empty">—</div>
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pad = 8
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = height - pad - ((v - min) / span) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const up = data[data.length - 1] >= data[0]
  const color = up ? '#00C853' : '#FF4D4F'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon points={`${pad},${height - pad} ${pts} ${width - pad},${height - pad}`} fill={color} opacity="0.1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Pie({ slices, size = 140 }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const r = size / 2 - 4
  const cx = size / 2
  const cy = size / 2
  let angle = -90
  const arcs = slices.map((s, i) => {
    const frac = s.value / total
    const a1 = angle
    const a2 = angle + frac * 360
    angle = a2
    const rad = a => ((a - 90) * Math.PI) / 180
    const x1 = cx + r * Math.cos(rad(a1))
    const y1 = cy + r * Math.sin(rad(a1))
    const x2 = cx + r * Math.cos(rad(a2))
    const y2 = cy + r * Math.sin(rad(a2))
    const large = frac > 0.5 ? 1 : 0
    return (
      <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={s.color} />
    )
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs}
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#1E1E1E" />
    </svg>
  )
}

function RiskBar({ level }) {
  const pct = Math.max(8, Math.min(100, level))
  const color = level <= 35 ? '#00C853' : level <= 65 ? '#facc15' : '#FF4D4F'
  return (
    <div className="risk-bar">
      <div className="risk-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function Portfolio() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [lang, setLang] = useState('fr')
  const [stocks, setStocks] = useState([])
  const [spark, setSpark] = useState({})
  const [positions, setPositions] = useState({})
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setPositions({})
      setOrders([])
      setLoading(false)
      return
    }
    let cancelled = false
    getPortfolio()
      .then(res => {
        if (cancelled) return
        const pos = {}
        ;(res.data.positions || []).forEach(p => { pos[p.symbol] = { qty: p.qty, avgPrice: p.avg_price } })
        setPositions(pos)
        setOrders(res.data.orders || [])
        const local = loadJSON(PORT_KEY, {})
        const localEntries = Object.entries(local).filter(([, p]) => p.qty > 0)
        if (localEntries.length && (!res.data.positions || !res.data.positions.length) && !migrated) {
          setMigrated(true)
          Promise.all(localEntries.map(([sym, p]) =>
            placeOrder({ symbol: sym, side: 'buy', qty: p.qty, price: p.avgPrice || 1 }).catch(() => null)
          )).then(orders => {
            if (cancelled) return
            const imported = orders.filter(Boolean).length
            if (imported > 0) {
              getPortfolio().then(r => {
                if (cancelled) return
                const pos2 = {}
                ;(r.data.positions || []).forEach(p => { pos2[p.symbol] = { qty: p.qty, avgPrice: p.avg_price } })
                setPositions(pos2)
                localStorage.removeItem(PORT_KEY)
              }).catch(() => {})
            }
          })
        }
      })
      .catch(() => { if (!cancelled) setPositions({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, authLoading, migrated])

  useEffect(() => {
    Promise.all([
      getCompanies({ limit: 47 }).then(r => r.data.companies || []).catch(() => []),
      getMarketSparklines(30).then(r => r.data || {}).catch(() => ({})),
    ]).then(([list, sp]) => {
      if (!mounted.current) return
      setStocks(list)
      setSpark(sp)
    })
    return () => { mounted.current = false }
  }, [])

  const positionList = useMemo(() => {
    return Object.entries(positions).map(([symbol, pos]) => {
      const stock = stocks.find(s => s.symbol === symbol)
      const price = stock?.current_price ?? 0
      const chg = stock?.change_percent ?? 0
      const qty = pos.qty || 0
      const avg = pos.avgPrice || price
      const value = price * qty
      const cost = avg * qty
      const pl = value - cost
      const plPct = cost ? (pl / cost) * 100 : 0
      return { symbol, stock, qty, avg, price, chg, value, cost, pl, plPct, id: stock?.id }
    }).filter(p => p.qty > 0)
  }, [positions, stocks])

  const totals = useMemo(() => {
    const value = positionList.reduce((s, p) => s + p.value, 0)
    const cost = positionList.reduce((s, p) => s + p.cost, 0)
    const dayPl = positionList.reduce((s, p) => s + p.value * (p.chg / 100), 0)
    const totalPl = value - cost
    const totalPlPct = cost ? (totalPl / cost) * 100 : 0
    const dayPlPct = value ? (dayPl / value) * 100 : 0
    return { value, cost, dayPl, dayPlPct, totalPl, totalPlPct }
  }, [positionList])

  const series = useMemo(() => {
    const n = 23
    const out = new Array(n).fill(0)
    positionList.forEach(p => {
      const points = spark[p.id]
      if (points && points.length >= 2) {
        const last = points[points.length - 1]
        const ratio = p.price ? last / p.price : 1
        for (let i = 0; i < n; i++) {
          const idx = Math.max(0, points.length - n + i)
          out[i] += (points[idx] || last) * ratio * p.qty
        }
      } else {
        for (let i = 0; i < n; i++) out[i] += p.value
      }
    })
    return out
  }, [positionList, spark])

  const sectorPie = useMemo(() => {
    const map = {}
    positionList.forEach(p => {
      const sec = p.stock?.sector || 'Autre'
      map[sec] = (map[sec] || 0) + p.value
    })
    return Object.entries(map)
      .map(([label, value]) => ({ label, value, color: SECTOR_COLORS[label] || '#5a5a5a' }))
      .sort((a, b) => b.value - a.value)
  }, [positionList])

  const nPos = positionList.length
  const herfindahl = nPos ? positionList.reduce((s, p) => s + (p.value / (totals.value || 1)) ** 2, 0) : 0
  const diversification = nPos === 0 ? 0 : Math.min(100, Math.round((1 - herfindahl) * 100))
  const riskLevel = nPos === 0 ? 0 : Math.max(15, Math.min(90, Math.round(60 - diversification * 0.45)))
  const riskLabel = riskLevel <= 35 ? t(lang, 'riskLow') : riskLevel <= 65 ? t(lang, 'riskMedium') : t(lang, 'riskHigh')

  const estDividends = positionList.reduce((s, p) => {
    const dy = p.stock?.dividend_yield ?? 0
    return s + p.value * (dy / 100)
  }, 0)
  const divYield = totals.value ? (estDividends / totals.value) * 100 : 0

  const aiRecos = []
  if (nPos > 0) {
    const top = [...positionList].sort((a, b) => b.value - a.value)
    const topPct = (top[0].value / totals.value) * 100
    if (topPct > 35) aiRecos.push({ type: 'warn', i18n: 'aiRecoConcentration', v: `${topPct.toFixed(0)}%` })
    else aiRecos.push({ type: 'ok', i18n: 'aiRecoDiversified', v: '' })
    const sectorsCount = sectorPie.length
    if (sectorsCount <= 2) aiRecos.push({ type: 'warn', i18n: 'aiRecoSectors', v: String(sectorsCount) })
    else aiRecos.push({ type: 'ok', i18n: 'aiRecoSectorSpread', v: String(sectorsCount) })
    const neg = positionList.filter(p => p.pl < 0)
    if (neg.length) aiRecos.push({ type: 'warn', i18n: 'aiRecoLosers', v: neg.map(p => p.symbol).join(', ') })
    if (divYield >= 2) aiRecos.push({ type: 'ok', i18n: 'aiRecoDividends', v: `${divYield.toFixed(1)}%` })
    if (diversification >= 60) aiRecos.push({ type: 'ok', i18n: 'aiRecoDiversification', v: `${diversification}%` })
  }
  if (aiRecos.length === 0) aiRecos.push({ type: 'info', i18n: 'aiRecoEmpty', v: '' })

  const fmtMoney = n => n != null ? n.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'
  const fmtPl = v => `${v >= 0 ? '+' : ''}${fmtMoney(v)}`
  const fmtPlPct = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="pf-header">
          <div className="pf-title-col">
            <h1 className="pf-title">{t(lang, 'portfolio')}</h1>
            <span className="pf-sub">{t(lang, 'pfSubtitle')}</span>
          </div>
          <button className="icon-btn add" aria-label={t(lang, 'add')} onClick={() => router.push('/watchlist')}>
            <Plus size={24} />
          </button>
        </header>

        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : !user ? (
          <div className="empty-box">
            <UserRound size={30} />
            <span className="empty-title">{t(lang, 'authRequired')}</span>
            <span className="empty-sub">{t(lang, 'authRequiredSub')}</span>
            <button className="empty-btn" onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}>{t(lang, 'authLogin')}</button>
          </div>
        ) : nPos === 0 && !orders.length ? (
          <div className="empty-box">
            <Wallet size={30} />
            <span className="empty-title">{t(lang, 'pfEmpty')}</span>
            <span className="empty-sub">{t(lang, 'pfEmptySub')}</span>
            <button className="empty-btn" onClick={() => router.push('/watchlist')}>{t(lang, 'pfGoWatchlist')}</button>
          </div>
        ) : (
          <>
            {nPos === 0 && (
              <div className="empty-box">
                <Wallet size={30} />
                <span className="empty-title">{t(lang, 'pfEmpty')}</span>
                <span className="empty-sub">{t(lang, 'pfEmptySub')}</span>
                <button className="empty-btn" onClick={() => router.push('/watchlist')}>{t(lang, 'pfGoWatchlist')}</button>
              </div>
            )}
            <section className="value-card">
              <span className="vc-label">{t(lang, 'pfTotalValue')}</span>
              <div className="vc-value">{fmtMoney(totals.value)} FCFA</div>
              <div className="vc-meta">
                <span className={`vc-day ${totals.dayPl >= 0 ? 'up' : 'down'}`}>
                  {totals.dayPl >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {fmtPlPct(totals.dayPlPct)} {t(lang, 'today')}
                </span>
                <span className="vc-total">
                  {fmtPlPct(totals.totalPlPct)} {t(lang, 'allTime')}
                </span>
              </div>
              <div className="vc-chart">
                <AreaChart data={series} />
              </div>
            </section>

            <section className="breakdown-card">
              <div className="card-title">{t(lang, 'pfBreakdown')}</div>
              <div className="bd-grid">
                <div className="bd-item">
                  <span className="bd-label">{t(lang, 'pfInvested')}</span>
                  <span className="bd-value">{fmtMoney(totals.cost)} FCFA</span>
                </div>
                <div className="bd-item">
                  <span className="bd-label">{t(lang, 'pfDayPl')}</span>
                  <span className={`bd-value ${totals.dayPl >= 0 ? 'up' : 'down'}`}>{fmtPl(totals.dayPl)} FCFA</span>
                </div>
                <div className="bd-item">
                  <span className="bd-label">{t(lang, 'pfTotalPl')}</span>
                  <span className={`bd-value ${totals.totalPl >= 0 ? 'up' : 'down'}`}>{fmtPl(totals.totalPl)} FCFA</span>
                </div>
                <div className="bd-item">
                  <span className="bd-label">{t(lang, 'pfPositions')}</span>
                  <span className="bd-value">{nPos}</span>
                </div>
              </div>
            </section>

            <section className="sector-card">
              <div className="card-title">{t(lang, 'pfSectorExposure')}</div>
              <div className="sec-body">
                <Pie slices={sectorPie} />
                <div className="sec-legend">
                  {sectorPie.map((s, i) => (
                    <div key={i} className="sec-item">
                      <i className="sw" style={{ background: s.color }} />
                      <span className="sec-name">{s.label}</span>
                      <span className="sec-pct mono">{((s.value / (totals.value || 1)) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="positions-card">
              <div className="card-title">{t(lang, 'pfPositions')}</div>
              {positionList.map(p => {
                const up = p.pl >= 0
                return (
                  <div key={p.symbol} className="pos-row" onClick={() => p.id && router.push(`/company?id=${p.id}`)}>
                    <div className="pos-logo" style={{ background: `hsl(${(p.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                      {p.stock?.logo_url ? <img src={p.stock.logo_url} alt={p.symbol} /> : p.symbol?.[0]}
                    </div>
                    <div className="pos-info">
                      <div className="pos-name">{p.stock?.name || p.symbol}</div>
                      <div className="pos-sub">{p.symbol} · {p.qty} {t(lang, 'shares')}</div>
                    </div>
                    <div className="pos-right">
                      <div className="pos-value mono">{fmtMoney(p.value)}</div>
                      <div className={`pos-pl mono ${up ? 'up' : 'down'}`}>
                        {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {fmtPlPct(p.plPct)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>

            <section className="ai-card">
              <div className="ai-head">
                <span className="ai-badge"><Sparkles size={14} /> {t(lang, 'aiPerformance')}</span>
                <span className="ai-premium">PREMIUM</span>
              </div>
              <div className="ai-stats">
                <div className="ai-stat">
                  <span className="ai-stat-label">{t(lang, 'pfDiversification')}</span>
                  <span className="ai-stat-value">{diversification}%</span>
                </div>
                <div className="ai-stat">
                  <span className="ai-stat-label">{t(lang, 'pfRiskLevel')}</span>
                  <div className="risk-wrap">
                    <span className={`risk-text ${riskLevel <= 35 ? 'up' : riskLevel <= 65 ? 'warn' : 'down'}`}>{riskLabel}</span>
                    <RiskBar level={riskLevel} />
                  </div>
                </div>
                <div className="ai-stat">
                  <span className="ai-stat-label">{t(lang, 'pfEstDividends')}</span>
                  <span className="ai-stat-value">{fmtMoney(estDividends)} FCFA</span>
                </div>
                <div className="ai-stat">
                  <span className="ai-stat-label">{t(lang, 'pfGrowthProj')}</span>
                  <span className="ai-stat-value">{totals.totalPlPct >= 0 ? '+' : ''}{totals.totalPlPct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="ai-recos">
                <div className="reco-title">{t(lang, 'aiRecommendations')}</div>
                {aiRecos.map((r, i) => (
                  <div key={i} className={`reco-item ${r.type}`}>
                    <span className="reco-icon">
                      {r.type === 'ok' ? '✓' : r.type === 'warn' ? '!' : 'i'}
                    </span>
                    <span>{t(lang, r.i18n)}</span>
                    {r.v && <span className="mono reco-v">{r.v}</span>}
                  </div>
                ))}
              </div>
            </section>

            <section className="orders-card">
              <div className="card-title">{t(lang, 'pfOrders')}</div>
              {!orders.length ? (
                <div className="orders-empty">{t(lang, 'pfOrdersEmpty')}</div>
              ) : (
                <div className="orders-list">
                  {orders.map(o => {
                    const buy = o.side === 'buy'
                    const when = o.created_at ? new Date(o.created_at) : null
                    return (
                      <div key={o.id} className="order-row">
                        <span className={`order-side ${buy ? 'buy' : 'sell'}`}>{buy ? t(lang, 'buy') : t(lang, 'sell')}</span>
                        <span className="order-sym mono">{o.symbol}</span>
                        <span className="order-detail">{when ? when.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—'} · {o.qty} {t(lang, 'shares')} @ {fmtMoney(o.price)}</span>
                        <span className="order-total mono">{fmtMoney((o.qty || 0) * (o.price || 0))} FCFA</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <BottomNav active="portfolio" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .pf-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 4px; }
        .pf-title-col { display: flex; flex-direction: column; gap: 2px; }
        .pf-title { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.3px; }
        .pf-sub { font-size: 12px; color: #8f8f8f; }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: #1E1E1E; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn.add { background: rgba(0,200,83,0.12); color: #00C853; }
        .loading-row { display: flex; justify-content: center; padding: 40px; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #262626; border-top-color: #00C853;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-box {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 56px 20px; text-align: center;
        }
        .empty-title { font-size: 15px; font-weight: 700; }
        .empty-sub { font-size: 12px; color: #666; line-height: 1.5; }
        .empty-btn {
          margin-top: 6px; background: #00C853; color: #00130a;
          border: none; border-radius: 12px; padding: 10px 22px;
          font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .value-card {
          background: linear-gradient(160deg, #0f2a1f, #101018);
          border: 1px solid rgba(0,200,83,0.2);
          border-radius: 18px; padding: 18px; margin: 10px 0 12px;
        }
        .vc-label { font-size: 12px; color: #8f8f8f; }
        .vc-value { font-size: 30px; font-weight: 800; font-family: 'JetBrains Mono', monospace; margin: 4px 0 8px; }
        .vc-meta { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
        .vc-day { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .vc-total { font-size: 12px; color: #a3a3a3; font-family: 'JetBrains Mono', monospace; }
        .up { color: #00C853; }
        .down { color: #FF4D4F; }
        .warn { color: #facc15; }
        .vc-chart { display: flex; justify-content: center; }
        .chart-empty { color: #555; padding: 50px 0; font-size: 12px; }
        .breakdown-card, .sector-card, .positions-card {
          background: #1E1E1E; border-radius: 18px; padding: 16px; margin-bottom: 12px;
        }
        .card-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
        .bd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .bd-item {
          background: #141414; border-radius: 12px; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .bd-label { font-size: 10px; color: #8f8f8f; }
        .bd-value { font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .sec-body { display: flex; align-items: center; gap: 20px; }
        .sec-legend { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .sec-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a3a3a3; }
        .sec-item .sec-pct { margin-left: auto; color: #fff; font-weight: 600; }
        .sw { width: 10px; height: 10px; border-radius: 3px; }
        .sec-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pos-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 0; border-bottom: 1px solid #2a2a2a; cursor: pointer;
        }
        .pos-row:last-child { border-bottom: none; }
        .pos-logo {
          width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 14px; overflow: hidden;
        }
        .pos-logo img { width: 100%; height: 100%; object-fit: cover; }
        .pos-info { flex: 1; min-width: 0; }
        .pos-name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pos-sub { font-size: 11px; color: #8f8f8f; }
        .pos-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .pos-value { font-size: 13px; font-weight: 700; }
        .pos-pl { display: flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 700; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .ai-card {
          background: linear-gradient(160deg, #181a24, #101018);
          border: 1px solid rgba(114,102,217,0.25);
          border-radius: 18px; padding: 16px; margin-bottom: 12px;
        }
        .ai-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .ai-badge { display: flex; align-items: center; gap: 6px; color: #a78bfa; font-size: 13px; font-weight: 700; }
        .ai-premium {
          font-size: 9px; font-weight: 800; letter-spacing: 1px;
          color: #a78bfa; background: rgba(114,102,217,0.15);
          padding: 3px 8px; border-radius: 6px;
        }
        .ai-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
        .ai-stat {
          background: #14141c; border-radius: 12px; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .ai-stat-label { font-size: 10px; color: #8f8f8f; }
        .ai-stat-value { font-size: 14px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .risk-wrap { display: flex; flex-direction: column; gap: 6px; }
        .risk-text { font-size: 12px; font-weight: 700; }
        .risk-bar { width: 100%; height: 5px; border-radius: 3px; background: #26262f; overflow: hidden; }
        .risk-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
        .ai-recos { border-top: 1px solid #26262f; padding-top: 12px; }
        .reco-title { font-size: 12px; font-weight: 700; color: #a3a3a3; margin-bottom: 8px; }
        .reco-item {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 10px; margin-bottom: 6px;
          font-size: 12px;
        }
        .reco-item.ok { background: rgba(0,200,83,0.06); color: #d8f7ec; }
        .reco-item.warn { background: rgba(250,204,21,0.06); color: #fdf3d3; }
        .reco-item.info { background: rgba(114,102,217,0.08); color: #e2defc; }
        .reco-icon {
          width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 800;
        }
        .reco-item.ok .reco-icon { background: rgba(0,200,83,0.2); color: #00C853; }
        .reco-item.warn .reco-icon { background: rgba(250,204,21,0.2); color: #facc15; }
        .reco-item.info .reco-icon { background: rgba(114,102,217,0.25); color: #a78bfa; }
        .reco-v { margin-left: auto; font-size: 11px; font-weight: 600; }
        .orders-card {
          background: #1E1E1E; border-radius: 18px; padding: 16px; margin-bottom: 12px;
        }
        .orders-empty { font-size: 12px; color: #666; padding: 8px 0; }
        .orders-list { display: flex; flex-direction: column; }
        .order-row {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 0; border-bottom: 1px solid #2a2a2a;
          font-size: 12px;
        }
        .order-row:last-child { border-bottom: none; }
        .order-side {
          flex-shrink: 0; font-size: 10px; font-weight: 800;
          padding: 3px 8px; border-radius: 8px; min-width: 46px; text-align: center;
        }
        .order-side.buy { background: rgba(0,200,83,0.15); color: #00C853; }
        .order-side.sell { background: rgba(255,77,79,0.15); color: #FF4D4F; }
        .order-sym { font-weight: 700; color: #fff; }
        .order-detail { flex: 1; min-width: 0; color: #8f8f8f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .order-total { color: #fff; font-weight: 600; }
        .footnote { text-align: center; font-size: 10px; color: #555; padding: 8px 0 4px; }
      `}</style>
    </div>
  )
}
