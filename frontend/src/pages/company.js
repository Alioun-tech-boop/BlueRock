import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanyFull, getPosition, placeOrder } from '../services/api'
import { useAuth } from '../lib/auth'
import {
  ArrowLeft, Star, Share2, Building2, Users, MapPin, Calendar,
  Globe, TrendingUp, TrendingDown, Newspaper, ChevronRight,
  Check, AlertTriangle, Sparkles, X,
} from 'lucide-react'
import { detectLang, t, fmtPrice, fmtChange } from '../lib/i18n'
import MarketChart from '../components/MarketChart'
import InfoDot from '../components/InfoDot'
import NewsThumb from '../components/NewsThumb'

const FAV_KEY = 'bluerock_favorites_v1'

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const RATING_RANK = { AAA: 1, AA: 2, A: 3, BBB: 4, BB: 5, B: 6, CCC: 7, CC: 8, C: 9, D: 10, E: 11 }

function ratingClass(rating) {
  const rank = RATING_RANK[rating]
  if (!rank) return 'mid'
  if (rank <= 4) return 'good'
  if (rank <= 7) return 'mid'
  return 'down'
}

const PERIODS = [
  { id: '1J', type: 'last', n: 1 },
  { id: '5J', type: 'last', n: 5 },
  { id: '1M', type: 'months', n: 1 },
  { id: '3M', type: 'months', n: 3 },
  { id: '6M', type: 'months', n: 6 },
  { id: '1A', type: 'months', n: 12 },
  { id: '5A', type: 'months', n: 60 },
  { id: 'MAX', type: 'all', n: 0 },
]

function ScoreRing({ score, size = 88, stroke = 9 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const v = Math.max(0, Math.min(10, score || 0))
  const frac = v / 10
  const color = v >= 7 ? '#00C853' : v >= 5 ? '#facc15' : '#FF4D4F'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#262626" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${circ * frac} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize={size * 0.26} fontWeight="800" fontFamily="JetBrains Mono, monospace">
        {v.toFixed(1)}
      </text>
    </svg>
  )
}

function Pie({ slices, size = 150 }) {
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
      <path
        key={i}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
        fill={s.color}
      />
    )
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs}
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#141414" />
    </svg>
  )
}

