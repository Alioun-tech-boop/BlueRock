import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanyFull, getPosition, placeOrder, ingestPdf, fetchFinancials, getFetchStatus, getMarketCalendar, getMarketLive } from '../services/api'
import { useAuth } from '../lib/auth'
import {
  ArrowLeft, Star, Share2, Building2, Users, MapPin, Calendar,
  Globe, TrendingUp, TrendingDown, Newspaper, ChevronRight,
  Check, AlertTriangle, Sparkles, X, Upload, Database, FileText,
  RefreshCw, ChevronDown, ExternalLink,
} from 'lucide-react'
import { detectLang, t, fmtPrice, fmtChange } from '../lib/i18n'
import { aggregateOhlc } from '../lib/ohlc'
import MarketChart from '../components/MarketChart'
import InfoDot from '../components/InfoDot'
import NewsThumb from '../components/NewsThumb'

const FAV_KEY = 'bluerock_favorites_v1'

const ADMIN_KEY = 'bluerock_admin_token'

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

function stmtTypeLabel(type, lang) {
  if (type === 'Income Statement') return t(lang, 'finIncome')
  if (type === 'Balance Sheet') return t(lang, 'finBalance')
  if (type === 'Cash Flow Statement') return t(lang, 'finCashFlow')
  if (type === 'Notes') return t(lang, 'finNotes')
  return type
}

function fmtBig(n, lang) {
  if (n == null || Number.isNaN(+n)) return '—'
  const v = +n
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)} Md`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)} M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)} K`
  return v.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')
}

const PERIODS = [
  { id: '1J', kind: '1j' },
  { id: '5J', kind: '5j' },
  { id: '1M', kind: '1m' },
  { id: '3M', kind: '3m' },
  { id: '6M', kind: '6m' },
  { id: '1A', kind: '1a' },
  { id: '5A', kind: '5a' },
  { id: 'MAX', kind: 'max' },
]

