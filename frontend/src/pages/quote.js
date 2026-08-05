import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import MarketChart from '../components/MarketChart'
import { getCompany, getCompanyMarketData, getMarketLive, getCompanies, getPosition, getPortfolio, placeOrder } from '../services/api'
import { useAuth } from '../lib/auth'
import { ArrowLeft, Star, FileText, Sparkles, Briefcase, X, Plus, Minus, ChevronDown, Search } from 'lucide-react'
import { detectLang, t, fmtPrice, fmtCompact, fmtChange } from '../lib/i18n'

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

const PERIODS = [
  { id: '1m', label: '1M', days: 31 },
  { id: '3m', label: '3M', days: 92 },
  { id: '6m', label: '6M', days: 183 },
  { id: '1a', label: '1A', days: 366 },
  { id: '3a', label: '3A', days: 1096 },
  { id: '5a', label: '5A', days: 99999 },
  { id: 'max', label: 'MAX', days: 999999 },
]

export default function Quote() {
  const router = useRouter()
  const { user } = useAuth()
  const rawSymbol = Array.isArray(router.query.symbol) ? router.query.symbol[0] : router.query.symbol
  const symbol = (rawSymbol || 'ETIT').toUpperCase()
  const [lang, setLang] = useState('fr')
  const [company, setCompany] = useState(null)
  const [allData, setAllData] = useState([])
  const [period, setPeriod] = useState('1a')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [isFav, setIsFav] = useState(false)
  const [orderModal, setOrderModal] = useState(null) // 'buy' | 'sell' | null
  const [orderQty, setOrderQty] = useState('100')
  const [flash, setFlash] = useState(null)
  const [liveInfo, setLiveInfo] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [symbols, setSymbols] = useState(null)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState(null)
  const [orders, setOrders] = useState([])
  const [busy, setBusy] = useState(false)

  const flashRef = useRef(null)
  const companyRef = useRef(null)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    if (!symbol) return
    try {
      const res = await getCompany(symbol)
      if (!mounted.current) return
      companyRef.current = res.data
      setCompany(res.data)
      setError(false)
      try { localStorage.setItem('bluerock_last_symbol', symbol) } catch {}
      try {
        const md = await getCompanyMarketData(res.data.id, 20000)
        if (mounted.current) setAllData(md.data || [])
      } catch {}
    } catch {
      if (mounted.current && !companyRef.current) {
        if (symbol !== 'ETIT') {
          router.replace('/quote?symbol=ETIT')
          return
        }
        setError(true)
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [symbol, router])

  const tick = useCallback(async () => {
    if (!symbol) return
    try {
      const res = await getMarketLive()
      if (!mounted.current) return
      const feed = res.data
      setLiveInfo(feed)
      const px = (feed.prices || {})[symbol]
      if (px) {
        setCompany(prev => {
          if (!prev) return prev
          if (prev.current_price != null && Math.abs(prev.current_price - px.price) > 1e-9) {
            flashRef.current = px.price > prev.current_price ? 'up' : 'down'
          }
          return { ...prev, current_price: px.price, change_percent: px.change, price_source: 'BRVM_LIVE' }
        })
        if (flashRef.current) {
          setFlash(flashRef.current)
          flashRef.current = null
          setTimeout(() => { if (mounted.current) setFlash(null) }, 1200)
        }
      }
    } catch {}
  }, [symbol])

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    setLoading(true)
    setCompany(null)
    companyRef.current = null
    setAllData([])
    load()
    setIsFav(loadJSON(FAV_KEY, []).includes(symbol))
    if (user) {
      getPosition(symbol).then(r => { if (mounted.current) setPosition(r.data) }).catch(() => {})
      getPortfolio().then(r => { if (mounted.current) setOrders(r.data?.orders || []) }).catch(() => {})
    } else {
      setPosition(null)
      setOrders([])
    }
    const interval = setInterval(() => load(), 60000)
    const liveInterval = setInterval(() => tick(), 15000)
    return () => { mounted.current = false; clearInterval(interval); clearInterval(liveInterval) }
  }, [symbol, load, tick, user])

  const toggleFavorite = () => {
    const favs = loadJSON(FAV_KEY, [])
    const next = favs.includes(symbol) ? favs.filter(s => s !== symbol) : [...favs, symbol]
    saveJSON(FAV_KEY, next)
    setIsFav(next.includes(symbol))
  }

  const openPicker = async () => {
    setPickerOpen(true)
    if (!symbols) {
      try {
        const res = await getCompanies({ limit: 100 })
        setSymbols(res.data.companies || [])
      } catch {}
    }
  }
  const filtered = useMemo(() => {
    if (!symbols) return []
    const q = query.trim().toUpperCase()
    return symbols.filter(c =>
      (c.symbol || '').toUpperCase().includes(q) || (c.name || '').toUpperCase().includes(q)
    ).slice(0, 60)
  }, [symbols, query])

  const periodCfg = useMemo(() => PERIODS.find(p => p.id === period) || PERIODS[3], [period])
  const cutoff = useMemo(() => new Date(Date.now() - periodCfg.days * 86400000), [periodCfg])
  const data = useMemo(() => allData.filter(d => new Date(d.date) >= cutoff), [allData, cutoff])
  const sorted = useMemo(() => [...data].sort((a, b) => new Date(a.date) - new Date(b.date)), [data])

  const last = sorted.length ? sorted[sorted.length - 1] : null
  const first = sorted.length ? sorted[0] : null

  const orderMarkers = useMemo(() => {
    if (!orders.length || !sorted.length) return []
    const dates = [...new Set(sorted.map(d => String(d.date).slice(0, 10)))].sort()
    const nearest = target => {
      let lo = 0, hi = dates.length - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (dates[mid] < target) lo = mid + 1
        else if (dates[mid] > target) hi = mid - 1
        else return dates[mid]
      }
      const before = dates[hi]
      const after = dates[lo]
      if (before && after) return (target - before <= after - target ? before : after)
      return before || after
    }
    return orders
      .filter(o => o.symbol === symbol && o.created_at)
      .map(o => {
        const buy = o.side === 'buy'
        return {
          time: nearest(String(o.created_at).slice(0, 10)),
          position: buy ? 'belowBar' : 'aboveBar',
          shape: buy ? 'arrowUp' : 'arrowDown',
          color: buy ? '#22C55E' : '#EF4444',
          text: `${buy ? 'A' : 'V'} ${o.qty}`,
          size: 1,
        }
      })
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [orders, symbol, sorted])
  const isLive = liveInfo?.status === 'LIVE' && company?.current_price != null
  const price = isLive ? company.current_price : last?.close_price ?? company?.current_price ?? null
  const periodChange = first ? price - first.close_price : 0
  const periodChangePct = first?.close_price ? (periodChange / first.close_price) * 100 : null
  const up = (periodChangePct ?? 0) >= 0
  const dayChange = company?.change_percent ?? last?.change_percent ?? 0

  const highP = useMemo(() => sorted.length ? Math.max(...sorted.map(d => d.high_price ?? d.close_price)) : null, [sorted])
  const lowP = useMemo(() => sorted.length ? Math.min(...sorted.map(d => d.low_price ?? d.close_price)) : null, [sorted])
  const yearCutoff = useMemo(() => new Date(Date.now() - 366 * 86400000), [])
  const yearData = useMemo(() => allData.filter(d => new Date(d.date) >= yearCutoff), [allData, yearCutoff])
  const yearHigh = useMemo(() => yearData.length ? Math.max(...yearData.map(d => d.high_price ?? d.close_price)) : null, [yearData])
  const yearLow = useMemo(() => yearData.length ? Math.min(...yearData.map(d => d.low_price ?? d.close_price)) : null, [yearData])

  const executeOrder = async () => {
    if (orderModal !== 'buy' && orderModal !== 'sell') return
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    const qty = parseFloat(orderQty)
    if (!qty || qty <= 0 || !company || !price) return
    setBusy(true)
    try {
      const res = await placeOrder({ symbol, side: orderModal, qty, price })
      setPosition(res.data.position.qty > 0 ? res.data.position : null)
      try {
        const pf = await getPortfolio()
        if (mounted.current) setOrders(pf.data?.orders || [])
      } catch {}
      setOrderModal(null)
      setOrderQty('100')
      setFlash(orderModal === 'buy' ? 'up' : 'down')
      setTimeout(() => setFlash(null), 1500)
    } catch (err) {
      const d = err?.response?.data?.detail
      setFlash(d ? 'down' : 'down')
      setOrderModal(null)
    } finally {
      setBusy(false)
    }
  }

  const statusText = `${t(lang, 'updated')} ${new Date(last?.date || Date.now()).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}`

  return (
    <div className="mobile-root">
      <div className="quote-area">
        <header className="q-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <button className="q-title" onClick={openPicker}>
            <span className="q-symbol">{symbol} <ChevronDown size={12} className="q-chev" /></span>
            <span className="q-name">{company?.name?.substring(0, 34)}</span>
          </button>
          <button className={`icon-btn ${isFav ? 'fav-active' : ''}`} onClick={toggleFavorite}>
            <Star size={20} fill={isFav ? '#ffd166' : 'none'} color={isFav ? '#ffd166' : '#fff'} />
          </button>
        </header>

        {loading ? (
          <div className="loading-screen">
            <div className="spinner" />
            <span>{t(lang, 'loading')}</span>
          </div>
        ) : error || !company ? (
          <div className="loading-screen">
            <span className="err-title">404 — {t(lang, 'notFound')}</span>
            <span className="err-sub">{t(lang, 'tryAgain')}</span>
            <button className="back-btn" onClick={() => router.push('/companies')}>
              {t(lang, 'companies')}
            </button>
          </div>
        ) : (
          <>
            <div className="q-hero">
              <div className="q-pair">
                <div className="q-logo-fallback">{company.logo_url ? <img src={company.logo_url} alt={company.symbol} className="q-logo-img" /> : company.symbol?.[0]}</div>
                <div className="q-pair-text">
                  <span className="q-base">{company.symbol}</span>
                  <span className="q-div">/</span>
                  <span className="q-quote">FCFA</span>
                </div>
                <span className="q-sector">{company.sector}</span>
              </div>
              {liveInfo?.status === 'LIVE' && (
                <span className="q-live-badge">
                  <span className="status-dot open pulse" />
                  {t(lang, 'liveFeed')} · {t(lang, 'updated')} {liveInfo.last_update ? new Date(liveInfo.last_update).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                </span>
              )}
              <div className={`q-price ${up ? 'up' : 'down'} ${flash ? `flash-${flash}` : ''}`}>{fmtPrice(lang, price)}</div>
              <div className={`q-change ${up ? 'up' : 'down'}`}>
                {periodChangePct != null ? fmtChange(lang, periodChangePct) : fmtChange(lang, dayChange)}
                <span className="q-period">{periodCfg.label}</span>
              </div>
              <div className="q-range">
                {first && last && `${t(lang, 'range')}: ${fmtPrice(lang, lowP)} – ${fmtPrice(lang, highP)}`}
              </div>
            </div>

            <div className="q-stats">
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'open')}</span>
                <span className="qs-value">{fmtPrice(lang, last?.open_price ?? first?.close_price)}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'prevClose')}</span>
                <span className="qs-value">{fmtPrice(lang, (isLive ? company?.change_percent : last?.change_percent) != null && price != null ? price / (1 + (isLive ? company?.change_percent : last?.change_percent) / 100) : null)}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'high')} · {periodCfg.label}</span>
                <span className="qs-value up">{highP != null ? fmtPrice(lang, highP) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'low')} · {periodCfg.label}</span>
                <span className="qs-value down">{lowP != null ? fmtPrice(lang, lowP) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">52 {t(lang, 'weeks')} {t(lang, 'high')}</span>
                <span className="qs-value up">{yearHigh != null ? fmtPrice(lang, yearHigh) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">52 {t(lang, 'weeks')} {t(lang, 'low')}</span>
                <span className="qs-value down">{yearLow != null ? fmtPrice(lang, yearLow) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'volume')}</span>
                <span className="qs-value">{fmtCompact(lang, last?.volume)}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'marketCap')}</span>
                <span className="qs-value">{fmtCompact(lang, company.market_cap)}</span>
              </div>
            </div>

            <div className="chart-area">
              <MarketChart
                data={sorted}
                period={period}
                lang={lang}
                statusText={statusText}
                markers={orderMarkers}
              />
            </div>

            <div className="chart-timeframes">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  className={`tf-btn ${period === p.id ? 'active' : ''}`}
                  onClick={() => setPeriod(p.id)}
                >{p.label}</button>
              ))}
            </div>

            <div className="quick-links">
              <button className="ql-btn" onClick={() => router.push(`/company?id=${company.id}`)}>
                <FileText size={14} /> {t(lang, 'fundamentals')}
              </button>
              <button className="ql-btn" onClick={() => router.push('/analyst')}>
                <Sparkles size={14} /> {t(lang, 'analyst')}
              </button>
              <button className="ql-btn" onClick={() => router.push('/watchlist')}>
                <Briefcase size={14} /> {t(lang, 'portfolio')}
              </button>
            </div>

            <div className="order-section">
              <div className="order-box buy" onClick={() => { if (!user) { router.push(`/login?next=${encodeURIComponent(router.asPath)}`); return } setOrderQty('100'); setOrderModal('buy') }}>
                <span className="order-label">{t(lang, 'buy')}</span>
                <span className="order-val">+{fmtPrice(lang, price)}</span>
              </div>
              {position && position.qty > 0 && (
                <div className="order-box sell" onClick={() => { setOrderQty(String(position?.qty ?? 1)); setOrderModal('sell') }}>
                  <span className="order-label">{t(lang, 'sell')} · {position.qty} {t(lang, 'shares')}</span>
                  <span className="order-val">−{fmtPrice(lang, price)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal picker" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{t(lang, 'selectStock')}</span>
              <button className="icon-btn" onClick={() => setPickerOpen(false)}><X size={18} /></button>
            </div>
            <div className="pick-search">
              <Search size={14} className="pick-search-ico" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t(lang, 'searchPlaceholder')}
              />
            </div>
            <div className="pick-list">
              {filtered.map(c => (
                <button
                  key={c.id}
                  className={`pick-item ${c.symbol === symbol ? 'active' : ''}`}
                  onClick={() => {
                    setPickerOpen(false)
                    setQuery('')
                    router.replace(`/quote?symbol=${encodeURIComponent(c.symbol)}`)
                  }}
                >
                  <span className="pick-sym">{c.symbol}</span>
                  <span className="pick-name">{c.name}</span>
                </button>
              ))}
              {!filtered.length && <span className="pick-empty">{t(lang, 'noResults')}</span>}
            </div>
          </div>
        </div>
      )}

      {orderModal && company && (
        <div className="modal-overlay" onClick={() => setOrderModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{orderModal === 'buy' ? t(lang, 'buy') : t(lang, 'sell')} {company.symbol}</span>
              <button className="icon-btn" onClick={() => setOrderModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-price">
              <span className="mp-label">{t(lang, 'price')}</span>
              <span className="mp-val">{fmtPrice(lang, price)} FCFA</span>
            </div>
            <div className="qty-row">
              <button className="qty-btn" onClick={() => setOrderQty(String(Math.max(1, (parseFloat(orderQty) || 100) - 100)))}><Minus size={16} /></button>
              <input
                type="number" min="1" step="any"
                value={orderQty}
                max={orderModal === 'sell' ? (position?.qty ?? undefined) : undefined}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  const cap = orderModal === 'sell' ? (position?.qty ?? Infinity) : Infinity
                  setOrderQty(String(Math.max(1, Math.min(v || 1, cap))))
                }}
              />
              <button className="qty-btn" onClick={() => setOrderQty(String((parseFloat(orderQty) || 100) + 100))}><Plus size={16} /></button>
            </div>
            <div className="modal-total">
              <span>{t(lang, 'total')}</span>
              <span className="mt-val">{fmtPrice(lang, (parseFloat(orderQty) || 0) * price)} FCFA</span>
            </div>
            <button
              className={`modal-exec ${orderModal === 'buy' ? 'buy' : 'sell'}`}
              onClick={executeOrder}
              disabled={!(parseFloat(orderQty) > 0)}
            >
              {orderModal === 'buy' ? t(lang, 'confirmBuy') : t(lang, 'confirmSell')}
            </button>
          </div>
        </div>
      )}

      <BottomNav active="chart" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif;
        }
        .quote-area {
          flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding: 0 16px;
        }
        .quote-area::-webkit-scrollbar { display: none; }
        .q-header {
          display: flex; align-items: center; justify-content: space-between;
          height: 56px; flex-shrink: 0;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .fav-active { background: rgba(255,209,102,0.1); }
        .q-title { display: flex; flex-direction: column; align-items: center; gap: 1px; background: none; border: none; color: inherit; font-family: inherit; padding: 0 8px; cursor: pointer; border-radius: 10px; }
        .q-title:active { background: #1a1a1a; }
        .q-chev { vertical-align: middle; opacity: 0.7; }
        .q-symbol { font-size: 16px; font-weight: 700; }
        .q-name { font-size: 12px; color: #a3a3a3; max-width: 220px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .q-hero { padding: 8px 4px 12px; flex-shrink: 0; }
        .q-pair { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .q-logo-fallback {
          width: 32px; height: 32px; border-radius: 50%; background: #262626;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 14px;
          overflow: hidden;
        }
        .q-logo-img { width: 100%; height: 100%; object-fit: cover; }
        .q-pair-text { display: flex; align-items: center; gap: 3px; }
        .q-base { font-size: 18px; font-weight: 700; }
        .q-div { color: #666; font-size: 14px; }
        .q-quote { color: #a3a3a3; font-size: 14px; }
        .q-sector {
          font-size: 11px; color: #a3a3a3; background: #1B1B1B;
          padding: 4px 10px; border-radius: 12px;
        }
        .q-live-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; color: #00C853;
          background: rgba(0,200,83,0.12); border: 1px solid rgba(0,200,83,0.35);
          padding: 3px 10px; border-radius: 12px; margin-top: 6px;
        }
        .status-dot.open { width: 7px; height: 7px; border-radius: 50%; background: #00C853; box-shadow: 0 0 6px #00C853; }
        .status-dot.open.pulse { animation: pulseDot 1.6s ease-in-out infinite; }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .q-price {
          font-size: 34px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
          display: inline-block; border-radius: 8px; line-height: 1.2;
        }
        .q-price.up { color: #00C853; }
        .q-price.down { color: #FF4D4F; }
        .flash-up { animation: flashUp 1s ease; }
        .flash-down { animation: flashDown 1s ease; }
        @keyframes flashUp {
          0% { background: rgba(0,200,83,0.3); }
          100% { background: transparent; }
        }
        @keyframes flashDown {
          0% { background: rgba(255,77,79,0.3); }
          100% { background: transparent; }
        }
        .q-change {
          font-size: 15px; font-weight: 600; font-family: 'JetBrains Mono', monospace;
          display: flex; align-items: center; gap: 6px; margin-top: 2px;
        }
        .q-change.up { color: #00C853; }
        .q-change.down { color: #FF4D4F; }
        .q-period {
          font-size: 11px; color: #a3a3a3; background: #1B1B1B;
          padding: 2px 8px; border-radius: 8px;
        }
        .q-range { font-size: 12px; color: #a3a3a3; margin-top: 2px; }
        .q-stats {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
          margin-bottom: 8px; flex-shrink: 0;
        }
        .q-stat-card {
          display: flex; flex-direction: column; gap: 3px;
          padding: 8px 8px; background: #1B1B1B; border-radius: 12px; min-width: 0;
        }
        .qs-label { font-size: 9px; color: #a3a3a3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .qs-value {
          font-size: 11px; font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .qs-value.up { color: #00C853; }
        .qs-value.down { color: #FF4D4F; }
        .chart-area {
          display: flex; flex-direction: column;
          height: clamp(420px, 62vh, 680px);
          min-height: 420px;
          margin: 0 -8px;
        }
        .chart-timeframes {
          display: flex; gap: 4px; padding: 8px 0 6px; flex-shrink: 0; overflow-x: auto;
        }
        .chart-timeframes::-webkit-scrollbar { display: none; }
        .tf-btn {
          padding: 5px 12px; background: none; border: none; color: #666;
          font-size: 13px; cursor: pointer; border-radius: 10px;
          font-family: inherit; font-weight: 500; flex-shrink: 0;
        }
        .tf-btn.active { background: #262626; color: #fff; }
        .quick-links {
          display: flex; gap: 8px; padding: 4px 0; flex-shrink: 0;
        }
        .ql-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #a3a3a3; font-size: 11px; font-weight: 500;
          cursor: pointer; font-family: inherit; height: 36px;
        }
        .ql-btn:hover { color: #fff; background: #232323; }
        .order-section {
          display: flex; gap: 8px; padding: 8px 0 10px; flex-shrink: 0;
        }
        .order-box {
          flex: 1; display: flex; flex-direction: column; gap: 2px;
          padding: 10px 12px; border-radius: 14px; cursor: pointer;
        }
        .order-box.sell { background: rgba(255,77,79,0.15); }
        .order-box.buy { background: rgba(0,200,83,0.15); }
        .order-label { font-size: 11px; color: #a3a3a3; }
        .order-val { font-size: 15px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .order-box.sell .order-val { color: #FF4D4F; }
        .order-box.buy .order-val { color: #00C853; }
        .loading-screen {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 12px;
          color: #a3a3a3; font-size: 14px;
        }
        .err-title { font-size: 20px; font-weight: 700; color: #fff; }
        .err-sub { color: #666; font-size: 12px; }
        .back-btn {
          background: #8b5cf6; border: none; border-radius: 12px;
          color: #fff; padding: 10px 20px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; margin-top: 6px;
        }
        .spinner {
          width: 28px; height: 28px;
          border: 3px solid #262626; border-top-color: #8b5cf6;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .modal-overlay {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(0,0,0,0.7); display: flex; align-items: flex-end; justify-content: center;
        }
        .modal {
          width: 100%; max-width: 480px;
          background: #141414; border-radius: 20px 20px 0 0;
          padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 10px;
        }
        .modal-head { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; }
        .modal-price {
          display: flex; justify-content: space-between; align-items: center;
          background: #1B1B1B; border-radius: 12px; padding: 12px 14px;
        }
        .mp-label { font-size: 12px; color: #a3a3a3; }
        .mp-val { font-size: 16px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .qty-row { display: flex; align-items: center; gap: 10px; }
        .qty-btn {
          width: 44px; height: 44px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: #1B1B1B; border: none; border-radius: 12px; color: #fff; cursor: pointer;
        }
        .qty-row input {
          flex: 1; text-align: center;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #fff; font-size: 18px; font-weight: 700;
          font-family: 'JetBrains Mono', monospace; outline: none; height: 44px;
        }
        .modal-total {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 2px; font-size: 13px; color: #a3a3a3;
        }
        .mt-val { font-size: 15px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; }
        .modal-exec {
          height: 46px; border: none; border-radius: 14px;
          color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .modal-exec.buy { background: #00C853; }
        .modal-exec.sell { background: #FF4D4F; }
        .modal-exec:disabled { opacity: 0.4; }
        .picker { max-height: 75vh; }
        .pick-search {
          display: flex; align-items: center; gap: 8px;
          background: #1B1B1B; border-radius: 12px; padding: 10px 12px;
        }
        .pick-search-ico { color: #666; flex-shrink: 0; }
        .pick-search input {
          flex: 1; background: none; border: none; outline: none;
          color: #fff; font-size: 14px; font-family: inherit;
        }
        .pick-list {
          max-height: 52vh; overflow-y: auto;
          display: flex; flex-direction: column; gap: 2px;
        }
        .pick-item {
          display: flex; align-items: center; gap: 10px;
          background: none; border: none; border-radius: 10px;
          padding: 10px 12px; cursor: pointer; font-family: inherit; text-align: left;
        }
        .pick-item:active, .pick-item.active { background: #232323; }
        .pick-sym {
          font-weight: 700; font-size: 13px; color: #fff;
          font-family: 'JetBrains Mono', monospace; min-width: 52px;
        }
        .pick-name { font-size: 12px; color: #a3a3a3; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .pick-empty { padding: 14px; text-align: center; color: #666; font-size: 13px; }
      `}</style>
    </div>
  )
}
