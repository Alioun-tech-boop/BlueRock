import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import NewsCard from '../components/NewsCard'
import { getCompanies, getMarketOverview, getMarketSparklines, getMarketNews, getNewsArticle } from '../services/api'
import { t, detectLang, fmtPriceCur } from '../lib/i18n'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import TriLoader from '../components/TriLoader'
import { Newspaper, Calendar, Briefcase, BarChart3, TrendingUp, DollarSign, AlertTriangle, RefreshCw, ExternalLink, X, Compass, Lock } from 'lucide-react'
import { useAuth } from '../lib/auth'

const sectorInfo = {
  Banque: { icon: BarChart3, color: '#3b82f6' },
  'Services Financiers': { icon: BarChart3, color: '#3b82f6' },
  Télécommunications: { icon: TrendingUp, color: '#8b5cf6' },
  Pétrolier: { icon: DollarSign, color: '#f59e0b' },
  Énergie: { icon: DollarSign, color: '#f59e0b' },
  Agroalimentaire: { icon: BarChart3, color: '#10b981' },
  'Consommation de Base': { icon: BarChart3, color: '#10b981' },
  'Consommation Discrétionnaire': { icon: TrendingUp, color: '#ec4899' },
  Industriels: { icon: TrendingUp, color: '#06b6d4' },
  'Services Publics': { icon: BarChart3, color: '#facc15' },
}

const tabs = () => [
  { key: 'overview', label: t('overview') },
  { key: 'stocks', label: t('stocks') },
  { key: 'announcements', label: t('news') },
]

function fmt(n, lang, currency) {
  return fmtPriceCur(lang, n, currency, 0)
}

