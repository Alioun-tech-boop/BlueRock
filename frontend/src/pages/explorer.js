import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import NewsCard from '../components/NewsCard'
import { getCompanies, getMarketOverview, getMarketSparklines, getMarketNews, getNewsArticle } from '../services/api'
import { t, detectLang, fmtPriceCur } from '../lib/i18n'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import TriLoader from '../components/TriLoader'
import { Newspaper, Calendar, Briefcase, BarChart3, TrendingUp, DollarSign, AlertTriangle, RefreshCw, ExternalLink, X, Compass, Lock, Sparkles, ArrowRight } from 'lucide-react'
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

function AiArt() {
  const nodes = [
    { x: 138, y: 80, c: 'blue' },
    { x: 109, y: 29.8, c: 'teal' },
    { x: 51, y: 29.8, c: 'blue' },
    { x: 22, y: 80, c: 'teal' },
    { x: 51, y: 130.2, c: 'blue' },
    { x: 109, y: 130.2, c: 'teal' },
  ]
  return (
    <svg className="ai-art" viewBox="0 0 160 160" fill="none" aria-hidden>
      <defs>
        <linearGradient id="aiBlue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4DA3FF" />
          <stop offset="1" stopColor="#0052FC" />
        </linearGradient>
        <linearGradient id="aiTeal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
        <radialGradient id="aiCore" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="1" stopColor="#0052FC" />
        </radialGradient>
      </defs>
      <circle cx="80" cy="80" r="58" stroke="url(#aiBlue)" strokeOpacity="0.30" strokeWidth="1.2" strokeDasharray="2 6" />
      <circle cx="80" cy="80" r="58" stroke="url(#aiTeal)" strokeOpacity="0.10" strokeWidth="1" transform="rotate(12 80 80)" />
      <circle cx="80" cy="80" r="78" stroke="url(#aiTeal)" strokeOpacity="0.10" strokeWidth="1" strokeDasharray="1 9" />
      {nodes.map((n, i) => (
        <line key={`c${i}`} x1="80" y1="80" x2={n.x} y2={n.y} stroke="url(#aiBlue)" strokeOpacity="0.35" strokeWidth="1" />
      ))}
      {nodes.map((n, i) => {
        const b = nodes[(i + 1) % nodes.length]
        return <line key={`r${i}`} x1={n.x} y1={n.y} x2={b.x} y2={b.y} stroke="url(#aiTeal)" strokeOpacity="0.22" strokeWidth="1" />
      })}
      <circle cx="80" cy="80" r="20" fill="url(#aiBlue)" fillOpacity="0.18" stroke="url(#aiBlue)" strokeWidth="1.4" />
      <circle cx="80" cy="80" r="8.5" fill="url(#aiCore)" />
      {nodes.map((n, i) => (
        <g key={`n${i}`}>
          <circle cx={n.x} cy={n.y} r="7" fill={n.c === 'blue' ? 'url(#aiBlue)' : 'url(#aiTeal)'} fillOpacity="0.20" />
          <circle cx={n.x} cy={n.y} r="3.2" fill={n.c === 'blue' ? '#7FB5FF' : '#3EE6A8'} />
        </g>
      ))}
      <path d="M14 132 L44 116 L66 124 L92 104 L122 112 L146 90" stroke="url(#aiTeal)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 132 L44 116 L66 124 L92 104 L122 112 L146 90 L146 150 L14 150 Z" fill="url(#aiTeal)" opacity="0.14" />
      <path d="M150 18 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z" fill="#FFD77A" opacity="0.9" />
      <path d="M22 14 l2.4 4.8 4.8 2.4 -4.8 2.4 -2.4 4.8 -2.4 -4.8 -4.8 -2.4 4.8 -2.4 z" fill="#7FB5FF" opacity="0.85" />
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
    let particles = []
    const rand = (a, b) => a + Math.random() * (b - a)
    const TAU = Math.PI * 2

    const blobs = [
      { rgba: '76,141,255', size: 0.66, nx: 0.18, ny: -0.22, ax: 0.00011, ay: 0.00013, ph: 0 },
      { rgba: '139,92,246', size: 0.52, nx: 0.84, ny: 0.18, ax: 0.00009, ay: 0.00010, ph: 2.1 },
      { rgba: '24,194,124', size: 0.48, nx: 0.12, ny: 0.76, ax: 0.00012, ay: 0.00009, ph: 4.2 },
      { rgba: '56,143,255', size: 0.60, nx: 0.92, ny: 0.92, ax: 0.00010, ay: 0.00011, ph: 1.3 },
    ]

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

    const base = () => {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, 'rgba(14,18,30,1)')
      g.addColorStop(0.55, 'rgba(7,9,16,1)')
      g.addColorStop(1, 'rgba(3,5,9,1)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    const aurora = t => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const b of blobs) {
        const bx = b.nx * w + Math.sin(t * b.ax + b.ph) * w * 0.07
        const by = b.ny * h + Math.cos(t * b.ay + b.ph) * h * 0.06
        const r = b.size * Math.max(w, h)
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r)
        g.addColorStop(0, `rgba(${b.rgba},0.30)`)
        g.addColorStop(0.55, `rgba(${b.rgba},0.10)`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }
      ctx.restore()
    }

    const grid = t => {
      const vx = w / 2
      const vy = h * 0.16
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      for (let i = 0; i < 15; i++) {
        const a = (i / 15) * TAU
        ctx.beginPath()
        ctx.moveTo(vx, vy)
        ctx.lineTo(vx + Math.cos(a) * w * 1.5, vy + Math.sin(a) * h * 1.5)
        ctx.stroke()
      }
      const spacing = 0.085
      const depth = (t * 0.00013) % spacing
      for (let d = depth; d < 1.06; d += spacing) {
        const y = vy + d * d * h * 1.18
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    }

    const spawn = () => {
      particles.push({
        x: rand(0, w),
        y: h + rand(10, 40),
        r: rand(0.8, 2.2),
        vy: rand(8, 24),
        vx: rand(-6, 6),
        tw: rand(0.002, 0.005),
        ph: rand(0, TAU),
        green: Math.random() < 0.3,
        born: performance.now(),
      })
    }

    const draw = t => {
      raf = requestAnimationFrame(draw)
      if (document.hidden) return
      const dt = Math.min((t - last) / 1000, 0.05) || 0.016
      last = t
      base()
      aurora(t)
      grid(t)
      if (particles.length < 50 && Math.random() < dt * 3) spawn()
      for (const p of particles) {
        p.y -= p.vy * dt
        p.x += p.vx * dt
        const age = (t - p.born) / 1000
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * p.tw + p.ph))
        const a = Math.max(0, 1 - age / 9) * 0.6 * twinkle
        if (a <= 0) continue
        ctx.globalAlpha = a
        ctx.fillStyle = p.green ? 'rgba(42,203,138,1)' : 'rgba(224,233,255,0.9)'
        if (p.green) {
          ctx.shadowColor = 'rgba(24,194,124,0.7)'
          ctx.shadowBlur = 8
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, TAU)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      ctx.globalAlpha = 1
      particles = particles.filter(p => p.y > -30 && (t - p.born) / 1000 <= 9)
    }

    if (reduced) {
      base()
      aurora(0)
      grid(0)
      for (let i = 0; i < 36; i++) {
        ctx.globalAlpha = rand(0.15, 0.6)
        ctx.fillStyle = Math.random() < 0.3 ? 'rgba(42,203,138,1)' : 'rgba(224,233,255,0.9)'
        ctx.beginPath()
        ctx.arc(rand(0, w), rand(0, h), rand(0.8, 2), 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 1
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

        <button className="ai-card" onClick={() => router.push('/analyst')} aria-label={t('aiStudioTitle')}>
          <span className="ai-card-orb" />
          <span className="ai-card-shine" />
          <span className="ai-card-body">
            <span className="ai-card-copy">
              <span className="ai-card-badge"><Sparkles size={12} strokeWidth={2.4} /> {t('aiStudioBadge')}</span>
              <span className="ai-card-title">{t('aiStudioTitle')}</span>
              <span className="ai-card-sub">{t('aiStudioSub')}</span>
              <span className="ai-card-cta">{t('aiStudioCta')} <ArrowRight size={14} strokeWidth={2.6} /></span>
            </span>
            <span className="ai-card-art"><AiArt /></span>
          </span>
        </button>

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
        .ai-card {
          position: relative;
          width: 100%;
          display: block;
          margin-bottom: 20px;
          padding: 0;
          border: 1px solid rgba(0, 82, 252, 0.4);
          border-radius: 24px;
          overflow: hidden;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          color: #fff;
          background:
            radial-gradient(120% 140% at 88% -10%, rgba(139, 92, 246, 0.35), transparent 52%),
            radial-gradient(120% 150% at -10% 110%, rgba(6, 182, 212, 0.28), transparent 55%),
            linear-gradient(135deg, rgba(0, 82, 252, 0.30), rgba(23, 37, 84, 0.55));
          -webkit-tap-highlight-color: transparent;
        }
        .ai-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 24px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.12);
          pointer-events: none;
        }
        .ai-card-orb {
          position: absolute;
          top: -30px;
          right: -24px;
          width: 160px;
          height: 160px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0, 82, 252, 0.55), rgba(139, 92, 246, 0.28) 55%, transparent 72%);
          filter: blur(20px);
          animation: aiOrb 6s ease-in-out infinite;
          pointer-events: none;
        }
        .ai-card-shine {
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.08) 45%, transparent 60%);
          transform: translateX(-130%);
          animation: aiShine 7s ease-in-out infinite;
          pointer-events: none;
        }
        .ai-card-body {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 20px 18px 20px 20px;
        }
        .ai-card-copy {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .ai-card-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 9px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #FFD77A;
          background: rgba(255, 215, 122, 0.1);
          border: 1px solid rgba(255, 215, 122, 0.32);
        }
        .ai-card-title {
          font-size: 21px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #fff;
          line-height: 1.15;
        }
        .ai-card-sub {
          margin-top: 5px;
          font-size: 12px;
          line-height: 1.45;
          color: rgba(226, 232, 240, 0.72);
        }
        .ai-card-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 13px;
          padding: 8px 15px;
          border-radius: 12px;
          font-size: 12.5px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(120deg, #0052FC, #7C3AED);
          box-shadow: 0 8px 20px rgba(0, 82, 252, 0.35);
        }
        .ai-card-art {
          flex: 0 0 auto;
          width: 118px;
          height: 118px;
          position: relative;
        }
        .ai-art {
          width: 100%;
          height: 100%;
          display: block;
          filter: drop-shadow(0 10px 26px rgba(0, 82, 252, 0.35));
        }
        .ai-card:active { transform: scale(0.985); }
        @keyframes aiOrb {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.22); opacity: 1; }
        }
        @keyframes aiShine {
          0%, 55% { transform: translateX(-130%); }
          85%, 100% { transform: translateX(130%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-card-orb, .ai-card-shine { animation: none; }
        }
        @media (min-width: 768px) {
          .ai-card:hover {
            border-color: rgba(0, 82, 252, 0.65);
            box-shadow: 0 12px 40px rgba(0, 82, 252, 0.28);
          }
          .ai-card-art { width: 150px; height: 150px; }
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