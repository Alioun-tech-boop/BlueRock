import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import MarketChart from '../components/MarketChart'
import { getCompany, getCompanyMarketData, getMarketLive, getMarketNGX, getCompanies, getPosition, getPortfolio, placeOrder } from '../services/api'
import { useAuth } from '../lib/auth'
import { getActiveAccountId } from '../lib/accounts'
import { ArrowLeft, Star, FileText, Sparkles, Briefcase, X, Plus, Minus, ChevronDown, Search, AlertTriangle } from 'lucide-react'
import { detectLang, t, fmtPrice, fmtPriceCur, fmtCompact, fmtChange } from '../lib/i18n'
import { aggregateOhlc } from '../lib/ohlc'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import DataErrorState from '../components/DataErrorState'
import { getFavKey, migrateAnonFavToUser } from '../lib/accounts'

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
  { id: '1j', label: '1j', kind: '1j' },
  { id: '1m', label: '1M', kind: '1m' },
  { id: '3m', label: '3M', kind: '3m' },
  { id: '6m', label: '6M', kind: '6m' },
  { id: '1a', label: '1A', kind: '1a' },
  { id: '3a', label: '3A', kind: '3a' },
  { id: '5a', label: '5A', kind: '5a' },
  { id: 'max', label: 'MAX', kind: 'max' },
]