function Sparkline({ series, up }) {
  if (!series || series.length < 2) return <div className="gc-empty" />
  const points = series.slice(-25)
  const h = 54; const w = 96
  const max = Math.max(...points); const min = Math.min(...points)
  const r = h / (max - min || 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (points.length - 1)) * w} ${h - (p - min) * r}`).join(' ')
  const area = `${d} L${w} ${h} L0 ${h} Z`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={up ? '#18C27C' : '#F04438'} strokeWidth={2} />
      <path d={area} fill={up ? 'rgba(24,194,124,0.15)' : 'rgba(240,68,56,0.15)'} />
    </svg>
  )
}

function FinanceBackground() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0, last = 0
    let candles = []
    let parts = []
    let chips = []
    let lastClose = 100
    let spawnAcc = 0
    let chipAcc = 0
    const rand = (a, b) => a + Math.random() * (b - a)
    const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const ambient = () => {
      const g = ctx.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h * 0.1, Math.max(w, h) * 0.85)
      g.addColorStop(0, 'rgba(24,194,124,0.17)')
      g.addColorStop(0.45, 'rgba(24,194,124,0.06)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    const grid = () => {
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.beginPath()
      for (let x = 0; x < w; x += 42) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h) }
      for (let y = 0; y < h; y += 42) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5) }
      ctx.stroke()
    }

    const trendLine = yOf => {
      if (candles.length < 2) return
      ctx.beginPath()
      candles.forEach((c, i) => {
        const yv = yOf(c.close)
        if (i === 0) ctx.moveTo(c.x, yv)
        else ctx.lineTo(c.x, yv)
      })
      ctx.strokeStyle = 'rgba(42,203,138,0.8)'
      ctx.lineWidth = 1.8
      ctx.shadowColor = 'rgba(24,194,124,0.65)'
      ctx.shadowBlur = 14
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    const spawnCandle = () => {
      const drift = rand(-0.005, 0.009)
      const open = lastClose
      const close = Math.max(20, open * (1 + drift))
      const vol = Math.abs(open - close) * rand(1.6, 3.2)
      const up = close >= open
      candles.push({
        x: w + 24,
        t0: performance.now(),
        dur: rand(1050, 1600),
        open, close, vol, up,
        born: performance.now(),
      })
      lastClose = close
    }

    const spawnChip = () => {
      const up = Math.random() > 0.38
      const pct = (up ? 1 : -1) * rand(0.08, 2.2)
      chips.push({
        x: rand(w * 0.15, w * 0.85),
        y: rand(h * 0.12, h * 0.58),
        txt: (up ? '+' : '') + pct.toFixed(2) + '%',
        up,
        born: performance.now(),
        dur: 2000,
      })
    }

    const spawnPart = () => {
      parts.push({
        x: rand(0, w),
        y: h + rand(10, 60),
        r: rand(1.2, 3.2),
        vy: rand(10, 30),
        vx: rand(-4, 4),
        green: Math.random() > 0.4,
        born: performance.now(),
      })
    }

    const draw = t => {
      raf = requestAnimationFrame(draw)
      if (document.hidden) return
      const dt = Math.min((t - last) / 1000, 0.05) || 0.016
      last = t
      ctx.clearRect(0, 0, w, h)
      ambient()
      grid()

      spawnAcc += dt
      if (spawnAcc > 0.3 && candles.length < 26) { spawnAcc = 0; spawnCandle() }
      chipAcc += dt
      if (chipAcc > 1.9 && chips.length < 6) { chipAcc = 0; spawnChip() }
      if (parts.length < 34 && Math.random() < dt * 2.6) spawnPart()

      const total = Math.max(40, Math.min(...candles.map(c => c.open), ...candles.map(c => c.close)))
      const peak = Math.max(-40, Math.max(...candles.map(c => c.close), ...candles.map(c => c.open)))
      const scale = (h * 0.4) / (peak - total || 1)
      const yOf = v => h * 0.46 + (peak - v) * scale

      for (const c of candles) c.x -= dt * 24
      candles = candles.filter(c => c.x > -90)

      trendLine(yOf)

      for (const c of candles) {
        const age = (t - c.born) / c.dur
        const p = ease(Math.min(age, 1))
        const cur = c.open + (c.close - c.open) * p
        const wickTop = (Math.max(c.open, c.close) + c.vol * (1 - p)) - cur
        const wickBot = cur - (Math.min(c.open, c.close) - c.vol * (1 - p))
        const cx = c.x
        const bodyW = Math.max(6, Math.min(18, w * 0.032))
        const alpha = Math.min(1, (t - c.born) / 240) * Math.max(0, Math.min(1, (c.x + 60) / 90))
        if (alpha <= 0) continue
        ctx.globalAlpha = alpha
        ctx.strokeStyle = c.up ? '#2ACB8A' : '#9AA3B2'
        ctx.fillStyle = c.up ? 'rgba(42,203,138,0.95)' : 'rgba(148,158,170,0.85)'
        ctx.lineWidth = 1.4
        ctx.shadowColor = c.up ? 'rgba(24,194,124,0.5)' : 'rgba(160,170,185,0.4)'
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.moveTo(cx, yOf(cur + wickTop))
        ctx.lineTo(cx, yOf(cur - wickBot))
        ctx.stroke()
        const topY = yOf(Math.max(cur, c.open))
        const botY = yOf(Math.min(cur, c.open))
        ctx.beginPath()
        ctx.rect(cx - bodyW / 2, topY, bodyW, Math.max(2, botY - topY))
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }

      ctx.font = '700 13px Inter, monospace'
      ctx.shadowColor = 'rgba(24,194,124,0.35)'
      ctx.shadowBlur = 8
      for (const ch of chips) {
        const p = (t - ch.born) / ch.dur
        if (p > 1) continue
        const a = Math.sin(Math.PI * p)
        ctx.globalAlpha = a * 0.95
        ctx.fillStyle = ch.up ? '#2ACB8A' : '#C8D0DC'
        ctx.fillText(ch.txt, ch.x - p * 34, ch.y - p * 30)
      }
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
      chips = chips.filter(ch => (t - ch.born) / ch.dur <= 1)

      for (const pt of parts) {
        const age = (t - pt.born) / 1000
        pt.y -= pt.vy * dt
        pt.x += pt.vx * dt
        const a = Math.max(0, 1 - age / 7) * 0.7
        if (a <= 0) continue
        ctx.globalAlpha = a
        ctx.fillStyle = pt.green ? 'rgba(42,203,138,1)' : 'rgba(255,255,255,0.9)'
        if (pt.green) {
          ctx.shadowColor = 'rgba(24,194,124,0.6)'
          ctx.shadowBlur = 8
        }
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      ctx.globalAlpha = 1
      parts = parts.filter(pt => (t - pt.born) / 1000 <= 7 && pt.y > -30)
    }

    if (reduced) {
      const n = Math.max(8, Math.floor(w / 88))
      const vals = []
      let v = 100
      for (let i = 0; i < n; i++) {
        v = Math.max(20, v * (1 + rand(-0.004, 0.007)))
        vals.push({ v, vol: rand(1.5, 5) })
      }
      const lo = Math.min(...vals.map(x => x.v))
      const hi = Math.max(...vals.map(x => x.v))
      const scale = (h * 0.4) / (hi - lo || 1)
      const yOf2 = val => h * 0.46 + (hi - val) * scale
      ctx.clearRect(0, 0, w, h)
      ambient()
      grid()
      ctx.beginPath()
      vals.forEach((x, i) => {
        const xp = w - (n - i) * 88 + 12
        if (i === 0) ctx.moveTo(xp, yOf2(x.v))
        else ctx.lineTo(xp, yOf2(x.v))
      })
      ctx.strokeStyle = 'rgba(42,203,138,0.8)'
      ctx.lineWidth = 1.8
      ctx.stroke()
      for (let i = 0; i < n; i++) {
        const open = i === 0 ? vals[0].v : vals[i - 1].v
        const close = vals[i].v
        const up = close >= open
        const x = w - (n - i) * 88 + 12
        ctx.strokeStyle = up ? '#2ACB8A' : '#9AA3B2'
        ctx.fillStyle = up ? 'rgba(42,203,138,0.95)' : 'rgba(148,158,170,0.85)'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(x, yOf2(close + vals[i].vol / 2))
        ctx.lineTo(x, yOf2(close - vals[i].vol / 2))
        ctx.stroke()
        const topY = yOf2(Math.max(open, close))
        const botY = yOf2(Math.min(open, close))
        ctx.fillRect(x - 6, topY, 12, Math.max(2, botY - topY))
      }
      return () => window.removeEventListener('resize', resize)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={ref} className="finbg" aria-hidden="true" />
}

export default function Explorer() {
  const router = useRouter()
  const { user } = useAuth()
  const isPro = user?.tier === 'pro'
  const [lang] = useState(() => detectLang())
  const [activeTab, setActiveTab] = useState('overview')
  const [companies, setCompanies] = useState([])
  const [indices, setIndices] = useState({})
  const [gainers, setGainers] = useState([])
  const [losers, setLosers] = useState([])
  const [ngxGainers, setNgxGainers] = useState([])
  const [ngxLosers, setNgxLosers] = useState([])
  const [sparklines, setSparklines] = useState({})
  const [news, setNews] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [article, setArticle] = useState(null)
  const [articleLoading, setArticleLoading] = useState(false)
  const [articleError, setArticleError] = useState('')

  const openArticle = (item) => {
    setArticle(item)
    setArticleLoading(true)
    setArticleError('')
    getNewsArticle(item.url)
      .then(r => {
        setArticle(prev => prev ? { ...prev, content: r.data.content || [], articleTitle: r.data.title, summary: r.data.summary || '' } : prev)
        setArticleLoading(false)
      })
      .catch(() => {
        setArticleError(t('newsReadError'))
        setArticleLoading(false)
      })
  }

  const closeArticle = () => {
    setArticle(null)
    setArticleError('')
    setArticleLoading(false)
  }

  const load = () => {
    setError('')
    setLoading(true)
    const calls = [
      getCompanies({ limit: 300 }).then(r => setCompanies(r.data.companies || [])).catch(() => {}),
      getMarketOverview().then(r => {
        setIndices(r.data.indices || {})
        setGainers(r.data.gainers || [])
        setLosers(r.data.losers || [])
      }).catch(() => {}),
      getMarketSparklines(30).then(r => setSparklines(r.data || {})).catch(() => {}),
      refreshNews(),
    ]
    // NGX (bourse réservée à l'offre Pro).
    if (isPro) {
      calls.push(getMarketOverview('NGX').then(r => {
        setNgxGainers(r.data.gainers || [])
        setNgxLosers(r.data.losers || [])
      }).catch(() => {}))
    }
    Promise.all(calls).catch(() => setError(t('loadError'))).finally(() => setLoading(false))
  }

  const refreshNews = () =>
    getMarketNews(500).then(r => setNews(r.data.items || [])).catch(() => {})

  useEffect(() => { load() }, [])

  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) load() }, 180000)
    const newsInterval = setInterval(() => { if (!document.hidden) refreshNews() }, 60000)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(interval)
      clearInterval(newsInterval)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const grouped = {}
  companies.filter(c => c.exchange !== 'NGX').forEach(c => {
    if (!grouped[c.sector]) grouped[c.sector] = []
    grouped[c.sector].push(c)
  })

  const gridItems = Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([sector, stocks]) => {
    const series = []
    const len = Math.min(...stocks.map(s => (sparklines[s.id] || []).length))
    if (len > 1) {
      for (let i = 0; i < len; i++) {
        const vals = stocks.map(s => sparklines[s.id][i]).filter(v => v != null)
        series.push(vals.reduce((a, b) => a + b, 0) / vals.length)
      }
    }
return {
      name: sector,
      count: stocks.length,
      change: stocks.reduce((sum, s) => sum + (s.change_percent || 0), 0) / (stocks.length || 1),
      color: sectorInfo[sector]?.color || '#666',
    }
  })

  const ngxGrouped = {}
  companies.filter(c => c.exchange === 'NGX').forEach(c => {
    if (!ngxGrouped[c.sector]) ngxGrouped[c.sector] = []
    ngxGrouped[c.sector].push(c)
  })
  const ngxItems = Object.entries(ngxGrouped)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([sector, stocks]) => {
      const series = []
      const len = Math.min(...stocks.map(s => (sparklines[s.id] || []).length))
      if (len > 1) {
        for (let i = 0; i < len; i++) {
          const vals = stocks.map(s => sparklines[s.id][i]).filter(v => v != null)
          series.push(vals.reduce((a, b) => a + b, 0) / vals.length)
        }
      }
      return {
        name: sector,
        count: stocks.length,
        change: stocks.reduce((sum, s) => sum + (s.change_percent || 0), 0) / (stocks.length || 1),
        color: '#8b5cf6',
      }
    })

  const T = tabs()

  return (
    <div className="mobile-root">
      <FinanceBackground />
      <div className="safe-area">
        <h1 className="explorer-title">{t('explorer')}</h1>

        {error && (
          <div className="error-bar">
            <AlertTriangle size={14} color="#F04438" />
            <span>{error}</span>
            <button onClick={load} className="retry-btn"><RefreshCw size={13} /></button>
          </div>
        )}

        <div className="action-buttons">
          <button className="action-btn" onClick={() => { setActiveTab('announcements'); document.querySelector('.news-section')?.scrollIntoView({ behavior: 'smooth' }) }}>
            <Newspaper size={28} color="#fff" />
            <span>{t('announcements')}</span>
          </button>
          <button className="action-btn" onClick={() => router.push('/calendar')}>
            <Calendar size={28} color="#fff" />
            <span>{t('calendar')}</span>
          </button>
          <button className="action-btn" onClick={() => router.push('/brokers')}>
            <Briefcase size={28} color="#fff" />
            <span>{t('brokers')}</span>
          </button>
          <button className="action-btn plan-btn" onClick={() => router.push('/patrimoine')}>
            <Compass size={28} color="#18C27C" />
            <span>{t('premiumTitle')}</span>
          </button>
        </div>

        <div className="tabs-strip">
          {T.map(({ key, label }) => (
            <button
              key={key}
              className={`tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="indices-strip">
              {[
                { name: 'BRVM Composite', value: indices.brvm_composite, change: indices.brvm_composite_change },
                { name: 'BRVM 30', value: indices.brvm_30, change: indices.brvm_30_change },
                { name: 'BRVM Prestige', value: indices.brvm_prestige, change: indices.brvm_prestige_change },
              ].map((idx, i) => (
                <div key={i} className="index-card">
                  <span className="idx-name">{idx.name}</span>
                  <span className="idx-val">{idx.value?.toFixed(2) || '—'}</span>
                  <span className={`idx-chg ${(idx.change || 0) >= 0 ? 'up' : 'down'}`}>
                    {(idx.change || 0) >= 0 ? '+' : ''}{(idx.change || 0).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>

            <div className="grid-2">
              {gridItems.map((item, i) => (
                <div key={i} className="grid-card" onClick={() => router.push(`/screen?sector=${encodeURIComponent(item.name)}`)}>
                  <div className="gc-top">
                    <div className="gc-dot" style={{ background: item.color }} />
                    <span className="gc-name">{item.name}</span>
                  </div>
                  <div className="gc-value">
                    {item.count} {t('companies')}
                  </div>
                  <div className={`gc-chg ${item.change >= 0 ? 'up' : 'down'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}% {t('today')}
                  </div>
                  <div className="gc-chart">
                    <Sparkline series={item.series} up={item.change >= 0} />
                  </div>
                </div>
              ))}
            </div>

            {isPro && ngxItems.length > 0 && (
              <>
                <div className="section-title ngx-title">{t('ngxTitle')}</div>
                <div className="grid-2">
                  {ngxItems.map((item, i) => (
                    <div key={i} className="grid-card ngx-card" onClick={() => router.push('/companies?exchange=NGX')}>
                      <div className="gc-top">
                        <div className="gc-dot" style={{ background: item.color }} />
                        <span className="gc-name">{item.name}</span>
                        <span className="gc-badge">NGX</span>
                      </div>
                      <div className="gc-value">
                        {item.count} {t('companies')}
                      </div>
                      <div className={`gc-chg ${item.change >= 0 ? 'up' : 'down'}`}>
                        {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}% {t('today')}
                      </div>
                      <div className="gc-chart">
                        <Sparkline series={item.series} up={item.change >= 0} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

<div className="section-title">{t('stocks')}</div>
            <div className="topflop-section vertical">
              <div className="topflop-col">
                <div className="topflop-header top">Top 5 <span className="tf-badge">BRVM</span></div>
                {gainers.map((s, i) => (
                  <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                    <span className="tf-logo">{s.logo_url ? <img crossOrigin="anonymous" src={s.logo_url} alt="" onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)} onError={onLogoError} /> : null}</span>
                    <span className="tf-symbol">{s.symbol}</span>
                    <span className="tf-price">{fmt(s.close_price, lang, 'XOF')}</span>
                    <span className="tf-chg up">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
              <div className="topflop-col">
                <div className="topflop-header flop">Flop 5 <span className="tf-badge">BRVM</span></div>
                {losers.map((s, i) => (
                  <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                    <span className="tf-logo">{s.logo_url ? <img crossOrigin="anonymous" src={s.logo_url} alt="" onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)} onError={onLogoError} /> : null}</span>
                    <span className="tf-symbol">{s.symbol}</span>
                    <span className="tf-price">{fmt(s.close_price, lang, 'XOF')}</span>
                    <span className="tf-chg down">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {isPro ? (
              <>
                <div className="section-title ngx-title">{t('ngxTitle')}</div>
                <div className="topflop-section vertical">
                  <div className="topflop-col">
                    <div className="topflop-header top">Top 5 <span className="tf-badge ngx">NGX</span></div>
                    {ngxGainers.map((s, i) => (
                      <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                        <span className="tf-logo">{s.logo_url ? <img crossOrigin="anonymous" src={s.logo_url} alt="" onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)} onError={onLogoError} /> : null}</span>
                        <span className="tf-symbol">{s.symbol}</span>
                        <span className="tf-price">{fmt(s.close_price, lang, 'NGN')}</span>
                        <span className="tf-chg up">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="topflop-col">
                    <div className="topflop-header flop">Flop 5 <span className="tf-badge ngx">NGX</span></div>
                    {ngxLosers.map((s, i) => (
                      <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                        <span className="tf-logo">{s.logo_url ? <img crossOrigin="anonymous" src={s.logo_url} alt="" onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)} onError={onLogoError} /> : null}</span>
                        <span className="tf-symbol">{s.symbol}</span>
                        <span className="tf-price">{fmt(s.close_price, lang, 'NGN')}</span>
                        <span className="tf-chg down">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="ngx-section-lock">
                <div className="section-title ngx-title">{t('ngxTitle')}</div>
                <div className="grid-2">
                  <div className="grid-card ngx-card pro-lock" onClick={() => router.push('/premium')}>
                    <div className="gc-top">
                      <span className="gc-dot" style={{ background: '#f59e0b' }} />
                      <span className="gc-name">{t('ngxTitle')}</span>
                      <span className="gc-badge">NGX</span>
                    </div>
                    <div className="pro-lock-body">
                      <Lock size={16} />
                      <span>{t('proLockedTitle')}</span>
                      <span className="pro-lock-sub">{t('proLockedSub')}</span>
                      <span className="pro-lock-cta">{t('proDiscover')} ›</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'stocks' && (
          <div className="topflop-section vertical">
            <div className="topflop-col">
              <div className="topflop-header top">Top 5</div>
              {gainers.map((s, i) => (
                <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                  <span className="tf-logo">{s.logo_url ? <img crossOrigin="anonymous" src={s.logo_url} alt="" onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)} onError={onLogoError} /> : null}</span>
                  <span className="tf-symbol">{s.symbol}</span>
                  <span className="tf-price">{fmt(s.close_price, lang, 'XOF')}</span>
                  <span className="tf-chg up">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                </div>
              ))}
            </div>
            <div className="topflop-col">
              <div className="topflop-header flop">Flop 5</div>
              {losers.map((s, i) => (
                <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                  <span className="tf-logo">{s.logo_url ? <img crossOrigin="anonymous" src={s.logo_url} alt="" onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)} onError={onLogoError} /> : null}</span>
                  <span className="tf-symbol">{s.symbol}</span>
                  <span className="tf-price">{fmt(s.close_price, lang, 'XOF')}</span>
                  <span className="tf-chg down">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="news-section cards">
            <div className="news-header">
              <span>{t('news')}</span>
            </div>
            {loading && !news.length && <div className="news-empty">{t('loading')}</div>}
            {!loading && !news.length && (
              <div className="news-empty">{t('newsEmpty')}</div>
            )}
            {news.filter(n => n.category === 'Société').length > 0 && (
              <>
                <div className="news-group-title societes">{t('newsSocietes')}</div>
                {news.filter(n => n.category === 'Société').slice(0, 15).map((item, i) => (
                  <NewsCard key={`s${i}`} item={item} badge={item.source || t('newsSocietes')} onOpen={() => openArticle(item)} />
                ))}
              </>
            )}
            {news.filter(n => n.category === 'BRVM').length > 0 && (
              <>
                <div className="news-group-title">{t('newsBRVM')}</div>
                {news.filter(n => n.category === 'BRVM').map((item, i) => (
                  <NewsCard key={`b${i}`} item={item} badge={t('newsOfficial')} fallbackKind="market" onOpen={() => openArticle(item)} />
                ))}
              </>
            )}
            {news.filter(n => n.category === 'Presse').length > 0 && (
              <>
                <div className="news-group-title">{t('newsPresse')}</div>
                {news.filter(n => n.category === 'Presse').slice(0, 15).map((item, i) => (
                  <NewsCard key={`p${i}`} item={item} badge={item.source || t('newsPresse')} onOpen={() => openArticle(item)} />
                ))}
              </>
            )}
          </div>
        )}

        {article && (
          <div className="article-overlay" onClick={closeArticle}>
            <div className="article-modal" onClick={e => e.stopPropagation()}>
              <div className="article-top">
                <span className="article-src">{(article.source || '').toUpperCase()}</span>
                <button className="article-close" onClick={closeArticle} aria-label={t('close')}>
                  <X size={18} />
                </button>
              </div>
              <div className="article-body">
                <h2 className="article-title">{article.articleTitle || article.title}</h2>
                {article.image && (
                  <img className="article-cover" src={article.image} alt="" onError={e => e.target.style.display = 'none'} />
                )}
                {articleLoading && (
                  <div className="article-loading">
                    <TriLoader compact label={t('newsLoading')} />
                  </div>
                )}
                {!articleLoading && articleError && (
                  <div className="article-fallback">
                    <AlertTriangle size={16} color="#f59e0b" />
                    <p>{articleError}</p>
                  </div>
                )}
                {!articleLoading && !articleError && article.summary && (
                  <div className="article-summary">{article.summary}</div>
                )}
                {!articleLoading && !articleError && (article.content || []).map((p, i) => (
                  <p key={i} className="article-para">{p}</p>
                ))}
                <a className="article-open" href={article.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  <span>{t('newsOpenSource')}</span>
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
      <BottomNav active="explorer" />
      <style jsx>{`
        .mobile-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #000000;
          color: #fff;
          font-family: Inter, -apple-system, sans-serif;
          overflow: hidden;
          position: relative;
        }
        :global(.finbg) {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
        }
        .safe-area {
          flex: 1;
          overflow-y: auto;
          padding: 0 16px 8px;
          position: relative;
          z-index: 1;
        }
        .safe-area::-webkit-scrollbar { display: none; }
        .explorer-title {
          font-size: 44px;
          font-weight: 600;
          margin: 18px 0;
          letter-spacing: 0;
        }
        .error-bar {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 13px 15px;
          background: #261010;
          border: 1px solid #F0443855;
          border-radius: 14px;
          font-size: 15px;
          color: #f0b4b4;
          margin-bottom: 16px;
        }
        .retry-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: #F04438;
          cursor: pointer;
          padding: 2px;
        }
        .action-buttons {
          display: flex;
          gap: 12px;
          margin-bottom: 22px;
        }
        .action-btn {
          flex: 1;
          height: 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #262626;
          border: none;
          border-radius: 20px;
          color: #fff;
          font-size: 15px;
          cursor: pointer;
          font-family: inherit;
          text-decoration: none;
        }
        .action-btn:hover { background: #333; }
        .action-btn.plan-btn {
          background: linear-gradient(160deg, rgba(24,194,124,0.16), rgba(139,92,246,0.12));
          border: 1px solid rgba(24,194,124,0.35);
        }
        .action-btn.plan-btn:hover { background: linear-gradient(160deg, rgba(24,194,124,0.26), rgba(139,92,246,0.2)); }
        .tabs-strip {
          display: flex;
          gap: 10px;
          margin-bottom: 18px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .tabs-strip::-webkit-scrollbar { display: none; }
        .tab-btn {
          padding: 10px 20px;
          background: none;
          border: none;
          border-radius: 17px;
          color: #666;
          font-size: 16px;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
        }
        .tab-btn.active {
          background: #262626;
          color: #fff;
        }
        .indices-strip {
          display: flex;
          gap: 12px;
          margin-bottom: 18px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .indices-strip::-webkit-scrollbar { display: none; }
        .index-card {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 15px 17px;
          background: #1B1B1B;
          border-radius: 18px;
          min-width: 150px;
          flex-shrink: 0;
        }
        .idx-name { font-size: 13.5px; color: #9AA3B2; }
        .idx-val { font-size: 18px; font-weight: 600; color: #8E95A3; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .idx-chg { font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .idx-chg.up { color: #18C27C; }
        .idx-chg.down { color: #F04438; }
        .topflop-section {
          display: flex;
          gap: 14px;
          margin-bottom: 22px;
        }
        .topflop-section.vertical {
          flex-direction: column;
        }
        .topflop-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 17px;
          background: #141414;
          border-radius: 20px;
        }
        .topflop-header {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 3px;
        }
        .topflop-header.top { color: #18C27C; }
        .topflop-header.flop { color: #F04438; }
        .tf-badge {
          font-size: 9.5px; font-weight: 700; letter-spacing: 0.6px;
          padding: 3px 7px; border-radius: 999px; vertical-align: 2px; margin-left: 6px;
          color: #c4b5fd; background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.35);
        }
        .tf-badge.ngx { color: #c4b5fd; background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.35); }
        .topflop-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          font-size: 14px;
          cursor: pointer;
          padding: 4px 0;
        }
        .tf-symbol { font-weight: 600; color: #F8F8FA; }
        .tf-logo { width: 28px; height: 28px; border-radius: 50%; background: #1e1e1e; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .tf-logo img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
        .tf-price { color: #8E95A3; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
        .tf-chg { font-weight: 500; font-size: 16px; }
        .tf-chg.up { color: #18C27C; }
        .tf-chg.down { color: #F04438; }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 22px;
        }
        .grid-card {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 17px;
          background: #141414;
          border-radius: 20px;
          cursor: pointer;
        }
        .grid-card:hover { background: #1c1c1c; }
        .gc-top {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .gc-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
        }
        .gc-name { font-size: 13.5px; color: #9AA3B2; }
        .gc-badge {
          margin-left: auto; font-size: 9.5px; font-weight: 700; letter-spacing: 0.6px;
          padding: 3px 7px; border-radius: 999px;
          color: #c4b5fd; background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.35);
        }
        .ngx-title {
          color: #c4b5fd;
          display: flex; align-items: center; gap: 8px;
        }
        .ngx-title::before {
          content: ''; width: 8px; height: 8px; border-radius: 50%;
          background: #8b5cf6;
        }
        .ngx-card { border: 1px solid rgba(139, 92, 246, 0.28); }
        .gc-value { font-size: 24px; font-weight: 600; color: #F8F8FA; }
        .gc-chg { font-size: 16px; font-weight: 500; }
        .gc-chg.up { color: #18C27C; }
        .gc-chg.down { color: #F04438; }
        .gc-chart { margin-top: 5px; }
        .gc-empty { height: 45px; }
        .section-title {
          font-size: 18px;
          font-weight: 600;
          margin: 10px 0 14px;
          letter-spacing: 0;
        }
        .news-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-bottom: 18px;
        }
        .news-section.cards { gap: 18px; }
        .news-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 18px;
          font-weight: 600;
        }
        .news-group-title {
          font-size: 13px;
          font-weight: 600;
          color: #9AA3B2;
          margin: 16px 0 5px;
          text-transform: uppercase;
          letter-spacing: 0.15px;
        }
        .news-group-title.societes { color: #D4A843; }
        .badge-official {
          font-size: 11px;
          font-weight: 600;
          color: #18C27C;
          background: rgba(24,194,124,0.12);
          padding: 3px 9px;
          border-radius: 10px;
        }
        .news-src { font-size: 13px; color: #8b5cf6; font-weight: 600; }
        .news-src.societe { color: #D4A843; }
        .news-empty {
          padding: 26px 0;
          text-align: center;
          color: #666;
          font-size: 15px;
        }
        .news-item {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 11px 0;
          border: none;
          border-bottom: 1px solid #1a1a1a;
          background: none;
          text-align: left;
          text-decoration: none;
          color: #fff;
          font-family: inherit;
          cursor: pointer;
          width: 100%;
        }
        .news-item:active { opacity: 0.7; }
        .news-row {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
        }
        .news-text { flex: 1; min-width: 0; }
        .news-meta {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          color: #9AA3B2;
        }
        .dot { color: #333; }
        .news-title {
          font-size: 16px;
          font-weight: 500;
          line-height: 1.35;
        }
        .article-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          z-index: 90;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .article-modal {
          width: 100%;
          max-width: 480px;
          max-height: 82vh;
          background: #141414;
          border-radius: 20px 20px 0 0;
          display: flex;
          flex-direction: column;
          animation: sheetUp 0.22s ease;
        }
        @keyframes sheetUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .article-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 16px 0;
        }
        .article-src {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0;
          color: #8b5cf6;
        }
        .article-close {
          background: #262626;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .article-body {
          overflow-y: auto;
          padding: 16px 20px 30px;
        }
        .article-body::-webkit-scrollbar { display: none; }
        .article-title {
          font-size: 20px;
          font-weight: 600;
          line-height: 1.35;
          margin: 5px 0 14px;
        }
        .article-cover {
          width: 100%;
          max-height: 240px;
          object-fit: cover;
          border-radius: 14px;
          margin: 0 0 14px;
        }
        .article-loading {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #9AA3B2;
          font-size: 15px;
          padding: 22px 0;
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .article-fallback {
          display: flex;
          gap: 11px;
          align-items: flex-start;
          background: #221a08;
          border: 1px solid #f59e0b33;
          border-radius: 14px;
          padding: 14px;
          font-size: 15px;
          color: #e8d9b5;
          margin: 9px 0;
        }
        .article-fallback p { margin: 0; }
        .article-summary {
          background: #1d1d1d;
          border-left: 3px solid #8b5cf6;
          border-radius: 12px;
          padding: 14px;
          font-size: 15px;
          color: #d6d6d6;
          line-height: 1.35;
          margin-bottom: 16px;
        }
        .article-para {
          font-size: 16px;
          line-height: 1.35;
          color: #e5e5e5;
          margin: 0 0 14px;
        }
        .article-open {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-top: 8px;
          padding: 12px 16px;
          background: #262626;
          border: 1px solid #333;
          border-radius: 14px;
          color: #fff;
          font-size: 15px;
          text-decoration: none;
        }
        .pro-lock-body {
          display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
          padding: 6px 0 2px;
        }
        .pro-lock-body svg { color: #f59e0b; }
        .pro-lock .gc-name { color: #f59e0b; }
        .pro-lock-sub { font-size: 11.5px; color: #9AA3B2; line-height: 1.35; }
        .pro-lock-cta {
          margin-top: 6px; font-size: 12.5px; font-weight: 600; color: #7ab2ff;
        }
        .pro-lock { cursor: pointer; transition: transform 0.15s ease; }
        .pro-lock:hover { transform: translateY(-1px); }
      `}</style>
    </div>
  )
}