function ScoreRing({ score, size = 88, stroke = 9 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const v = Math.max(0, Math.min(10, score || 0))
  const frac = v / 10
  const color = v >= 7 ? '#18C27C' : v >= 5 ? '#facc15' : '#F04438'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#262626" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${circ * frac} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize={size * 0.26} fontWeight="700" fontFamily="Inter, sans-serif">
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
  const [activeSection, setActiveSection] = useState('profile')
  const [calEvents, setCalEvents] = useState(null)
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
        getMarketCalendar()
          .then(r => { if (mounted.current) setCalEvents(r.data.items || []) })
          .catch(() => { if (mounted.current) setCalEvents([]) })
      })
      .catch(() => { if (mounted.current) setError(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const check = () => {
      getMarketLive()
        .then(r => { if (!cancelled) setMarketOpen(r.data?.market_open !== false) })
        .catch(() => {})
    }
    check()
    const iv = setInterval(check, 15000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const reloadFull = () => {
    if (!id) return
    getCompanyFull(id, 20000)
      .then(res => { if (mounted.current) setFull(res.data) })
      .catch(() => {})
  }

  const [stmtOpen, setStmtOpen] = useState({})
  const [reportsOpen, setReportsOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [histLimit, setHistLimit] = useState(30)
  const [importOpen, setImportOpen] = useState(false)
  const [impFile, setImpFile] = useState(null)
  const [impYear, setImpYear] = useState('')
  const [impQuarter, setImpQuarter] = useState('')
  const [impToken, setImpToken] = useState(() => {
    try { return localStorage.getItem(ADMIN_KEY) || '' } catch { return '' }
  })
  const [impBusy, setImpBusy] = useState(false)
  const [impMsg, setImpMsg] = useState('')
  const [impErr, setImpErr] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const fileRef = useRef(null)

  const doImport = async () => {
    if (!impFile || !impYear || !impToken) {
      setImpErr(t(lang, 'finImportRequired'))
      return
    }
    setImpBusy(true)
    setImpErr('')
    setImpMsg('')
    const fd = new FormData()
    fd.append('file', impFile)
    fd.append('company_id', company?.id)
    fd.append('fiscal_year', impYear)
    if (impQuarter) fd.append('quarter', impQuarter)
    try {
      await ingestPdf(fd, impToken)
      setImpMsg(t(lang, 'finUploadOk'))
      setImportOpen(false)
      setImpFile(null)
      reloadFull()
    } catch (e) {
      setImpErr(e.response?.data?.detail || e.message || t(lang, 'ingestError'))
    } finally {
      setImpBusy(false)
    }
  }

  const doSync = async () => {
    if (!impToken) {
      setImpErr(t(lang, 'finImportRequired'))
      setImportOpen(true)
      return
    }
    setSyncBusy(true)
    setSyncMsg('')
    setImpErr('')
    try {
      await fetchFinancials(company?.symbol, 2, impToken)
      setSyncMsg(t(lang, 'finSyncStarted'))
      const iv = setInterval(async () => {
        if (document.hidden) return
        try {
          const st = (await getFetchStatus()).data
          if (st?.status === 'done') {
            clearInterval(iv)
            setSyncBusy(false)
            setSyncMsg(t(lang, 'finSyncDone'))
            reloadFull()
          } else if (st?.status === 'error') {
            clearInterval(iv)
            setSyncBusy(false)
            setSyncMsg(`${t(lang, 'finSyncError')} : ${st?.error || ''}`)
          }
        } catch { /* keep polling */ }
      }, 5000)
    } catch (e) {
      setSyncBusy(false)
      setImpErr(e.response?.data?.detail || e.message)
    }
  }

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
  const [tradeType, setTradeType] = useState('market')
  const [tradeLimit, setTradeLimit] = useState('')
  const [tradeTp, setTradeTp] = useState('')
  const [tradeSl, setTradeSl] = useState('')
  const [owned, setOwned] = useState(0)
  const [sending, setSending] = useState(false)
  const [marketOpen, setMarketOpen] = useState(true)
  const [mcNote, setMcNote] = useState('')
  const [tradeMsg, setTradeMsg] = useState('')
  const [tradeErr, setTradeErr] = useState('')

  const openTrade = (side) => {
    if (!full) return
    if (!marketOpen) {
      setMcNote(t(lang, 'marketClosedHint'))
      return
    }
    setMcNote('')
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    setTrade(side)
    setTradeQty(1)
    setTradePrice(price?.current != null ? String(price.current) : '')
    setTradeType('market')
    setTradeLimit('')
    setTradeTp('')
    setTradeSl('')
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
    if (!marketOpen) {
      setTradeErr(t(lang, 'marketClosedHint'))
      return
    }
    const qty = Math.floor(Number(tradeQty))
    const px = Number(tradePrice)
    if (!qty || qty <= 0) { setTradeErr(t(lang, 'tradeQtyErr')); return }
    if (!px || px <= 0) { setTradeErr(t(lang, 'tradePriceErr')); return }
    const execPx = tradeType === 'limit' ? Number(tradeLimit) : px
    if (tradeType === 'limit' && (!execPx || execPx <= 0)) { setTradeErr(t(lang, 'limitPriceErr')); return }
    const tpV = tradeTp.trim() ? Number(tradeTp) : null
    const slV = tradeSl.trim() ? Number(tradeSl) : null
    if ((tpV != null && !(tpV > execPx)) || (slV != null && !(slV < execPx))) { setTradeErr(t(lang, 'tpslErr')); return }
    if (trade === 'sell' && qty > owned) { setTradeErr(t(lang, 'tradeInsufficient')); return }
    setSending(true)
    setTradeErr('')
    placeOrder({
      symbol: full.company.symbol,
      side: trade,
      qty,
      price: execPx,
      order_type: tradeType,
      limit_price: tradeType === 'limit' ? execPx : null,
      take_profit: tpV,
      stop_loss: slV,
    })
      .then(res => {
        setSending(false)
        const pending = res?.data?.status === 'pending'
        setTradeMsg(t(lang, pending ? 'orderPending' : 'tradePlaced'))
        if (!pending) setOwned(o => trade === 'buy' ? o + qty : Math.max(0, o - qty))
      })
      .catch(err => {
        setSending(false)
        const d = err?.response?.data?.detail
        setTradeErr(d || err?.message || t(lang, 'tradeFailed'))
      })
  }

  if (loading && !full) {
    return (
      <div className="mobile-root">
        <div className="loading-center"><div className="spinner" /></div>
        <BottomNav />
        <style jsx>{`
          .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #0E1627; color: #fff; font-family: Inter, -apple-system, sans-serif; }
          .loading-center { flex: 1; display: flex; align-items: center; justify-content: center; }
          .spinner { width: 26px; height: 26px; border: 3px solid #262626; border-top-color: #18C27C; border-radius: 50%; animation: spin 0.8s linear infinite; }
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
          .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #0E1627; color: #fff; font-family: Inter, -apple-system, sans-serif; }
          .loading-center { flex: 1; display: flex; align-items: center; justify-content: center; }
          .err-box { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #9AA3B2; font-size: 14px; }
          .err-title { font-size: 32px; font-weight: 700; color: #fff; }
          .retry-btn { background: #18C27C; border: none; border-radius: 12px; color: #00130a; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; margin-top: 6px; }
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
  const chartData = aggregateOhlc(hist, periodDef.kind)
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
    { label: t(lang, 'shState'), value: sh.state || 0, color: '#18C27C' },
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

  const statements = full?.statements || []
  const sessions = [...(history || [])].reverse()
  const visSessions = sessions.slice(0, histLimit)

  const companyEvents = (calEvents || [])
    .filter(e => {
      const sym = (e.symbol || '').toUpperCase()
      const co = (e.company || '').toLowerCase()
      const name = (company?.name || '').toLowerCase()
      const symbol = (company?.symbol || '').toUpperCase()
      return sym === symbol || (co.length > 3 && name.includes(co)) || (co.length > 3 && co.includes(name))
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

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
            <MarketChart data={chartData} period={period.toLowerCase()} lang={lang} symbol={company?.symbol} />
          </div>
          <div className="chart-legend">
            <span className="lg up"><i className="lg-candle-up" /> {t(lang, 'chartUp')}</span>
            <span className="lg down"><i className="lg-candle-down" /> {t(lang, 'chartDown')}</span>
            <span className="lg"><i className="lg-vol" /> {t(lang, 'chartVolume')}</span>
          </div>
        </section>

        <section className="trade-row">
          {mcNote && <div className="mc-note"><AlertTriangle size={13} /> {mcNote}</div>}
          <button className="trade-btn buy" onClick={() => openTrade('buy')}>{t(lang, 'buy')}</button>
          <button className="trade-btn sell" onClick={() => openTrade('sell')}>{t(lang, 'sell')}</button>
        </section>

        <div className="co-tabs">
          {[
            { key: 'profile', label: t(lang, 'coTabCompany') },
            { key: 'finance', label: t(lang, 'coTabFinance') },
            { key: 'dividends', label: t(lang, 'coTabDividends') },
            { key: 'analysis', label: t(lang, 'coTabAnalysis') },
            { key: 'news', label: t(lang, 'coTabNews') },
            { key: 'agenda', label: t(lang, 'coTabAgenda') },
          ].map(tab => (
            <button
              key={tab.key}
              className={`co-tab ${activeSection === tab.key ? 'active' : ''}`}
              onClick={() => setActiveSection(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSection === 'profile' && (<>
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
        </>)}

        {activeSection === 'finance' && (<>
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

        <section className="fr-card">
          <button className={`card-toggle ${reportsOpen ? '' : 'closed'}`} onClick={() => setReportsOpen(o => !o)}>
            <span className="ct-title"><Database size={16} /> {t(lang, 'finReports')}</span>
            <ChevronDown size={16} className={`ct-chev ${reportsOpen ? 'open' : ''}`} />
          </button>
          {reportsOpen && (
          <>
            <div className="fr-actions">
              <button className="fr-btn" onClick={() => { setImportOpen(true); setImpErr(''); setImpMsg('') }}>
                <Upload size={13} /> {t(lang, 'finImportPdf')}
              </button>
              <button className="fr-btn" onClick={doSync} disabled={syncBusy}>
                <RefreshCw size={13} className={`fr-spin ${syncBusy ? 'spin' : ''}`} /> {t(lang, 'finSyncReports')}
              </button>
            </div>
            {syncMsg && <div className="fr-msg ok">{syncMsg}</div>}
            <div className="fr-note">{t(lang, 'finSyncPending')}</div>
            {statements.length === 0 ? (
              <p className="info-empty">{t(lang, 'finNoReports')}</p>
            ) : (
              statements.map(s => {
                const open = stmtOpen[s.id]
                return (
                  <div key={s.id} className="stmt-block">
                    <button className="stmt-toggle" onClick={() => setStmtOpen(o => ({ ...o, [s.id]: !o[s.id] }))}>
                      <span className="stmt-type">{stmtTypeLabel(s.type, lang)}</span>
                      <span className="stmt-meta">
                        {s.fiscal_year}{s.quarter ? ` · ${t(lang, 'finPeriod')} ${s.quarter}` : ` · ${t(lang, 'finAnnual')}`} · {s.currency}
                      </span>
                      <ChevronDown size={14} className={`stmt-chev ${open ? 'open' : ''}`} />
                    </button>
                    {s.source_url && (
                      <a className="stmt-link" href={s.source_url} target="_blank" rel="noreferrer">
                        <ExternalLink size={11} /> {t(lang, 'finDownloadPdf')}
                      </a>
                    )}
                    {open && (
                      <div className="stmt-items">
                        {s.line_items.map((li, i) => (
                          <div key={i} className="line-item">
                            <span className="li-account">{li.account}</span>
                            <span className="li-val">{fmtBig(li.value, lang)}</span>
                          </div>
                        ))}
                        {s.line_items.length === 0 && <div className="stmt-more">—</div>}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </>
          )}
        </section>

        {sessions.length > 0 && (
          <section className="hist-card">
            <button className={`card-toggle ${histOpen ? '' : 'closed'}`} onClick={() => setHistOpen(o => !o)}>
              <span className="ct-title"><TrendingUp size={16} /> {t(lang, 'finHistory')}</span>
              <ChevronDown size={16} className={`ct-chev ${histOpen ? 'open' : ''}`} />
            </button>
            {histOpen && (
            <>
              <div className="hist-head">
                <span>{t(lang, 'finDate')}</span>
                <span>{t(lang, 'finOpen')}</span>
                <span>{t(lang, 'finHigh')}</span>
                <span>{t(lang, 'finLow')}</span>
                <span>{t(lang, 'finClose')}</span>
                <span>{t(lang, 'finVolume')}</span>
                <span>{t(lang, 'change')}</span>
              </div>
              {visSessions.map((d, i) => {
                const chg = d.close != null && d.open != null
                  ? ((d.close - d.open) / d.open) * 100
                  : null
                return (
                  <div key={i} className="hist-row">
                    <span className="mono hist-date">{String(d.date).slice(0, 10)}</span>
                    <span className="mono">{fmtPrice(lang, d.open)}</span>
                    <span className="mono">{fmtPrice(lang, d.high)}</span>
                    <span className="mono">{fmtPrice(lang, d.low)}</span>
                    <span className="mono hist-close">{fmtPrice(lang, d.close)}</span>
                    <span className="mono hist-vol">{fmtVol(d.volume)}</span>
                    {chg != null && <span className={`mono hist-chg ${chg >= 0 ? 'up' : 'down'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span>}
                  </div>
                )
              })}
              {sessions.length > histLimit && (
                <button className="hist-more" onClick={() => setHistLimit(l => l + 50)}>
                  {t(lang, 'finSeeMore')} ({sessions.length - histLimit})
                </button>
              )}
            </>
            )}
          </section>
        )}
        </>)}

        {activeSection === 'dividends' && (<>
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
        </>)}

        {activeSection === 'profile' && (<>
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
        </>)}

        {activeSection === 'analysis' && (
        <>
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
        </>
        )}

        {activeSection === 'news' && (<>
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
        </>)}

        {activeSection === 'agenda' && (<>
        <section className="co-cal-card">
          <div className="card-title"><Calendar size={16} /> {t(lang, 'coCalendar')}</div>
          {calEvents == null ? (
            <div className="news-empty">{t(lang, 'loading')}</div>
          ) : companyEvents.length === 0 ? (
            <div className="news-empty">{t(lang, 'coCalEmpty')}</div>
          ) : (
            companyEvents.map((e, i) => (
              <div key={i} className="co-cal-row" onClick={() => e.detail && /^https?:/i.test(e.detail) && window.open(e.detail, '_blank', 'noopener')}>
                <span className="co-cal-date mono">{e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                <span className="co-cal-title">{e.title}</span>
                {e.source && <span className="co-cal-src">{e.source}</span>}
              </div>
            ))
          )}
        </section>
        </>)}

        {importOpen && (
          <div className="trade-overlay" onClick={() => setImportOpen(false)}>
            <div className="trade-modal" onClick={e => e.stopPropagation()}>
              <div className="tm-head">
                <span className="tm-side buy"><Upload size={13} /> {t(lang, 'finImportPdf')}</span>
                <button className="tm-close" onClick={() => setImportOpen(false)} aria-label={t(lang, 'cancel')}><X size={18} /></button>
              </div>
              <div className="tm-owned">{company.symbol} — {company.name}</div>
              <div className="tm-row">
                <label className="tm-label">PDF</label>
                <button
                  className={`imp-drop ${impFile ? 'has-file' : ''}`}
                  onClick={() => fileRef.current?.click()}
                >
                  <FileText size={18} />
                  <span>{impFile ? impFile.name : t(lang, 'dropzone')}</span>
                  <input
                    ref={fileRef} type="file" accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => setImpFile(e.target.files?.[0] || null)}
                  />
                </button>
              </div>
              <div className="tm-row imp-row2">
                <div>
                  <label className="tm-label">{t(lang, 'year')}</label>
                  <input
                    className="tm-input mono"
                    type="number" min="2000" max="2100" placeholder="2025"
                    value={impYear} onChange={e => setImpYear(e.target.value)}
                  />
                </div>
                <div>
                  <label className="tm-label">{t(lang, 'finPeriod')}</label>
                  <select className="tm-input" value={impQuarter} onChange={e => setImpQuarter(e.target.value)}>
                    <option value="">{t(lang, 'finAnnual')}</option>
                    <option value="1">T1</option>
                    <option value="2">T2</option>
                    <option value="3">T3</option>
                    <option value="4">T4</option>
                  </select>
                </div>
              </div>
              <div className="tm-row">
                <label className="tm-label">{t(lang, 'finAdminToken')}</label>
                <input
                  className="tm-input mono"
                  type="password"
                  placeholder={t(lang, 'finAdminTokenHelp')}
                  value={impToken}
                  onChange={e => { setImpToken(e.target.value); try { localStorage.setItem(ADMIN_KEY, e.target.value) } catch {} }}
                />
              </div>
              {impErr && <div className="tm-err"><AlertTriangle size={14} /> {impErr}</div>}
              {impMsg && <div className="imp-ok">{impMsg}</div>}
              <button className="tm-btn" onClick={doImport} disabled={impBusy || !impFile}>
                {impBusy ? t(lang, 'extracting') : t(lang, 'extractImport')}
              </button>
            </div>
          </div>
        )}

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
                  <span className="tm-done-icon"><Check size={40} color="#18C27C" /></span>
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
                  <div className="tm-otype">
                    <button
                      className={`tm-otype-btn ${tradeType === 'market' ? 'on' : ''}`}
                      onClick={() => setTradeType('market')}
                    >
                      {t(lang, 'orderMarket')}
                    </button>
                    <button
                      className={`tm-otype-btn ${tradeType === 'limit' ? 'on' : ''}`}
                      onClick={() => setTradeType('limit')}
                    >
                      {t(lang, 'orderLimit')}
                    </button>
                  </div>
                  {tradeType === 'limit' && (
                    <div className="tm-row">
                      <label className="tm-label">{t(lang, 'limitPrice')} (FCFA)</label>
                      <input
                        className="tm-input mono"
                        type="number" min="0" step="0.01"
                        value={tradeLimit}
                        placeholder={tradePrice}
                        onChange={e => setTradeLimit(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="tm-row">
                    <label className="tm-label">{t(lang, 'takeProfit')} (FCFA) — {t(lang, 'opt')}</label>
                    <input
                      className="tm-input mono"
                      type="number" min="0" step="0.01"
                      value={tradeTp}
                      onChange={e => setTradeTp(e.target.value)}
                    />
                  </div>
                  <div className="tm-row">
                    <label className="tm-label">{t(lang, 'stopLoss')} (FCFA) — {t(lang, 'opt')}</label>
                    <input
                      className="tm-input mono"
                      type="number" min="0" step="0.01"
                      value={tradeSl}
                      onChange={e => setTradeSl(e.target.value)}
                    />
                  </div>
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
                    <span className="mono">{fmtPrice(lang, (Number(tradeQty) || 0) * (tradeType === 'limit' && Number(tradeLimit) ? Number(tradeLimit) : Number(tradePrice) || 0))}</span>
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
          background: #0E1627; color: #fff;
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
        .co-title span { font-size: 18px; font-weight: 700; color: #F8F8FA; }
        .hero { display: flex; flex-direction: column; align-items: center; padding: 8px 0 16px; }
        .hero-logo-wrap {
          width: 76px; height: 76px; border-radius: 22px; overflow: hidden;
          background: linear-gradient(160deg, #1E1E1E, #131313);
          display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
        }
        .hero-logo { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
        .hero-logo-fallback { font-size: 30px; font-weight: 700; color: #8b5cf6; }
        .hero-name { font-size: 24px; font-weight: 700; color: #F8F8FA; text-align: center; margin: 0 0 8px; }
        .hero-tags { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 14px; }
        .tag {
          font-size: 12px; font-weight: 600; color: #9AA3B2;
          background: #1E1E1E; border: 1px solid #2a2a2a;
          border-radius: 8px; padding: 5px 12px;
        }
        .tag.ticker { color: #18C27C; background: rgba(24,194,124,0.1); border-color: rgba(24,194,124,0.3); font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .tag.synth { color: #ffd166; background: rgba(255,209,102,0.1); border-color: rgba(255,209,102,0.35); }
        .hero-price-row { display: flex; align-items: center; gap: 12px; }
        .hero-price { font-size: 40px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;  }
        .hero-chg { font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .hero-chg.up { color: #18C27C;  }
        .hero-chg.down { color: #F04438;  }
        .hero-chg.flat { color: #9AA3B2; }
        .stats-card {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
          margin-bottom: 12px;
        }
        .stat {
          background: #1E1E1E; border-radius: 16px;
          padding: 12px 10px; display: flex; flex-direction: column; gap: 4px;
          align-items: center;
        }
        .stat-label { font-size: 14px; font-weight: 400; color: #9AA3B2; }
        .stat-value { font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .label-row { display: inline-flex; align-items: center; gap: 4px; }
        .stats-card .label-row { justify-content: center; }
        .chart-card {
          background: #0B0B0B; border: 1px solid rgba(255,255,255,0.05);
          border-radius: 24px; padding: 14px 14px 10px; margin-bottom: 12px;
          animation: tvIn 0.3s ease both;
        }
        @keyframes tvIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .chart-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .chart-price { font-size: 30px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;  }
        .chart-chg { font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .chart-chg.up { color: #18C27C;  }
        .chart-chg.down { color: #F04438;  }
        .chart-wrap { display: flex; flex-direction: column; height: clamp(420px, 62vh, 680px); min-height: 420px; }
        .periods { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: 150px; }
        .period {
          background: none; border: none; color: #9AA3B2;
          font-size: 13px; font-weight: 600; padding: 6px 10px;
          border-radius: 8px; cursor: pointer; font-family: inherit;
        }
        .period.active { background: #18C27C; color: #00130a; font-weight: 700; }
        .chart-empty { color: #555; padding: 60px 0; font-size: 12px; }
        .chart-legend { display: flex; gap: 14px; justify-content: center; margin-top: 8px; }
        .lg { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #9AA3B2; }
        .lg-candle-up { width: 8px; height: 10px; border-radius: 1px; background: #18C27C; border-left: 1px solid #18C27C; }
        .lg-candle-down { width: 8px; height: 10px; border-radius: 1px; background: #F04438; border-left: 1px solid #F04438; }
        .lg-vol { width: 8px; height: 4px; border-radius: 1px; background: rgba(255,255,255,0.4); }
        .lg.up { color: #18C27C; }
        .lg.down { color: #F04438; }
        .trade-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .mc-note {
          width: 100%; display: flex; align-items: center; gap: 7px;
          font-size: 12.5px; line-height: 1.35; color: #f0b4b4;
          background: #261010; border: 1px solid rgba(240,68,56,0.35);
          border-radius: 12px; padding: 10px 12px;
        }
        .trade-btn {
          flex: 1; height: 48px; border: none; border-radius: 14px;
          font-size: 17px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .trade-btn.buy { background: #18C27C; color: #00130a; }
        .trade-btn.sell { background: #F04438; color: #fff; }
        .co-tabs {
          display: flex; gap: 8px; margin-bottom: 16px;
          overflow-x: auto; padding-bottom: 2px;
        }
        .co-tabs::-webkit-scrollbar { display: none; }
        .co-tab {
          flex: 1; white-space: nowrap; padding: 10px 8px;
          background: #141414; border: 1px solid #262626; border-radius: 14px;
          color: #9AA3B2; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out;
        }
        .co-tab.active {
          background: #18C27C; border-color: #18C27C; color: #00130a;
        }
        .co-cal-card { padding: 16px; background: #141414; border-radius: 18px; margin-bottom: 14px; }
        .co-cal-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 0; border-bottom: 1px solid #1a1a1a;
          cursor: pointer;
        }
        .co-cal-row:last-child { border-bottom: none; }
        .co-cal-date {
          flex: none; font-size: 12px; color: #9AA3B2;
          background: #1e1e1e; border-radius: 8px; padding: 4px 8px;
        }
        .co-cal-title { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; line-height: 1.35; }
        .co-cal-src {
          flex: none; font-size: 10.5px; font-weight: 700; color: #8b5cf6;
          background: rgba(139,92,246,0.12); border-radius: 8px; padding: 3px 8px;
        }
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
          font-size: 15px; font-weight: 700; padding: 5px 12px; border-radius: 10px;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
        }
        .tm-side.buy { background: rgba(24,194,124,0.15); color: #18C27C; }
        .tm-side.sell { background: rgba(240,68,56,0.15); color: #F04438; }
        .tm-close {
          width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
          background: #1E1E1E; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .tm-owned {
          font-size: 12px; color: #9AA3B2;
          background: #1E1E1E; border-radius: 10px; padding: 9px 12px;
        }
        .tm-owned b { color: #fff; font-weight: 700; }
        .tm-row { display: flex; flex-direction: column; gap: 6px; }
        .tm-label { font-size: 11px; color: #9AA3B2; font-weight: 600; }
        .tm-otype { display: flex; gap: 8px; }
        .tm-otype-btn {
          flex: 1; height: 38px;
          background: #1B1B1B; color: #9AA3B2;
          border: 1px solid #2a2a2a; border-radius: 10px;
          font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .tm-otype-btn.on {
          background: rgba(24,194,124,0.12); color: #18C27C; border-color: rgba(24,194,124,0.4);
        }
        .tm-input {
          background: #1B1B1B; border: 1px solid #2a2a2a; border-radius: 12px;
          color: #fff; font-size: 15px; padding: 12px; outline: none;
          font-family: inherit;
        }
        .tm-input:focus { border-color: #3d3d3d; }
        .tm-total {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 13px; color: #9AA3B2;
          background: #1E1E1E; border-radius: 10px; padding: 10px 12px;
        }
        .tm-total .mono { font-size: 15px; font-weight: 700; color: #fff; }
        .tm-err {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: #ff8a8a;
          background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.3);
          padding: 9px 12px; border-radius: 10px;
        }
        .tm-btn {
          height: 48px; border: none; border-radius: 14px;
          font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
          background: #18C27C; color: #00130a;
        }
        .tm-btn.sell { background: #F04438; color: #fff; }
        .tm-btn:disabled { opacity: 0.6; cursor: default; }
        .tm-done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0 4px; }
        .tm-done-icon {
          width: 64px; height: 64px; border-radius: 50%;
          background: rgba(24,194,124,0.12);
          display: flex; align-items: center; justify-content: center;
        }
        .tm-done-title { font-size: 15px; font-weight: 700; }
        .tm-done-sub { font-size: 12px; color: #9AA3B2; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .tm-done .tm-btn { width: 100%; margin-top: 6px; }
        .imp-drop {
          display: flex; align-items: center; gap: 10px;
          background: #1B1B1B; border: 1px dashed #3a3a3a; border-radius: 12px;
          padding: 14px 12px; color: #9AA3B2; font-size: 13px;
          cursor: pointer; font-family: inherit; text-align: left; width: 100%;
        }
        .imp-drop.has-file { border-color: #18C27C; color: #18C27C; }
        .imp-drop span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .imp-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .imp-row2 select.tm-input { height: auto; }
        .imp-ok {
          font-size: 12px; color: #18C27C;
          background: rgba(24,194,124,0.1); border: 1px solid rgba(24,194,124,0.3);
          padding: 9px 12px; border-radius: 10px;
        }
        .fr-actions { display: flex; gap: 8px; margin-bottom: 10px; }
        .fr-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
          height: 40px; border: none; border-radius: 12px; cursor: pointer;
          background: #2A2A2A; color: #fff; font-size: 12px; font-weight: 600; font-family: inherit;
        }
        .fr-btn:active { background: #343434; }
        .fr-btn:disabled { opacity: 0.6; }
        .fr-spin.spin { animation: frRotate 1s linear infinite; }
        @keyframes frRotate { to { transform: rotate(360deg); } }
        .fr-msg {
          font-size: 12px; padding: 9px 12px; border-radius: 10px; margin-bottom: 10px;
        }
        .fr-msg.ok { color: #18C27C; background: rgba(24,194,124,0.1); }
        .fr-note { font-size: 11px; color: #6f6f6f; margin-bottom: 10px; }
        .stmt-block {
          border: 1px solid #2a2a2a; border-radius: 12px; margin-bottom: 8px;
          overflow: hidden; background: #191919;
        }
        .stmt-toggle {
          display: flex; align-items: center; gap: 8px; width: 100%;
          background: none; border: none; color: #fff; cursor: pointer;
          padding: 11px 12px; font-family: inherit; text-align: left;
        }
        .stmt-type { font-size: 12px; font-weight: 700; color: #a78bfa; white-space: nowrap; }
        .stmt-meta {
          flex: 1; min-width: 0; font-size: 11px; color: #9AA3B2;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .stmt-chev { color: #6f6f6f; transition: transform 0.2s; flex-shrink: 0; }
        .stmt-chev.open { transform: rotate(180deg); }
        .stmt-link {
          display: inline-flex; align-items: center; gap: 4px;
          margin: 0 12px 10px; font-size: 11px; color: #a78bfa; text-decoration: none;
        }
        .stmt-items {
          border-top: 1px solid #2a2a2a; padding: 6px 12px 10px;
          max-height: 260px; overflow-y: auto;
        }
        .stmt-items::-webkit-scrollbar { display: none; }
        .line-item {
          display: flex; justify-content: space-between; gap: 10px;
          padding: 6px 0; border-bottom: 1px solid #232323; font-size: 12px;
        }
        .line-item:last-child { border-bottom: none; }
        .li-account { color: #d0d0d0; min-width: 0; }
        .li-val {
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; color: #fff; text-align: right;
          white-space: nowrap; flex-shrink: 0;
        }
        .stmt-more { font-size: 11px; color: #666; text-align: center; padding: 8px 0; }
        .hist-head, .hist-row {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr 1fr 1.1fr;
          gap: 4px; align-items: center;
        }
        .hist-head {
          font-size: 10px; color: #9AA3B2; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.3px;
          padding: 8px 6px; border-bottom: 1px solid #2a2a2a;
        }
        .hist-row {
          padding: 7px 6px; border-bottom: 1px solid #1e1e1e;
          font-size: 11px;
        }
        .hist-row:last-child { border-bottom: none; }
        .hist-date { color: #9AA3B2; font-size: 10px; }
        .hist-close { color: #fff; font-weight: 700; }
        .hist-vol { color: #9AA3B2; }
        .hist-chg { text-align: right; }
        .hist-chg.up { color: #18C27C; }
        .hist-chg.down { color: #F04438; }
        .hist-more {
          width: 100%; margin-top: 10px; height: 40px;
          background: #2A2A2A; border: none; border-radius: 12px;
          color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .info-card, .fin-card, .div-card, .sh-card, .news-card, .fr-card, .hist-card {
          background: #1E1E1E; border-radius: 20px; padding: 20px; margin-bottom: 12px;
        }
        .card-title {
          display: flex; align-items: center; gap: 7px;
          font-size: 17px; font-weight: 700; margin-bottom: 14px;
        }
        .card-toggle {
          display: flex; align-items: center; justify-content: space-between; width: 100%;
          background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
          margin-bottom: 12px;
        }
        .card-toggle.closed { margin-bottom: 0; }
        .ct-title {
          display: flex; align-items: center; gap: 7px;
          font-size: 15px; font-weight: 700; color: #fff;
        }
        .ct-chev { color: #6f6f6f; transition: transform 0.2s; flex-shrink: 0; }
        .ct-chev.open { transform: rotate(180deg); }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .info-item { display: flex; gap: 10px; align-items: flex-start; }
        .ii-icon {
          width: 34px; height: 34px; flex-shrink: 0; border-radius: 10px;
          background: rgba(139,92,246,0.12); color: #a78bfa;
          display: flex; align-items: center; justify-content: center;
        }
        .ii-label { font-size: 11px; color: #9AA3B2; margin-bottom: 2px; }
        .ii-value { font-size: 14px; font-weight: 600; word-break: break-word; }
        .ii-value.mono { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 12.5px; }
        .ii-value.link { color: #a78bfa; }
        .activity { font-size: 13px; color: #9AA3B2; line-height: 1.35; margin: 14px 0 0; }
        .info-empty { font-size: 13px; color: #9AA3B2; line-height: 1.35; margin: 4px 0; }
        .fin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .fin-item {
          background: #141414; border-radius: 14px; padding: 12px 14px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .fin-label { font-size: 11px; color: #9AA3B2; }
        .fin-value { font-size: 16px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .div-head, .div-row {
          display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 8px;
          padding: 8px 0; border-bottom: 1px solid #2a2a2a;
        }
        .div-head { font-size: 11px; color: #9AA3B2; text-transform: uppercase; letter-spacing: 0.5px; }
        .div-head span { display: inline-flex; align-items: center; gap: 3px; }
        .div-row { font-size: 13px; }
        .div-head span:last-child, .div-row span:last-child { text-align: right; }
        .div-head span:nth-child(2), .div-row span:nth-child(2) { text-align: center; }
        .mono { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .up { color: #18C27C; }
        .down { color: #F04438; }
        .sh-body { display: flex; align-items: center; gap: 20px; }
        .sh-legend { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .sh-legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #9AA3B2; }
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
          font-size: 9px; font-weight: 700; letter-spacing: 1px;
          color: #a78bfa; background: rgba(114,102,217,0.15);
          padding: 3px 8px; border-radius: 6px;
        }
        .ai-score-row { display: flex; align-items: center; gap: 18px; margin-bottom: 14px; }
        .ai-score-info { display: flex; flex-direction: column; gap: 6px; }
        .rec-badge {
          align-self: flex-start; font-size: 13px; font-weight: 700;
          padding: 4px 14px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .rec-badge.buy { color: #18C27C; background: rgba(24,194,124,0.12); }
        .rec-badge.hold { color: #facc15; background: rgba(250,204,21,0.12); }
        .rec-badge.sell { color: #F04438; background: rgba(240,68,56,0.12); }
        .ai-score-label { font-size: 12px; color: #9AA3B2; }
        .ai-confidence { font-size: 11px; color: #9AA3B2; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .ai-score-label, .ai-confidence { display: inline-flex; align-items: center; gap: 5px; }
        .ai-summary { font-size: 12px; color: #c9c9c9; line-height: 1.35; margin: 0 0 14px; }
        .ai-col { margin-bottom: 12px; }
        .ai-col-title {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 700; margin-bottom: 8px;
        }
        .ai-col-title.good { color: #18C27C; }
        .ai-col-title.bad { color: #F04438; }
        .ai-list-item {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 10px; margin-bottom: 6px;
          font-size: 12px;
        }
        .ai-list-item.good { background: rgba(24,194,124,0.06); color: #d8f7ec; }
        .ai-list-item.bad { background: rgba(240,68,56,0.06); color: #ffd6d6; }
        .ai-list-item .mono { margin-left: auto; font-size: 11px; }
        .ai-list-item.good .mono { color: #18C27C; }
        .ai-list-item.bad .mono { color: #F04438; }
        .ai-none { font-size: 11px; color: #666; }
        .ai-forecast { margin-top: 14px; padding-top: 14px; border-top: 1px solid #26262f; }
        .fc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .fc-item {
          background: #14141c; border-radius: 10px; padding: 9px 10px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .fc-label { font-size: 10px; color: #9AA3B2; display: inline-flex; align-items: center; gap: 4px; }
        .fc-value { font-size: 13px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .news-item {
          padding: 10px 0; border-bottom: 1px solid #2a2a2a;
          cursor: pointer;
        }
        .news-item:last-child { border-bottom: none; }
        .news-row { display: flex; align-items: center; gap: 10px; }
        .news-text { flex: 1; min-width: 0; }
        .news-source { font-size: 10px; color: #18C27C; font-weight: 600; margin-right: 8px; }
        .news-date { font-size: 10px; color: #666; }
        .news-title { font-size: 13px; font-weight: 600; color: #e8e8e8; margin-top: 4px; line-height: 1.35; }
        .news-empty { font-size: 12px; color: #666; padding: 8px 0; }
        .footnote { text-align: center; font-size: 10px; color: #555; padding: 8px 0 4px; }
      `}</style>
    </div>
  )
}