export default function Company() {
  const router = useRouter()
  const { id } = router.query
  const [lang, setLang] = useState('fr')
  const [full, setFull] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [period, setPeriod] = useState('1A')
  const [isFav, setIsFav] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    if (!id) return
    mounted.current = true
    setLang(detectLang())
    setLoading(true)
    setError(false)
    getCompanyFull(id, 20000)
      .then(res => {
        if (!mounted.current) return
        setFull(res.data)
        setIsFav(loadJSON(FAV_KEY, []).includes(res.data.company.symbol))
        try { localStorage.setItem('bluerock_last_symbol', res.data.company.symbol) } catch {}
      })
      .catch(() => { if (mounted.current) setError(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false }
  }, [id])

  const toggleFavorite = () => {
    if (!full) return
    const favs = loadJSON(FAV_KEY, [])
    const next = favs.includes(full.company.symbol) ? favs.filter(s => s !== full.company.symbol) : [...favs, full.company.symbol]
    saveJSON(FAV_KEY, next)
    setIsFav(next.includes(full.company.symbol))
  }

  const { user } = useAuth()
  const [trade, setTrade] = useState(null)
  const [tradeQty, setTradeQty] = useState(1)
  const [tradePrice, setTradePrice] = useState('')
  const [owned, setOwned] = useState(0)
  const [sending, setSending] = useState(false)
  const [tradeMsg, setTradeMsg] = useState('')
  const [tradeErr, setTradeErr] = useState('')

  const openTrade = (side) => {
    if (!full) return
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    setTrade(side)
    setTradeQty(1)
    setTradePrice(price?.current != null ? String(price.current) : '')
    setTradeMsg('')
    setTradeErr('')
    setSending(false)
    setOwned(0)
    getPosition(full.company.symbol)
      .then(r => setOwned(r.data?.qty || 0))
      .catch(() => {})
  }

  const closeTrade = () => setTrade(null)

  const submitTrade = () => {
    if (!full || !trade) return
    const qty = Math.floor(Number(tradeQty))
    const px = Number(tradePrice)
    if (!qty || qty <= 0) { setTradeErr(t(lang, 'tradeQtyErr')); return }
    if (!px || px <= 0) { setTradeErr(t(lang, 'tradePriceErr')); return }
    if (trade === 'sell' && qty > owned) { setTradeErr(t(lang, 'tradeInsufficient')); return }
    setSending(true)
    setTradeErr('')
    placeOrder({ symbol: full.company.symbol, side: trade, qty, price: px })
      .then(() => {
        setSending(false)
        setTradeMsg(t(lang, 'tradePlaced'))
        setOwned(o => trade === 'buy' ? o + qty : Math.max(0, o - qty))
      })
      .catch(() => {
        setSending(false)
        setTradeErr(t(lang, 'tradeFailed'))
      })
  }

  if (loading && !full) {
    return (
      <div className="mobile-root">
        <div className="loading-center"><div className="spinner" /></div>
        <BottomNav />
        <style jsx>{`
          .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #000; color: #fff; font-family: Inter, -apple-system, sans-serif; }
          .loading-center { flex: 1; display: flex; align-items: center; justify-content: center; }
          .spinner { width: 26px; height: 26px; border: 3px solid #262626; border-top-color: #00C853; border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  if (error || !full) {
    return (
      <div className="mobile-root">
        <div className="loading-center">
          <div className="err-box">
            <span className="err-title">404</span>
            <span>{t(lang, 'notFound')}</span>
            <button className="retry-btn" onClick={() => router.push('/watchlist')}>
              {t(lang, 'watchlist')}
            </button>
          </div>
        </div>
        <BottomNav />
        <style jsx>{`
          .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #000; color: #fff; font-family: Inter, -apple-system, sans-serif; }
          .loading-center { flex: 1; display: flex; align-items: center; justify-content: center; }
          .err-box { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #a3a3a3; font-size: 14px; }
          .err-title { font-size: 32px; font-weight: 800; color: #fff; }
          .retry-btn { background: #00C853; border: none; border-radius: 12px; color: #00130a; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; margin-top: 6px; }
        `}</style>
      </div>
    )
  }

  const { company, price, ratios, scorecard, valuation, ai, history, dividends, profile, news } = full
  const chg = price?.change_percent ?? company.change_percent ?? 0
  const up = chg > 0
  const down = chg < 0
  const rating = scorecard?.rating || company.rating
  const totalScore = scorecard?.total_score ?? company.total_score

  const hasRatios = Object.keys(ratios || {}).length > 0
  const hasAnalysis = Object.keys(scorecard || {}).length > 0
    || Object.keys(valuation || {}).length > 0
    || Boolean(ai?.summary || ai?.recommendation || ai?.confidence)

  const periodDef = PERIODS.find(p => p.id === period) || PERIODS[5]
  const hist = history || []
  const lastDate = hist.length ? hist[hist.length - 1].date : null
  const chartData = (() => {
    if (!lastDate) return hist
    if (periodDef.type === 'last') return hist.slice(-periodDef.n)
    if (periodDef.type === 'all') return hist
    const cutoff = new Date(lastDate)
    cutoff.setMonth(cutoff.getMonth() - periodDef.n)
    cutoff.setDate(1)
    return hist.filter(d => d.date >= cutoff.toISOString().slice(0, 10))
  })()
  const clean = chartData.filter(d => d && d.close != null && !Number.isNaN(+d.close))
  const chartChg = clean.length >= 2 && clean[0].open != null
    ? ((clean[clean.length - 1].close - clean[0].open) / clean[0].open) * 100
    : null

  const fmtMd = n => n != null
    ? (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2)} Md` : `${(n / 1e6).toFixed(1)} M`)
    : '—'
  const fmtVol = n => n != null
    ? (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} K` : String(n))
    : '—'
  const pct = v => v != null ? `${v.toFixed(1)}%` : '—'
  const num = v => v != null ? v.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') : '—'
  const num2 = v => v != null ? v.toFixed(2) : '—'

  const fv = (k, d) => {
    const s = (scorecard || {})[k]
    return s != null ? s : (company || {})[d]
  }

  const strengths = [
    { k: 'profitability_score', i18n: 'strProfit', v: fv('profitability_score', 'profitability_score') },
    { k: 'growth_score', i18n: 'strGrowth', v: fv('growth_score', 'growth_score') },
    { k: 'valuation_score', i18n: 'strValuation', v: fv('valuation_score', 'valuation_score') },
    { k: 'debt_score', i18n: 'strDebt', v: fv('debt_score', 'debt_score') },
    { k: 'liquidity_score', i18n: 'strLiquidity', v: fv('liquidity_score', 'liquidity_score') },
    { k: 'moat_score', i18n: 'strMoat', v: fv('moat_score', 'moat_score') },
    { k: 'momentum_score', i18n: 'strMomentum', v: fv('momentum_score', 'momentum_score') },
  ].filter(s => s.v != null && s.v >= 6.5)

  const weaknesses = [
    { k: 'profitability_score', i18n: 'wkProfit', v: fv('profitability_score', 'profitability_score') },
    { k: 'growth_score', i18n: 'wkGrowth', v: fv('growth_score', 'growth_score') },
    { k: 'valuation_score', i18n: 'wkValuation', v: fv('valuation_score', 'valuation_score') },
    { k: 'debt_score', i18n: 'wkDebt', v: fv('debt_score', 'debt_score') },
    { k: 'liquidity_score', i18n: 'wkLiquidity', v: fv('liquidity_score', 'liquidity_score') },
    { k: 'moat_score', i18n: 'wkMoat', v: fv('moat_score', 'moat_score') },
    { k: 'momentum_score', i18n: 'wkMomentum', v: fv('momentum_score', 'momentum_score') },
  ].filter(s => s.v != null && s.v < 5)

  const discount = valuation?.discount_percent
  const opportunities = []
  if (discount != null && discount > 0) opportunities.push({ i18n: 'oppDiscount', v: `-${discount.toFixed(0)}%` })
  if (chartChg != null && chartChg > 0) opportunities.push({ i18n: 'oppMomentum', v: `+${chartChg.toFixed(1)}%` })
  if (ratios?.dividend_yield != null && ratios.dividend_yield > 3) opportunities.push({ i18n: 'oppDivYield', v: pct(ratios.dividend_yield) })
  if (opportunities.length === 0) opportunities.push({ i18n: 'oppNone', v: '' })

  const risks = []
  if (ratios?.debt_to_equity != null && ratios.debt_to_equity > 1.5) risks.push({ i18n: 'riskDebt', v: num2(ratios.debt_to_equity) })
  if (ratios?.payout_ratio != null && ratios.payout_ratio > 90) risks.push({ i18n: 'riskPayout', v: pct(ratios.payout_ratio) })
  if (ratios?.revenue_growth != null && ratios.revenue_growth < 0) risks.push({ i18n: 'riskRev', v: pct(ratios.revenue_growth) })
  if (rating && ratingClass(rating) === 'down') risks.push({ i18n: 'riskRating', v: rating })
  if (risks.length === 0) risks.push({ i18n: 'riskNone', v: '' })

  const sh = profile?.shareholders || {}
  const pieSlices = [
    { label: t(lang, 'shInstitutional'), value: sh.institutional || 0, color: '#7266D9' },
    { label: t(lang, 'shState'), value: sh.state || 0, color: '#00C853' },
    { label: t(lang, 'shFounders'), value: sh.founders || 0, color: '#facc15' },
    { label: t(lang, 'shPublic'), value: sh.public || 0, color: '#3a3a3a' },
  ]

  const rec = (ai?.recommendation || 'HOLD').toUpperCase()
  const recClass = rec === 'BUY' || rec === 'STRONG BUY' ? 'buy' : rec === 'SELL' || rec === 'STRONG SELL' ? 'sell' : 'hold'
  const recLabel = rec.replace('STRONG ', '')

  const target = ai?.target_price ?? valuation?.target_price
  const upside = target != null && price?.current
    ? ((target - price.current) / price.current) * 100
    : null

  const finItems = [
    { label: t(lang, 'revenue'), value: fmtMd(company.revenue), help: 'hRevenue' },
    { label: t(lang, 'netIncome'), value: fmtMd(company.net_income), help: 'hNetIncome' },
    { label: t(lang, 'netMargin'), value: pct(ratios?.net_margin), help: 'hNetMargin' },
    { label: t(lang, 'roe'), value: pct(ratios?.roe), help: 'hRoe' },
    { label: t(lang, 'roa'), value: pct(ratios?.roa), help: 'hRoa' },
    { label: 'EPS', value: num2(ratios?.eps), help: 'hEps' },
    { label: 'BPA', value: num2(company.eps ?? ratios?.eps), help: 'hBpa' },
    { label: t(lang, 'debtEquity'), value: num2(ratios?.debt_to_equity), help: 'hDebtEquity' },
    { label: t(lang, 'currentRatio'), value: num2(ratios?.current_ratio), help: 'hCurrentRatio' },
    { label: t(lang, 'dividendPerShare'), value: ratios?.dividend_per_share != null ? fmtPrice(lang, ratios.dividend_per_share) : '—', help: 'hDivPerShare' },
    { label: t(lang, 'fcfShare'), value: ratios?.fcf_per_share != null ? fmtPrice(lang, ratios.fcf_per_share) : '—', help: 'hFcfShare' },
  ]

  const shares = company.shares_outstanding

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="co-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={24} />
          </button>
          <div className="co-title">
            <span>{t(lang, 'company')}</span>
          </div>
          <div className="co-actions">
            <button className="icon-btn" aria-label={t(lang, 'share')} onClick={() => {
              if (navigator.share) navigator.share({ title: company.name, text: `${company.symbol} — ${fmtPrice(lang, price?.current)}` }).catch(() => {})
            }}>
              <Share2 size={20} />
            </button>
            <button className={`icon-btn ${isFav ? 'fav-active' : ''}`} onClick={toggleFavorite}>
              <Star size={20} fill={isFav ? '#ffd166' : 'none'} color={isFav ? '#ffd166' : '#fff'} />
            </button>
          </div>
        </header>

        <section className="hero">
          <div className="hero-logo-wrap">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.symbol} className="hero-logo" />
            ) : (
              <div className="hero-logo-fallback">{company.symbol?.[0]}</div>
            )}
          </div>
          <h1 className="hero-name">{company.name || company.symbol}</h1>
          <div className="hero-tags">
            <span className="tag ticker">{company.symbol}</span>
            <span className="tag">{company.sector}</span>
            <span className="tag">{t(lang, 'marketBrvm')}</span>
            {full.data_synthetic && <span className="tag synth">{t(lang, 'synthBadge')}</span>}
          </div>
          <div className="hero-price-row">
            <span className="hero-price">{fmtPrice(lang, price?.current)}</span>
            <span className={`hero-chg ${up ? 'up' : down ? 'down' : 'flat'}`}>
              {up ? '+' : ''}{fmtChange(lang, chg)}
            </span>
          </div>
        </section>

        <section className="stats-card">
          <div className="stat">
            <div className="label-row">
              <span className="stat-label">{t(lang, 'marketCap')}</span>
              <InfoDot text={t(lang, 'hMarketCap')} />
            </div>
            <span className="stat-value">{fmtMd(price?.market_cap ?? company.market_cap)}</span>
          </div>
          <div className="stat">
            <div className="label-row">
              <span className="stat-label">{t(lang, 'volume')}</span>
              <InfoDot text={t(lang, 'hVolume')} />
            </div>
            <span className="stat-value">{fmtVol(price?.volume)}</span>
          </div>
          <div className="stat">
            <div className="label-row">
              <span className="stat-label">{t(lang, 'per')}</span>
              <InfoDot text={t(lang, 'hPer')} />
            </div>
            <span className="stat-value">{price?.per != null ? price.per.toFixed(2) : '—'}</span>
          </div>
          <div className="stat">
            <div className="label-row">
              <span className="stat-label">{t(lang, 'divYield')}</span>
              <InfoDot text={t(lang, 'hDivYield')} />
            </div>
            <span className="stat-value">{pct(ratios?.dividend_yield)}</span>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <div>
              <div className="chart-price">{fmtPrice(lang, chartData[chartData.length - 1]?.close ?? price?.current)}</div>
              <div className={`chart-chg ${chartChg != null && chartChg >= 0 ? 'up' : 'down'}`}>
                {chartChg != null ? `${chartChg >= 0 ? '+' : ''}${chartChg.toFixed(2)}%` : ''}
              </div>
            </div>
            <div className="periods">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  className={`period ${period === p.id ? 'active' : ''}`}
                  onClick={() => setPeriod(p.id)}
                >
                  {p.id}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-wrap">
            <MarketChart data={chartData} period={period.toLowerCase()} lang={lang} />
          </div>
          <div className="chart-legend">
            <span className="lg up"><i className="lg-candle-up" /> {t(lang, 'chartUp')}</span>
            <span className="lg down"><i className="lg-candle-down" /> {t(lang, 'chartDown')}</span>
            <span className="lg"><i className="lg-vol" /> {t(lang, 'chartVolume')}</span>
          </div>
        </section>

        <section className="trade-row">
          <button className="trade-btn buy" onClick={() => openTrade('buy')}>{t(lang, 'buy')}</button>
          <button className="trade-btn sell" onClick={() => openTrade('sell')}>{t(lang, 'sell')}</button>
        </section>

        <section className="info-card">
          <div className="card-title"><Building2 size={16} /> {t(lang, 'companyInfo')}</div>
          {profile ? (
            <>
              <div className="info-grid">
                <div className="info-item">
                  <span className="ii-icon"><MapPin size={15} /></span>
                  <div>
                    <div className="ii-label">{t(lang, 'headquarters')}</div>
                    <div className="ii-value">{profile.headquarters || '—'}</div>
                  </div>
                </div>
                <div className="info-item">
                  <span className="ii-icon"><Users size={15} /></span>
                  <div>
                    <div className="ii-label">{t(lang, 'ceo')}</div>
                    <div className="ii-value">{profile.ceo || '—'}</div>
                  </div>
                </div>
                <div className="info-item">
                  <span className="ii-icon"><TrendingUp size={15} /></span>
                  <div>
                    <div className="ii-label">{t(lang, 'employees')}</div>
                    <div className="ii-value">{num(profile.employees)}</div>
                  </div>
                </div>
                <div className="info-item">
                  <span className="ii-icon"><Calendar size={15} /></span>
                  <div>
                    <div className="ii-label">{t(lang, 'founded')}</div>
                    <div className="ii-value">{profile.founded || '—'}</div>
                  </div>
                </div>
                <div className="info-item">
                  <span className="ii-icon"><Globe size={15} /></span>
                  <div>
                    <div className="ii-label">{t(lang, 'website')}</div>
                    <div className="ii-value link">{company.website || '—'}</div>
                  </div>
                </div>
                <div className="info-item">
                  <span className="ii-icon"><Building2 size={15} /></span>
                  <div>
                    <div className="ii-label">ISIN</div>
                    <div className="ii-value mono">{company.isin || '—'}</div>
                  </div>
                </div>
              </div>
              {profile.activity && <p className="activity">{profile.activity}</p>}
            </>
          ) : (
            <p className="info-empty">{t(lang, 'noProfileData')}</p>
          )}
        </section>

        <section className="fin-card">
          <div className="card-title">{t(lang, 'financials')}</div>
          {hasRatios || company.revenue != null || company.net_income != null ? (
            <div className="fin-grid">
              {finItems.map((it, i) => (
                <div key={i} className="fin-item">
                  <div className="label-row">
                    <span className="fin-label">{it.label}</span>
                    <InfoDot text={t(lang, it.help)} />
                  </div>
                  <span className="fin-value">{it.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="info-empty">{t(lang, 'noFinancialData')}</p>
          )}
        </section>

        {dividends?.length > 0 && (
          <section className="div-card">
            <div className="card-title">{t(lang, 'dividends')}</div>
            <div className="div-head">
              <span>{t(lang, 'fiscalYear')}<InfoDot text={t(lang, 'hFiscalYear')} /></span>
              <span>{t(lang, 'dividendPerShare')}<InfoDot text={t(lang, 'hDivPerShare')} /></span>
              <span>{t(lang, 'yield')}<InfoDot text={t(lang, 'hYield')} /></span>
            </div>
            {dividends.slice(-6).reverse().map((d, i) => (
              <div key={i} className="div-row">
                <span className="mono">{d.fiscal_year}</span>
                <span className="mono">{fmtPrice(lang, d.dividend_per_share)}</span>
                <span className="mono up">{d.yield_pct != null ? d.yield_pct.toFixed(2) + '%' : '—'}</span>
              </div>
            ))}
          </section>
        )}

        {profile?.shareholders && (
          <section className="sh-card">
            <div className="card-title">{t(lang, 'shareholders')}</div>
            <div className="sh-body">
              <Pie slices={pieSlices} />
              <div className="sh-legend">
                {pieSlices.map((s, i) => (
                  <div key={i} className="sh-legend-item">
                    <i className="sw" style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span className="mono">{s.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {hasAnalysis ? (
          <section className="ai-card">
            <div className="ai-head">
              <span className="ai-badge"><Sparkles size={14} /> {t(lang, 'aiAnalysis')}</span>
              <span className="ai-premium">PREMIUM</span>
            </div>
          <div className="ai-score-row">
            <ScoreRing score={totalScore} />
            <div className="ai-score-info">
              <span className={`rec-badge ${recClass}`}>{recLabel}</span>
              <span className="ai-score-label">
                <span>{t(lang, 'score')} {t(lang, 'outOf10')}</span>
                <InfoDot text={t(lang, 'hScore')} />
              </span>
              <span className="ai-confidence">
                <span>{t(lang, 'confidence')}: {(ai?.confidence ?? 0).toFixed(1)}/10</span>
                <InfoDot text={t(lang, 'hConfidence')} />
              </span>
            </div>
          </div>
          {ai?.summary && <p className="ai-summary">{ai.summary}</p>}

          <div className="ai-col">
            <div className="ai-col-title good"><TrendingUp size={14} /> {t(lang, 'strengths')}</div>
            {strengths.map((s, i) => (
              <div key={i} className="ai-list-item good">
                <Check size={15} />
                <span>{t(lang, s.i18n)}</span>
                <span className="mono">{s.v.toFixed(1)}</span>
              </div>
            ))}
            {strengths.length === 0 && <div className="ai-none">{t(lang, 'none')}</div>}
          </div>

          <div className="ai-col">
            <div className="ai-col-title bad"><TrendingDown size={14} /> {t(lang, 'weaknesses')}</div>
            {weaknesses.map((s, i) => (
              <div key={i} className="ai-list-item bad">
                <Check size={15} />
                <span>{t(lang, s.i18n)}</span>
                <span className="mono">{s.v.toFixed(1)}</span>
              </div>
            ))}
            {weaknesses.length === 0 && <div className="ai-none">{t(lang, 'none')}</div>}
          </div>

          <div className="ai-col">
            <div className="ai-col-title good">{t(lang, 'opportunities')}</div>
            {opportunities.map((o, i) => (
              <div key={i} className="ai-list-item good">
                <Check size={15} />
                <span>{t(lang, o.i18n)}</span>
                {o.v && <span className="mono">{o.v}</span>}
              </div>
            ))}
          </div>

          <div className="ai-col">
            <div className="ai-col-title bad">{t(lang, 'risks')}</div>
            {risks.map((o, i) => (
              <div key={i} className="ai-list-item bad">
                <AlertTriangle size={15} />
                <span>{t(lang, o.i18n)}</span>
                {o.v && <span className="mono">{o.v}</span>}
              </div>
            ))}
          </div>

          <div className="ai-forecast">
            <div className="card-title">{t(lang, 'forecasts')}</div>
            <div className="fc-grid">
              <div className="fc-item">
                <span className="fc-label">{t(lang, 'targetPrice')}<InfoDot text={t(lang, 'hTargetPrice')} /></span>
                <span className="fc-value">{target != null ? fmtPrice(lang, target) : '—'}</span>
              </div>
              <div className="fc-item">
                <span className="fc-label">{t(lang, 'upside')}<InfoDot text={t(lang, 'hUpside')} /></span>
                <span className={`fc-value ${upside != null && upside >= 0 ? 'up' : 'down'}`}>
                  {upside != null ? `${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="fc-item">
                <span className="fc-label">DCF<InfoDot text={t(lang, 'hDcf')} /></span>
                <span className="fc-value">{valuation?.dcf_value != null ? fmtPrice(lang, valuation.dcf_value) : '—'}</span>
              </div>
              <div className="fc-item">
                <span className="fc-label">Graham<InfoDot text={t(lang, 'hGraham')} /></span>
                <span className="fc-value">{valuation?.graham_value != null ? fmtPrice(lang, valuation.graham_value) : '—'}</span>
              </div>
              <div className="fc-item">
                <span className="fc-label">Buffett<InfoDot text={t(lang, 'hBuffett')} /></span>
                <span className="fc-value">{valuation?.buffett_value != null ? fmtPrice(lang, valuation.buffett_value) : '—'}</span>
              </div>
              <div className="fc-item">
                <span className="fc-label">{t(lang, 'valuationDiscount')}<InfoDot text={t(lang, 'hDiscount')} /></span>
                <span className={`fc-value ${discount != null && discount > 0 ? 'up' : 'down'}`}>
                  {discount != null ? `${discount > 0 ? '-' : '+'}${Math.abs(discount).toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          </div>
          </section>
        ) : (
          <section className="ai-card">
            <div className="ai-head">
              <span className="ai-badge"><Sparkles size={14} /> {t(lang, 'aiAnalysis')}</span>
              <span className="ai-premium">PREMIUM</span>
            </div>
            <p className="info-empty">{t(lang, 'noAnalysisData')}</p>
          </section>
        )}

        <section className="news-card">
          <div className="card-title"><Newspaper size={16} /> {t(lang, 'news')}</div>
          {(news || []).length === 0 ? (
            <div className="news-empty">{t(lang, 'noNews')}</div>
          ) : (
            news.map((n, i) => (
              <div key={i} className="news-item" onClick={() => n.link && window.open(n.link, '_blank')}>
                <div className="news-row">
                  <NewsThumb image={n.image} label={n.source} size={54} />
                  <div className="news-text">
                    <div>
                      <span className="news-source">{n.source}</span>
                      <span className="news-date">{new Date(n.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}</span>
                    </div>
                    <div className="news-title">{n.title}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        {trade && (
          <div className="trade-overlay" onClick={closeTrade}>
            <div className="trade-modal" onClick={e => e.stopPropagation()}>
              <div className="tm-head">
                <span className={`tm-side ${trade}`}>
                  {trade === 'buy' ? t(lang, 'buy') : t(lang, 'sell')} — {company.symbol}
                </span>
                <button className="tm-close" onClick={closeTrade} aria-label={t(lang, 'cancel')}><X size={18} /></button>
              </div>
              {tradeMsg ? (
                <div className="tm-done">
                  <span className="tm-done-icon"><Check size={40} color="#00C853" /></span>
                  <span className="tm-done-title">{tradeMsg}</span>
                  <span className="tm-done-sub">
                    {company.symbol} · {tradeQty} {t(lang, 'shares').toLowerCase()} @ {fmtPrice(lang, Number(tradePrice))}
                  </span>
                  <button className="tm-btn" onClick={closeTrade}>OK</button>
                </div>
              ) : (
                <>
                  {trade === 'sell' && (
                    <div className="tm-owned">{t(lang, 'tradeAvailable')} : <b className="mono">{owned}</b></div>
                  )}
                  <div className="tm-row">
                    <label className="tm-label">{t(lang, 'shares')}</label>
                    <input
                      className="tm-input mono"
                      type="number" min="1" step="1"
                      value={tradeQty}
                      onChange={e => setTradeQty(e.target.value)}
                    />
                  </div>
                  <div className="tm-row">
                    <label className="tm-label">{t(lang, 'price')} (FCFA)</label>
                    <input
                      className="tm-input mono"
                      type="number" min="0" step="0.01"
                      value={tradePrice}
                      onChange={e => setTradePrice(e.target.value)}
                    />
                  </div>
                  <div className="tm-total">
                    <span>{t(lang, 'total')}</span>
                    <span className="mono">{fmtPrice(lang, (Number(tradeQty) || 0) * (Number(tradePrice) || 0))}</span>
                  </div>
                  {tradeErr && <div className="tm-err"><AlertTriangle size={13} /> {tradeErr}</div>}
                  <button className={`tm-btn ${trade}`} onClick={submitTrade} disabled={sending}>
                    {sending ? '...' : t(lang, 'tradePlace')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="footnote">
          {t(lang, 'dataSource')} · {t(lang, 'updated')} {new Date(price?.date || new Date()).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}
        </div>
      </div>

      <BottomNav active="watchlist" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .co-header {
          display: flex; align-items: center; justify-content: space-between; height: 56px;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .fav-active { background: rgba(255,209,102,0.1); }
        .co-actions { display: flex; gap: 2px; }
        .co-title span { font-size: 17px; font-weight: 700; }
        .hero { display: flex; flex-direction: column; align-items: center; padding: 8px 0 16px; }
        .hero-logo-wrap {
          width: 76px; height: 76px; border-radius: 22px; overflow: hidden;
          background: linear-gradient(160deg, #1E1E1E, #131313);
          display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
        }
        .hero-logo { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
        .hero-logo-fallback { font-size: 30px; font-weight: 800; color: #8b5cf6; }
        .hero-name { font-size: 20px; font-weight: 800; text-align: center; margin: 0 0 8px; }
        .hero-tags { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 14px; }
        .tag {
          font-size: 11px; font-weight: 600; color: #a3a3a3;
          background: #1E1E1E; border: 1px solid #2a2a2a;
          border-radius: 8px; padding: 4px 10px;
        }
        .tag.ticker { color: #00C853; background: rgba(0,200,83,0.1); border-color: rgba(0,200,83,0.3); font-family: 'JetBrains Mono', monospace; }
        .tag.synth { color: #ffd166; background: rgba(255,209,102,0.1); border-color: rgba(255,209,102,0.35); }
        .hero-price-row { display: flex; align-items: center; gap: 10px; }
        .hero-price { font-size: 32px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
        .hero-chg { font-size: 14px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .hero-chg.up { color: #00C853; }
        .hero-chg.down { color: #FF4D4F; }
        .hero-chg.flat { color: #8f8f8f; }
        .stats-card {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
          margin-bottom: 12px;
        }
        .stat {
          background: #1E1E1E; border-radius: 14px;
          padding: 10px 8px; display: flex; flex-direction: column; gap: 4px;
          align-items: center;
        }
        .stat-label { font-size: 10px; color: #8f8f8f; }
        .stat-value { font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .label-row { display: inline-flex; align-items: center; gap: 4px; }
        .stats-card .label-row { justify-content: center; }
        .chart-card {
          background: #0B0B0B; border: 1px solid rgba(255,255,255,0.05);
          border-radius: 24px; padding: 14px 14px 10px; margin-bottom: 12px;
          animation: tvIn 0.3s ease both;
        }
        @keyframes tvIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .chart-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .chart-price { font-size: 22px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
        .chart-chg { font-size: 12px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .chart-chg.up { color: #00C853; }
        .chart-chg.down { color: #FF4D4F; }
        .chart-wrap { display: flex; flex-direction: column; height: clamp(420px, 62vh, 680px); min-height: 420px; }
        .periods { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: 150px; }
        .period {
          background: none; border: none; color: #8f8f8f;
          font-size: 11px; font-weight: 600; padding: 4px 6px;
          border-radius: 8px; cursor: pointer; font-family: inherit;
        }
        .period.active { background: #00C853; color: #00130a; font-weight: 700; }
        .chart-empty { color: #555; padding: 60px 0; font-size: 12px; }
        .chart-legend { display: flex; gap: 14px; justify-content: center; margin-top: 8px; }
        .lg { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #8f8f8f; }
        .lg-candle-up { width: 8px; height: 10px; border-radius: 1px; background: #00C853; border-left: 1px solid #00C853; }
        .lg-candle-down { width: 8px; height: 10px; border-radius: 1px; background: #FF4D4F; border-left: 1px solid #FF4D4F; }
        .lg-vol { width: 8px; height: 4px; border-radius: 1px; background: rgba(255,255,255,0.4); }
        .lg.up { color: #00C853; }
        .lg.down { color: #FF4D4F; }
        .trade-row { display: flex; gap: 10px; margin-bottom: 16px; }
        .trade-btn {
          flex: 1; height: 48px; border: none; border-radius: 14px;
          font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .trade-btn.buy { background: #00C853; color: #00130a; }
        .trade-btn.sell { background: #FF4D4F; color: #fff; }
        .trade-overlay {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(0,0,0,0.72);
          display: flex; align-items: flex-end; justify-content: center;
        }
        .trade-modal {
          width: 100%; max-width: 480px;
          background: #141414; border: 1px solid #262626;
          border-radius: 20px 20px 0 0;
          padding: 16px 16px 28px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .tm-head { display: flex; align-items: center; justify-content: space-between; }
        .tm-side {
          font-size: 15px; font-weight: 800; padding: 5px 12px; border-radius: 10px;
          font-family: 'JetBrains Mono', monospace;
        }
        .tm-side.buy { background: rgba(0,200,83,0.15); color: #00C853; }
        .tm-side.sell { background: rgba(255,77,79,0.15); color: #FF4D4F; }
        .tm-close {
          width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
          background: #1E1E1E; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .tm-owned {
          font-size: 12px; color: #a3a3a3;
          background: #1E1E1E; border-radius: 10px; padding: 9px 12px;
        }
        .tm-owned b { color: #fff; font-weight: 700; }
        .tm-row { display: flex; flex-direction: column; gap: 6px; }
        .tm-label { font-size: 11px; color: #8f8f8f; font-weight: 600; }
        .tm-input {
          background: #1B1B1B; border: 1px solid #2a2a2a; border-radius: 12px;
          color: #fff; font-size: 15px; padding: 12px; outline: none;
          font-family: inherit;
        }
        .tm-input:focus { border-color: #3d3d3d; }
        .tm-total {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 13px; color: #a3a3a3;
          background: #1E1E1E; border-radius: 10px; padding: 10px 12px;
        }
        .tm-total .mono { font-size: 15px; font-weight: 800; color: #fff; }
        .tm-err {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: #ff8a8a;
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          padding: 9px 12px; border-radius: 10px;
        }
        .tm-btn {
          height: 48px; border: none; border-radius: 14px;
          font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
          background: #00C853; color: #00130a;
        }
        .tm-btn.sell { background: #FF4D4F; color: #fff; }
        .tm-btn:disabled { opacity: 0.6; cursor: default; }
        .tm-done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0 4px; }
        .tm-done-icon {
          width: 64px; height: 64px; border-radius: 50%;
          background: rgba(0,200,83,0.12);
          display: flex; align-items: center; justify-content: center;
        }
        .tm-done-title { font-size: 15px; font-weight: 800; }
        .tm-done-sub { font-size: 12px; color: #8f8f8f; font-family: 'JetBrains Mono', monospace; }
        .tm-done .tm-btn { width: 100%; margin-top: 6px; }
        .info-card, .fin-card, .div-card, .sh-card, .news-card {
          background: #1E1E1E; border-radius: 18px; padding: 16px; margin-bottom: 12px;
        }
        .card-title {
          display: flex; align-items: center; gap: 7px;
          font-size: 15px; font-weight: 700; margin-bottom: 12px;
        }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .info-item { display: flex; gap: 10px; align-items: flex-start; }
        .ii-icon {
          width: 30px; height: 30px; flex-shrink: 0; border-radius: 9px;
          background: rgba(139,92,246,0.12); color: #a78bfa;
          display: flex; align-items: center; justify-content: center;
        }
        .ii-label { font-size: 10px; color: #8f8f8f; margin-bottom: 2px; }
        .ii-value { font-size: 12px; font-weight: 600; word-break: break-word; }
        .ii-value.mono { font-family: 'JetBrains Mono', monospace; font-size: 11px; }
        .ii-value.link { color: #a78bfa; }
        .activity { font-size: 12px; color: #a3a3a3; line-height: 1.5; margin: 14px 0 0; }
        .info-empty { font-size: 12px; color: #8f8f8f; line-height: 1.6; margin: 4px 0; }
        .fin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .fin-item {
          background: #141414; border-radius: 12px; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .fin-label { font-size: 10px; color: #8f8f8f; }
        .fin-value { font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .div-head, .div-row {
          display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 8px;
          padding: 8px 0; border-bottom: 1px solid #2a2a2a;
        }
        .div-head { font-size: 10px; color: #8f8f8f; text-transform: uppercase; letter-spacing: 0.5px; }
        .div-head span { display: inline-flex; align-items: center; gap: 3px; }
        .div-row { font-size: 12px; }
        .div-head span:last-child, .div-row span:last-child { text-align: right; }
        .div-head span:nth-child(2), .div-row span:nth-child(2) { text-align: center; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .up { color: #00C853; }
        .down { color: #FF4D4F; }
        .sh-body { display: flex; align-items: center; gap: 20px; }
        .sh-legend { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .sh-legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a3a3a3; }
        .sh-legend-item .mono { margin-left: auto; color: #fff; font-weight: 600; }
        .sw { width: 10px; height: 10px; border-radius: 3px; }
        .ai-card {
          background: linear-gradient(160deg, #181a24, #101018);
          border: 1px solid rgba(114,102,217,0.25);
          border-radius: 18px; padding: 16px; margin-bottom: 12px;
        }
        .ai-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .ai-badge {
          display: flex; align-items: center; gap: 6px;
          color: #a78bfa; font-size: 13px; font-weight: 700;
        }
        .ai-premium {
          font-size: 9px; font-weight: 800; letter-spacing: 1px;
          color: #a78bfa; background: rgba(114,102,217,0.15);
          padding: 3px 8px; border-radius: 6px;
        }
        .ai-score-row { display: flex; align-items: center; gap: 18px; margin-bottom: 14px; }
        .ai-score-info { display: flex; flex-direction: column; gap: 6px; }
        .rec-badge {
          align-self: flex-start; font-size: 13px; font-weight: 800;
          padding: 4px 14px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .rec-badge.buy { color: #00C853; background: rgba(0,200,83,0.12); }
        .rec-badge.hold { color: #facc15; background: rgba(250,204,21,0.12); }
        .rec-badge.sell { color: #FF4D4F; background: rgba(255,77,79,0.12); }
        .ai-score-label { font-size: 12px; color: #a3a3a3; }
        .ai-confidence { font-size: 11px; color: #8f8f8f; font-family: 'JetBrains Mono', monospace; }
        .ai-score-label, .ai-confidence { display: inline-flex; align-items: center; gap: 5px; }
        .ai-summary { font-size: 12px; color: #c9c9c9; line-height: 1.6; margin: 0 0 14px; }
        .ai-col { margin-bottom: 12px; }
        .ai-col-title {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 700; margin-bottom: 8px;
        }
        .ai-col-title.good { color: #00C853; }
        .ai-col-title.bad { color: #FF4D4F; }
        .ai-list-item {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 10px; margin-bottom: 6px;
          font-size: 12px;
        }
        .ai-list-item.good { background: rgba(0,200,83,0.06); color: #d8f7ec; }
        .ai-list-item.bad { background: rgba(255,77,79,0.06); color: #ffd6d6; }
        .ai-list-item .mono { margin-left: auto; font-size: 11px; }
        .ai-list-item.good .mono { color: #00C853; }
        .ai-list-item.bad .mono { color: #FF4D4F; }
        .ai-none { font-size: 11px; color: #666; }
        .ai-forecast { margin-top: 14px; padding-top: 14px; border-top: 1px solid #26262f; }
        .fc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .fc-item {
          background: #14141c; border-radius: 10px; padding: 9px 10px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .fc-label { font-size: 10px; color: #8f8f8f; display: inline-flex; align-items: center; gap: 4px; }
        .fc-value { font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .news-item {
          padding: 10px 0; border-bottom: 1px solid #2a2a2a;
          cursor: pointer;
        }
        .news-item:last-child { border-bottom: none; }
        .news-row { display: flex; align-items: center; gap: 10px; }
        .news-text { flex: 1; min-width: 0; }
        .news-source { font-size: 10px; color: #00C853; font-weight: 600; margin-right: 8px; }
        .news-date { font-size: 10px; color: #666; }
        .news-title { font-size: 13px; font-weight: 600; color: #e8e8e8; margin-top: 4px; line-height: 1.4; }
        .news-empty { font-size: 12px; color: #666; padding: 8px 0; }
        .footnote { text-align: center; font-size: 10px; color: #555; padding: 8px 0 4px; }
      `}</style>
    </div>
  )
}