export default function Quote() {
  const router = useRouter()
  const { user } = useAuth()
  const rawSymbol = Array.isArray(router.query.symbol) ? router.query.symbol[0] : router.query.symbol
  const symbol = router.isReady ? (rawSymbol || 'ETIT').toUpperCase() : ''
  const [lang, setLang] = useState('fr')
  const [company, setCompany] = useState(null)
  const [allData, setAllData] = useState([])
  const [period, setPeriod] = useState('1j')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [isFav, setIsFav] = useState(false)
  const [orderModal, setOrderModal] = useState(null) // 'buy' | 'sell' | null
  const [orderQty, setOrderQty] = useState('100')
  const [orderType, setOrderType] = useState('market') // 'market' | 'limit'
  const [orderLimit, setOrderLimit] = useState('')
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [orderUnlimited, setOrderUnlimited] = useState(true)
  const [orderValidUntil, setOrderValidUntil] = useState('')
  const [orderErr, setOrderErr] = useState('')
  const [marketNote, setMarketNote] = useState('')
  const [flash, setFlash] = useState(null)
  const [liveInfo, setLiveInfo] = useState(null)
  const [liveVol, setLiveVol] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [symbols, setSymbols] = useState(null)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState(null)
  const [orders, setOrders] = useState([])
  const [activeAcc, setActiveAcc] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setHydrated(true) }, [])

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
      const isNgx = companyRef.current?.exchange === 'NGX' || companyRef.current?.currency === 'NGN'
      const res = isNgx ? await getMarketNGX() : await getMarketLive()
      if (!mounted.current) return
      const feed = res.data
      setLiveInfo(feed)
      const vol = (feed.volumes || {})[symbol]
      if (vol && vol.volume > 0) {
        setLiveVol(prev => {
          const next = { volume: vol.volume, estimated: !!vol.estimated }
          return prev && prev.volume === next.volume && prev.estimated === next.estimated ? prev : next
        })
      }
      const px = (feed.prices || {})[symbol]
      if (px) {
        setCompany(prev => {
          if (!prev) return prev
          if (prev.current_price != null && Math.abs(prev.current_price - px.price) > 1e-9) {
            flashRef.current = px.price > prev.current_price ? 'up' : 'down'
          }
          return { ...prev, current_price: px.price, change_percent: px.change, price_source: isNgx ? 'NGX_LIVE' : 'BRVM_LIVE' }
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
    setLiveVol(null)
    load()
    try { migrateAnonFavToUser(user) } catch {}
    setIsFav(loadJSON(getFavKey(user), []).includes(symbol))
    if (user) {
      getPosition(symbol, getActiveAccountId(user)).then(r => { if (mounted.current) setPosition(r.data) }).catch(() => {})
      getPortfolio(getActiveAccountId(user)).then(r => {
        if (!mounted.current) return
        setOrders(r.data?.orders || [])
        setActiveAcc(r.data?.account || null)
      }).catch(() => {})
    } else {
      setPosition(null)
      setOrders([])
      setActiveAcc(null)
    }
    const interval = setInterval(() => load(), 60000)
    const liveInterval = setInterval(() => tick(), 15000)
    return () => { mounted.current = false; clearInterval(interval); clearInterval(liveInterval) }
  }, [symbol, load, tick, user])

  const toggleFavorite = () => {
    const favKey = getFavKey(user)
    const favs = loadJSON(favKey, [])
    const next = favs.includes(symbol) ? favs.filter(s => s !== symbol) : [...favs, symbol]
    saveJSON(favKey, next)
    try { if (favKey !== FAV_KEY) saveJSON(FAV_KEY, next) } catch {}
    setIsFav(next.includes(symbol))
  }

  const openPicker = async () => {
    setPickerOpen(true)
    if (!symbols) {
      try {
        const res = await getCompanies({ limit: 300 })
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
  const data = useMemo(() => aggregateOhlc(allData, periodCfg.kind), [allData, periodCfg])
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
  const price = isLive ? company.current_price : last?.close ?? company?.current_price ?? null
  const dayChange = company?.change_percent ?? last?.change_percent ?? 0
  const prevCloseP = sorted.length >= 2 ? sorted[sorted.length - 2].close : null
  const periodChangePct = period === '1j'
    ? (dayChange ?? null)
    : period === 'max'
      ? (first?.open && price != null ? ((price - first.open) / first.open) * 100 : null)
      : (last?.close != null && prevCloseP != null ? ((last.close - prevCloseP) / prevCloseP) * 100 : null)
  const up = (periodChangePct ?? 0) >= 0

  const highP = useMemo(() => {
    if (!sorted.length) return null
    if (period === 'max') return Math.max(...sorted.map(d => d.high ?? d.close))
    return last?.high ?? last?.close ?? null
  }, [sorted, period, last])
  const lowP = useMemo(() => {
    if (!sorted.length) return null
    if (period === 'max') return Math.min(...sorted.map(d => d.low ?? d.close))
    return last?.low ?? last?.close ?? null
  }, [sorted, period, last])
  const yearCutoff = useMemo(() => new Date(Date.now() - 366 * 86400000), [])
  const yearData = useMemo(() => allData.filter(d => new Date(d.date) >= yearCutoff), [allData, yearCutoff])
  const yearHigh = useMemo(() => yearData.length ? Math.max(...yearData.map(d => d.high_price ?? d.close_price)) : null, [yearData])
  const yearLow = useMemo(() => yearData.length ? Math.min(...yearData.map(d => d.low_price ?? d.close_price)) : null, [yearData])

  const openOrder = (side) => {
    setMarketNote(liveInfo && liveInfo.market_open === false ? t(lang, 'marketClosedPending') : '')
    // Invité autorisé : ordre local, sinon redirection login supprimée pour conserver portefeuille hors connexion
    setOrderQty(side === 'sell' ? String(position?.qty ?? 1) : '100')
    setOrderUnlimited(true)
    setOrderValidUntil('')
    setOrderErr('')
    setOrderModal(side)
  }

  const executeOrder = async () => {
    if (orderModal !== 'buy' && orderModal !== 'sell') return
    const qty = parseFloat(orderQty)
    if (!qty || qty <= 0 || !company || !price) return
    const execPx = orderType === 'limit' ? parseFloat(orderLimit) : price
    if (orderType === 'limit' && (!execPx || execPx <= 0)) {
      setOrderErr(t(lang, 'limitPriceErr'))
      return
    }
    const tpV = tp.trim() ? parseFloat(tp) : null
    const slV = sl.trim() ? parseFloat(sl) : null
    if ((tpV != null && !(tpV > execPx)) || (slV != null && !(slV < execPx))) {
      setOrderErr(t(lang, 'tpslErr'))
      return
    }
    setOrderErr('')
    setBusy(true)
    const validUntil = (orderType === 'limit' && !orderUnlimited && orderValidUntil)
      ? new Date(orderValidUntil).toISOString()
      : null
    try {
      if (!user) {
        const { guestPlaceOrder } = await import('../lib/guestPortfolio')
        const res = guestPlaceOrder({ symbol, side: orderModal, qty, price: execPx, order_type: orderType, limit_price: orderType==='limit'?execPx:null, take_profit: tpV, stop_loss: slV, valid_until: validUntil })
        if (res.status==='pending') setMarketNote(t(lang, 'orderExecutesOpen'))
        // guest position mise à jour localement
        try {
          const { getGuestPositions } = await import('../lib/guestPortfolio')
          const gp = getGuestPositions()[symbol]
          if (gp) setPosition({ symbol, qty: gp.qty, avg_price: gp.avgPrice })
        } catch {}
        // rafraîchir liste ordres invité via getGuestOrders si besoin
        setOrderModal(null)
        setOrderQty('100'); setOrderLimit(''); setTp(''); setSl(''); setOrderType('market'); setOrderErr('')
        setFlash(orderModal === 'buy' ? 'up' : 'down'); setTimeout(()=>setFlash(null),1500)
        return
      }
      const res = await placeOrder({
        symbol,
        side: orderModal,
        qty,
        price: execPx,
        order_type: orderType,
        limit_price: orderType === 'limit' ? execPx : null,
        take_profit: tpV,
        stop_loss: slV,
        valid_until: validUntil,
        account_id: getActiveAccountId(user),
      })
      if (res.data.status === 'pending' && res.data.executes_at_open) {
        setMarketNote(t(lang, 'orderExecutesOpen'))
      }
      if (res.data.position && res.data.position.qty > 0) setPosition(res.data.position)
      try {
        const pf = await getPortfolio(getActiveAccountId(user))
        if (mounted.current) setOrders(pf.data?.orders || [])
      } catch {}
      setOrderModal(null)
      setOrderQty('100')
      setOrderLimit('')
      setTp('')
      setSl('')
      setOrderType('market')
      setOrderErr('')
      setFlash(orderModal === 'buy' ? 'up' : 'down')
      setTimeout(() => setFlash(null), 1500)
    } catch (err) {
      const d = err?.response?.data?.detail
      setOrderErr(d || err?.message || t(lang, 'tradeFailed'))
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
            <span className="q-symbol">{hydrated ? `${symbol}` : ''} <ChevronDown size={12} className="q-chev" /></span>
            <span className="q-name">{hydrated ? company?.name?.substring(0, 34) : ''}</span>
          </button>
          <button className={`icon-btn ${isFav ? 'fav-active' : ''}`} onClick={toggleFavorite}>
            <Star size={20} fill={isFav ? '#ffd166' : 'none'} color={isFav ? '#ffd166' : '#fff'} />
          </button>
        </header>

        {loading ? (
          <div className="loading-screen">
            <TriLoader compact label={t(lang, 'loading')} />
          </div>
        ) : error || !company ? (
          <div className="loading-screen">
            <DataErrorState lang={lang} size={170} message={`404 — ${t(lang, 'notFound')}`} />
            <button className="back-btn" onClick={() => router.push('/companies')}>
              {t(lang, 'companies')}
            </button>
          </div>
        ) : (
          <>
            <div className="q-hero">
              <div className="q-pair">
                <div className="q-logo-fallback">{company.logo_url ? (
                  <img
                    crossOrigin="anonymous" src={company.logo_url} alt={company.symbol} className="q-logo-img"
                    onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)}
                    onError={onLogoError}
                  />
                ) : company.symbol?.[0]}</div>
                <div className="q-pair-text">
                  <span className="q-base">{company.symbol}</span>
                  <span className="q-div">/</span>
                  <span className="q-quote">{company.currency === 'NGN' ? '₦' : 'FCFA'}</span>
                  {company.exchange === 'NGX' && <span className="q-ngx">NGX</span>}
                </div>
                <span className="q-sector">{company.sector}</span>
              </div>
              {liveInfo?.status === 'LIVE' && (
                <span className="q-live-badge">
                  <span className="status-dot open pulse" />
                  {t(lang, 'liveFeed')} · {t(lang, 'updated')} {liveInfo.last_update ? new Date(liveInfo.last_update).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                </span>
              )}
              <div className={`q-price ${up ? 'up' : 'down'} ${flash ? `flash-${flash}` : ''}`}>{fmtPriceCur(lang, price, company.currency)}</div>
              <div className={`q-change ${up ? 'up' : 'down'}`}>
                {periodChangePct != null ? fmtChange(lang, periodChangePct) : fmtChange(lang, dayChange)}
                <span className="q-period">{periodCfg.label}</span>
              </div>
              <div className="q-range">
                {first && last && `${t(lang, 'range')}: ${fmtPriceCur(lang, lowP, company.currency)} – ${fmtPriceCur(lang, highP, company.currency)}`}
              </div>
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

            <div className="chart-area">
              <MarketChart
                data={sorted}
                period={period}
                lang={lang}
                statusText={statusText}
                markers={orderMarkers}
                symbol={company?.symbol}
                currency={company?.currency}
                liveVolume={liveVol ? {
                  volume: liveVol.volume,
                  estimated: liveVol.estimated,
                  date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),
                } : null}
              />
            </div>

            <div className="q-stats">
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'open')}</span>
                <span className="qs-value">{fmtPriceCur(lang, last?.open ?? first?.close, company.currency)}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'prevClose')}</span>
                <span className="qs-value">{fmtPriceCur(lang, (isLive ? company?.change_percent : last?.change_percent) != null && price != null ? price / (1 + (isLive ? company?.change_percent : last?.change_percent) / 100) : null, company.currency)}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'high')} · {periodCfg.label}</span>
                <span className="qs-value up">{highP != null ? fmtPriceCur(lang, highP, company.currency) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'low')} · {periodCfg.label}</span>
                <span className="qs-value down">{lowP != null ? fmtPriceCur(lang, lowP, company.currency) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">52 {t(lang, 'weeks')} {t(lang, 'high')}</span>
                <span className="qs-value up">{yearHigh != null ? fmtPriceCur(lang, yearHigh, company.currency) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">52 {t(lang, 'weeks')} {t(lang, 'low')}</span>
                <span className="qs-value down">{yearLow != null ? fmtPriceCur(lang, yearLow, company.currency) : '—'}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'volume')}{liveVol && liveVol.estimated ? ` · ${t(lang, 'liveFeed').toLowerCase()}` : ''}</span>
                <span className="qs-value">{fmtCompact(lang, liveVol ? liveVol.volume : last?.volume)}</span>
              </div>
              <div className="q-stat-card">
                <span className="qs-label">{t(lang, 'marketCap')}</span>
                <span className="qs-value">{fmtCompact(lang, company.market_cap)}</span>
              </div>
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

            {marketNote && <div className="market-closed"><AlertTriangle size={13} /> {marketNote}</div>}
            {(company?.instrument_type && company.instrument_type !== 'equity') || company?.exchange === 'NGX' ? (
              <div className="order-section">
                <div className="trade-unav">{t(lang, 'tradeUnavailable')}</div>
              </div>
            ) : (
            <div className="order-section">
              <div className="order-box buy" onClick={() => openOrder('buy')}>
                <span className="order-label">{t(lang, 'buy')}</span>
                <span className="order-val">+{fmtPriceCur(lang, price, company.currency)}</span>
              </div>
              {position && position.qty > 0 && (
                <div className="order-box sell" onClick={() => openOrder('sell')}>
                  <span className="order-label">{t(lang, 'sell')} · {position.qty} {t(lang, 'shares')}</span>
                  <span className="order-val">−{fmtPriceCur(lang, price, company.currency)}</span>
                </div>
              )}
            </div>
            )}
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
            {activeAcc && (
              <div className="om-acc">
                <span className="om-acc-name">{activeAcc.name}</span>
                <span className="om-acc-tag">{t(lang, activeAcc.type === 'real' ? 'accReal' : 'accDemo')}</span>
                <span className="om-acc-bal mono">{fmtPrice(lang, activeAcc.balance)} {activeAcc.currency === 'NGN' ? '₦' : 'FCFA'}</span>
              </div>
            )}
            <div className="modal-price">
              <span className="mp-label">{t(lang, 'price')}</span>
              <span className="mp-val">{fmtPrice(lang, price)} {company.currency === 'NGN' ? '₦' : 'FCFA'}</span>
            </div>
            <div className="otype-row">
              <button
                className={`otype-btn ${orderType === 'market' ? 'on' : ''}`}
                onClick={() => setOrderType('market')}
              >
                {t(lang, 'orderMarket')}
              </button>
              <button
                className={`otype-btn ${orderType === 'limit' ? 'on' : ''}`}
                onClick={() => setOrderType('limit')}
              >
                {t(lang, 'orderLimit')}
              </button>
            </div>
            {orderType === 'limit' && (
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'limitPrice')} ({company.currency === 'NGN' ? '₦' : 'FCFA'})</span>
                <input
                  className="tpsl-input mono"
                  type="number" min="0" step="0.01"
                  value={orderLimit}
                  placeholder={String(price ?? '')}
                  onChange={e => setOrderLimit(e.target.value)}
                />
              </div>
            )}
            {orderType === 'limit' && (
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'orderValidity')}</span>
                <label className="tm-check" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8C99AF' }}>
                  <input type="checkbox" checked={orderUnlimited} onChange={e => setOrderUnlimited(e.target.checked)} />
                  {t(lang, 'orderUnlimited')}
                </label>
                {!orderUnlimited && (
                  <input className="tpsl-input mono" type="date" value={orderValidUntil}
                    onChange={e => setOrderValidUntil(e.target.value)} />
                )}
              </div>
            )}
            <div className="tpsl-grid">
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'takeProfit')}</span>
                <input
                  className="tpsl-input mono"
                  type="number" min="0" step="0.01"
                  value={tp}
                  placeholder={t(lang, 'opt')}
                  onChange={e => setTp(e.target.value)}
                />
              </div>
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'stopLoss')}</span>
                <input
                  className="tpsl-input mono"
                  type="number" min="0" step="0.01"
                  value={sl}
                  placeholder={t(lang, 'opt')}
                  onChange={e => setSl(e.target.value)}
                />
              </div>
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
              <span className="mt-val">{fmtPrice(lang, (parseFloat(orderQty) || 0) * (orderType === 'limit' && parseFloat(orderLimit) ? parseFloat(orderLimit) : price))} {company.currency === 'NGN' ? '₦' : 'FCFA'}</span>
            </div>
            {orderErr && <div className="order-err">{orderErr}</div>}
            <button
              className={`modal-exec ${orderModal === 'buy' ? 'buy' : 'sell'}`}
              onClick={executeOrder}
              disabled={!(parseFloat(orderQty) > 0) || busy}
            >
              {busy ? '...' : t(lang, 'tradePlace')}
            </button>
          </div>
        </div>
      )}

      <BottomNav active="chart" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
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
        .q-symbol { font-size: 18px; font-weight: 600; color: #F8F8FA; }
        .q-name { font-size: 14px; color: #9AA3B2; max-width: 220px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .q-hero { padding: 8px 4px 12px; flex-shrink: 0; }
        .q-pair { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .q-logo-fallback {
          width: 40px; height: 40px; border-radius: 50%; background: #262626;
          display: flex; align-items: center; justify-content: center;
          font-weight: 600; font-size: 18px;
          overflow: hidden;
        }
        .q-logo-img { width: 100%; height: 100%; object-fit: contain; padding: 6px; box-sizing: border-box; }
        .q-pair-text { display: flex; align-items: center; gap: 3px; }
        .q-base { font-size: 18px; font-weight: 600; color: #F8F8FA; }
        .q-div { color: #666; font-size: 14px; }
        .q-quote { color: #9AA3B2; font-size: 14px; }
        .q-ngx {
          font-size: 9px; font-weight: 700; color: #8b5cf6;
          background: rgba(139,92,246,0.15); padding: 1px 6px; border-radius: 8px;
          margin-left: 6px; vertical-align: middle;
        }
        .q-sector {
          font-size: 11px; color: #9AA3B2; background: #1B1B1B;
          padding: 4px 10px; border-radius: 12px;
        }
        .q-live-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; color: #18C27C;
          background: rgba(24,194,124,0.12); border: 1px solid rgba(24,194,124,0.35);
          padding: 3px 10px; border-radius: 12px; margin-top: 6px;
        }
        .status-dot.open { width: 7px; height: 7px; border-radius: 50%; background: #18C27C; box-shadow: 0 0 6px #18C27C; }
        .status-dot.open.pulse { animation: pulseDot 1.6s ease-in-out infinite; }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .q-price {
          font-size: 42px; font-weight: 600; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          display: inline-block; border-radius: 8px; line-height: 1.25;
        }
        .q-price.up { color: #18C27C;  }
        .q-price.down { color: #F04438;  }
        .flash-up { animation: flashUp 1s ease; }
        .flash-down { animation: flashDown 1s ease; }
        @keyframes flashUp {
          0% { background: rgba(24,194,124,0.3); }
          100% { background: transparent; }
        }
        @keyframes flashDown {
          0% { background: rgba(240,68,56,0.3); }
          100% { background: transparent; }
        }
        .q-change {
          font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          display: flex; align-items: center; gap: 6px; margin-top: 2px;
        }
        .q-change.up { color: #18C27C;  }
        .q-change.down { color: #F04438;  }
        .q-period {
          font-size: 14px; color: #9AA3B2; background: #1B1B1B;
          padding: 3px 10px; border-radius: 8px;
        }
        .q-range { font-size: 14px; color: #9AA3B2; margin-top: 3px; }
        .q-stats {
          display: flex; gap: 8px; overflow-x: auto;
          margin-bottom: 8px; flex-shrink: 0;
          scrollbar-width: none; -webkit-overflow-scrolling: touch;
        }
        .q-stats::-webkit-scrollbar { display: none; }
        .q-stat-card {
          display: flex; flex-direction: column; gap: 4px;
          padding: 12px 14px; background: #1B1B1B; border-radius: 14px;
          min-width: 118px; flex: none;
        }
        .qs-label { font-size: 14px; font-weight: 400; color: #9AA3B2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .qs-value {
          font-size: 16px; font-weight: 500;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .qs-value.up { color: #18C27C; }
        .qs-value.down { color: #F04438; }
        .chart-area {
          display: flex; flex-direction: column;
          height: clamp(580px, 88vh, 940px);
          min-height: 520px;
          margin: 0 -8px;
        }
        .chart-timeframes {
          display: flex; gap: 4px; padding: 8px 0 6px; flex-shrink: 0; overflow-x: auto;
        }
        .chart-timeframes::-webkit-scrollbar { display: none; }
        .tf-btn {
          padding: 8px 16px; background: none; border: none; color: #666;
          font-size: 15px; cursor: pointer; border-radius: 10px;
          font-family: inherit; font-weight: 600; flex-shrink: 0;
        }
        .tf-btn.active { background: #262626; color: #fff; }
        .quick-links {
          display: flex; gap: 8px; padding: 4px 0; flex-shrink: 0;
        }
        .ql-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #9AA3B2; font-size: 12.5px; font-weight: 500;
          cursor: pointer; font-family: inherit; height: 40px;
        }
        .ql-btn:hover { color: #fff; background: #232323; }
        .order-section {
          display: flex; gap: 8px; padding: 8px 0 10px; flex-shrink: 0;
        }
        .market-closed {
          display: flex; align-items: center; gap: 7px;
          font-size: 12.5px; line-height: 1.35; color: #f0b4b4;
          background: #261010; border: 1px solid rgba(240,68,56,0.35);
          border-radius: 12px; padding: 10px 12px; margin: 4px 0;
        }
        .order-box {
          flex: 1; display: flex; flex-direction: column; gap: 2px;
          padding: 12px 14px; border-radius: 14px; cursor: pointer;
        }
        .order-box.sell { background: rgba(240,68,56,0.15); }
        .order-box.buy { background: rgba(24,194,124,0.15); }
        .order-box.buy.disabled, .order-box.sell.disabled { opacity: 0.45; cursor: default; }
        .trade-unav {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 16px; border-radius: 14px; font-size: 14px; font-weight: 600;
          letter-spacing: 0.3px; color: #8b93a3; background: #15161a;
          border: 1px dashed #3a3f4a;
        }
        .order-label { font-size: 12.5px; color: #9AA3B2; }
        .order-val { font-size: 18px; font-weight: 600; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .order-box.sell .order-val { color: #F04438; }
        .order-box.buy .order-val { color: #18C27C; }
        .loading-screen {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 12px;
          color: #9AA3B2; font-size: 14px;
        }
        .err-title { font-size: 20px; font-weight: 600; color: #fff; }
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
          width: 100%; max-width: 480px; max-height: 88vh;
          background: #141414; border-radius: 20px 20px 0 0;
          padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 10px;
          overflow-y: auto;
        }
        .modal-head { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; }
        .om-acc {
          display: flex; align-items: center; gap: 8px;
          background: #1B1B1B; border-radius: 12px; padding: 10px 12px; font-size: 12px;
        }
        .om-acc-name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .om-acc-tag {
          font-size: 11px; font-weight: 600; letter-spacing: 0.1px; text-transform: uppercase;
          color: #a78bfa; background: rgba(139,92,246,0.16); padding: 3px 7px; border-radius: 7px;
        }
        .om-acc-bal { color: #18C27C; font-weight: 600; }
        .modal-price {
          display: flex; justify-content: space-between; align-items: center;
          background: #1B1B1B; border-radius: 12px; padding: 12px 14px;
        }
        .mp-label { font-size: 12px; color: #9AA3B2; }
        .mp-val { font-size: 16px; font-weight: 600; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .otype-row { display: flex; gap: 8px; }
        .otype-btn {
          flex: 1; height: 38px;
          background: #1B1B1B; color: #9AA3B2;
          border: 1px solid #2a2a2a; border-radius: 12px;
          font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .otype-btn.on {
          background: rgba(24,194,124,0.12); color: #18C27C; border-color: rgba(24,194,124,0.4);
        }
        .tpsl-grid { display: flex; gap: 10px; }
        .tpsl-grid .tpsl-row { flex: 1; min-width: 0; }
        .tpsl-row { display: flex; flex-direction: column; gap: 5px; }
        .tpsl-label { font-size: 11px; color: #9AA3B2; }
        .tpsl-input {
          width: 100%; box-sizing: border-box;
          background: #1B1B1B; border: 1px solid #2a2a2a; border-radius: 10px;
          color: #fff; font-size: 14px; padding: 9px 12px; outline: none;
        }
        .tpsl-input:focus { border-color: rgba(24,194,124,0.5); }
        .order-err { font-size: 12px; color: #F04438; text-align: center; }
        .qty-row { display: flex; align-items: center; gap: 10px; }
        .qty-btn {
          width: 44px; height: 44px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: #1B1B1B; border: none; border-radius: 12px; color: #fff; cursor: pointer;
        }
        .qty-row input {
          flex: 1; text-align: center;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #fff; font-size: 18px; font-weight: 600;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; outline: none; height: 44px;
        }
        .modal-total {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 2px; font-size: 13px; color: #9AA3B2;
        }
        .mt-val { font-size: 15px; font-weight: 600; color: #fff; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .modal-exec {
          height: 46px; border: none; border-radius: 14px;
          color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .modal-exec.buy { background: #18C27C; }
        .modal-exec.sell { background: #F04438; }
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
          font-weight: 600; font-size: 13px; color: #fff;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; min-width: 52px;
        }
        .pick-name { font-size: 12px; color: #9AA3B2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .pick-empty { padding: 14px; text-align: center; color: #666; font-size: 13px; }
      `}</style>
    </div>
  )
}
