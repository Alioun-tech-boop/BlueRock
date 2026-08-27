import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import { getCompanies, getMarketLive } from '../services/api'
import { Search, Plus, Star, X, ChevronDown, ChevronRight, Bell, Menu, Globe2, Coins, Crown, Zap } from 'lucide-react'
import { detectLang, t, fmtPrice, fmtPriceCur, fmtChange } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { getUnreadCount } from '../services/api'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import DataErrorState from '../components/DataErrorState'

const FAV_KEY = 'bluerock_favorites_v1'

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const CATS = [
  { id: 'all', label: 'wlAll' },
  { id: 'equity', label: 'wlActions' },
  { id: 'obligation', label: 'wlObligations' },
  { id: 'fcp', label: 'wlFcp' },
]

const STATUS_LABEL = { equity: 'wlActions', obligation: 'wlObligations', fcp: 'wlFcp' }

const PROMOS = [
  { icon: Globe2, key: 'wlPromo1T', sub: 'wlPromo1S', grad: 'violet' },
  { icon: Coins, key: 'wlPromo2T', sub: 'wlPromo2S', grad: 'green' },
  { icon: Crown, key: 'wlPromo3T', sub: 'wlPromo3S', grad: 'gold' },
  { icon: Zap, key: 'wlPromo4T', sub: 'wlPromo4S', grad: 'blue' },
]

function PromoStrip({ lang }) {
  const router = useRouter()
  const [paused, setPaused] = useState(false)
  const cards = PROMOS.map(c => ({ ...c, Icon: c.icon }))
  const loop = [...cards, ...cards]

  const pause = e => { e.preventDefault(); setPaused(true) }
  const resume = () => setPaused(false)

  return (
    <div className="wl-promo">
      <div className="wl-promo-head">
        <span className="wl-promo-eyebrow"><span className="wl-promo-eyebrow-dot" />{t(lang, 'wlPromoEyebrow')}</span>
        <button className="wl-promo-see" onClick={() => router.push('/premium')}>
          {t(lang, 'wlPromoSee')} <ChevronRight size={14} strokeWidth={2.4} />
        </button>
      </div>
      <div className="wl-promo-haze">
        <div
          className={`wl-promo-track ${paused ? 'paused' : ''}`}
          onPointerDown={pause}
          onPointerUp={resume}
          onPointerLeave={resume}
          onPointerCancel={resume}
        >
          {loop.map((c, i) => {
            const Icon = c.Icon
            return (
              <div
                key={`${c.key}-${i}`}
                className={`wl-promo-card ${c.grad}`}
                role="button"
                tabIndex={0}
                onClick={() => router.push('/premium')}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push('/premium') }}
              >
                <span className="wl-promo-tag">PRO</span>
                <span className="wl-promo-ico"><Icon size={20} strokeWidth={2.1} /></span>
                <strong className="wl-promo-title">{t(lang, c.key)}</strong>
                <span className="wl-promo-sub">{t(lang, c.sub)}</span>
                <span className="wl-promo-cta">{t(lang, 'wlPromoCta')} <ChevronRight size={15} strokeWidth={2.6} /></span>
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .wl-promo { margin-top: 4px; flex-shrink: 0; position: relative; }
        .wl-promo-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 22px 10px;
        }
        .wl-promo-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 10.5px; font-weight: 800; letter-spacing: 1.6px; color: #FFD77A;
        }
        .wl-promo-eyebrow-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: linear-gradient(135deg, #FFD77A, #f5c04c);
          box-shadow: 0 0 10px rgba(255,215,122,0.75);
        }
        .wl-promo-see {
          display: inline-flex; align-items: center; gap: 3px;
          background: none; border: none; color: #8b8b8b;
          font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
          transition: color 150ms ease;
        }
        .wl-promo-see:hover { color: #FFD77A; }
        .wl-promo-haze {
          overflow: hidden;
          mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 34px), transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 34px), transparent 100%);
        }
        .wl-promo-track {
          display: flex; width: max-content;
          animation: wl-marquee 26s linear infinite;
          will-change: transform;
          cursor: pointer;
        }
        .wl-promo-track.paused { animation-play-state: paused; }
        @keyframes wl-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .wl-promo-track { animation: none; }
        }
        .wl-promo-card {
          position: relative; flex: 0 0 310px; height: 152px;
          margin-right: 12px; border-radius: 22px; padding: 16px 18px;
          border: 1px solid rgba(255,255,255,0.12);
          display: flex; flex-direction: column; justify-content: space-between;
          overflow: hidden; user-select: none; outline: none;
          transition: transform 160ms ease-out, border-color 200ms ease;
        }
        .wl-promo-card:hover, .wl-promo-card:focus-visible {
          transform: translateY(-2px);
          border-color: rgba(255,215,122,0.35);
        }
        .wl-promo-card::before {
          content: ''; position: absolute; top: -46px; right: -34px;
          width: 170px; height: 170px; border-radius: 50%;
          background: radial-gradient(closest-side, rgba(255,255,255,0.18), transparent);
          pointer-events: none;
        }
        .wl-promo-card::after {
          content: ''; position: absolute; left: -42px; bottom: -64px;
          width: 160px; height: 160px; border-radius: 50%;
          background: radial-gradient(closest-side, rgba(255,255,255,0.08), transparent);
          pointer-events: none;
        }
        .wl-promo-card.violet { background: linear-gradient(135deg, #1d1042 0%, #381b75 58%, #6d28d9 135%); }
        .wl-promo-card.green  { background: linear-gradient(135deg, #03251c 0%, #0a4a38 58%, #117a58 140%); }
        .wl-promo-card.gold   { background: linear-gradient(135deg, #2b2107 0%, #4a3a10 58%, #6e5517 140%); }
        .wl-promo-card.blue   { background: linear-gradient(135deg, #071a3a 0%, #113d7e 58%, #1f56c4 140%); }
        .wl-promo-tag {
          position: absolute; top: 14px; right: 14px; z-index: 1;
          padding: 4px 9px; border-radius: 999px;
          background: rgba(255,215,122,0.16); color: #FFD77A;
          font-size: 9px; font-weight: 800; letter-spacing: 1.3px;
        }
        .wl-promo-ico {
          width: 38px; height: 38px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.10); color: #fff;
          border: 1px solid rgba(255,255,255,0.16);
        }
        .wl-promo-title {
          font-size: 15.5px; font-weight: 750; letter-spacing: -0.01em;
          line-height: 1.2; padding-right: 40px;
        }
        .wl-promo-sub {
          font-size: 11.5px; color: rgba(255,255,255,0.64);
          line-height: 1.4; max-width: 230px;
        }
        .wl-promo-cta {
          display: inline-flex; align-items: center; gap: 4px;
          color: #FFD77A; font-size: 12px; font-weight: 700; width: fit-content;
        }
        @media (min-width: 768px) {
          .wl-promo-head { padding-left: 28px; padding-right: 28px; }
        }
      `}</style>
    </div>
  )
}

function AddSheet({ lang, favorites, onToggle, onClose }) {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getCompanies({ instrument_type: 'equity', limit: 100 }),
      getCompanies({ instrument_type: 'obligation', limit: 100 }),
      getCompanies({ instrument_type: 'fcp', limit: 100 }),
    ])
      .then(([e, o, f]) => setGroups({
        equity: e.data.companies || [],
        obligation: o.data.companies || [],
        fcp: f.data.companies || [],
      }))
      .catch(() => setGroups({ equity: [], obligation: [], fcp: [] }))
      .finally(() => setLoading(false))
  }, [])

  const q = query.trim().toLowerCase()
  const match = s => !q || (s.symbol || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q)
  const groupsList = groups
    ? CATS.slice(1).map(tp => {
        const byEx = {}
        ;(groups[tp.id] || []).filter(match).forEach(s => {
          const ex = s.exchange || 'BRVM'
          ;(byEx[ex] = byEx[ex] || []).push(s)
        })
        return { ...tp, exchanges: Object.entries(byEx) }
      }).filter(g => g.exchanges.length)
    : []

  return (
    <div
      className="overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: '#0b0b0b', zIndex: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-title">{t(lang, 'wlAdd')}</span>
          <button className="sheet-close" onClick={onClose} aria-label={t(lang, 'close')}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-search">
          <Search size={18} className="ss-icon" />
          <input
            autoFocus
            placeholder={t(lang, 'wlAddHint')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="sheet-list">
          {loading && <div className="sheet-empty">{t(lang, 'loading')}</div>}
          {!loading && groupsList.length === 0 && <div className="sheet-empty">{t(lang, 'noResults')}</div>}
          {groupsList.map(g => (
            <div key={g.id}>
              <div className="add-group">{t(lang, g.label)}</div>
              {g.exchanges.map(([ex, list]) => (
                <div key={ex}>
                  <div className="add-ex">{ex}</div>
                  {list.map(s => {
                    const isFav = favorites.includes(s.symbol)
                    return (
                      <div key={s.symbol} className="add-row" onClick={() => onToggle(s.symbol)}>
                        <div className="add-logo" style={{ background: `hsl(${(s.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                          {s.logo_url ? (
                            <img
                              crossOrigin="anonymous" src={s.logo_url} alt={s.symbol}
                              onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)}
                              onError={onLogoError}
                            />
                          ) : s.symbol?.[0]}
                        </div>
                        <div className="add-info">
                          <div className="add-name">{s.symbol}</div>
                          <div className="add-sub">{s.name}</div>
                        </div>
                        <button className={`add-btn ${isFav ? 'active' : ''}`} aria-label={t(lang, 'wlAdd')}>
                          <Star size={18} fill={isFav ? '#00C087' : 'none'} color={isFav ? '#00C087' : '#8f8f8f'} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
        <style jsx>{`
          .overlay {
            position: fixed; inset: 0; background: #0b0b0b;
            z-index: 90; display: flex; align-items: flex-end; justify-content: center;
          }
          .sheet {
            width: 100%; max-width: 480px; max-height: 78vh;
            background: #111111; border-radius: 20px 20px 0 0;
            display: flex; flex-direction: column; animation: sheetUp 0.18s ease-out;
          }
          @keyframes sheetUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .sheet-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 22px 0;
          }
          .sheet-title { font-size: 20px; font-weight: 600; color: #fff; }
          .sheet-close {
            background: #2E2E2E; border: none; border-radius: 50%;
            width: 34px; height: 34px; color: #fff;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            transition: opacity 160ms ease-out, transform 160ms ease-out;
          }
          .sheet-close:active { opacity: 0.9; transform: scale(0.98); }
          .sheet-search {
            display: flex; align-items: center; gap: 10px;
            background: #1A1A1A; border-radius: 14px;
            padding: 0 16px; height: 48px; margin: 16px 22px 8px;
          }
          .ss-icon { color: #8f8f8f; flex-shrink: 0; }
          .sheet-search input {
            flex: 1; background: none; border: none; outline: none;
            color: #fff; font-size: 15px; font-family: inherit;
          }
          .sheet-search input::placeholder { color: #5a5a5a; }
          .sheet-list { flex: 1; overflow-y: auto; padding: 0 22px 20px; }
          .sheet-list::-webkit-scrollbar { display: none; }
          .sheet-empty { padding: 30px 0; text-align: center; color: #666; font-size: 13px; }
          .add-group {
            font-size: 12px; font-weight: 600; letter-spacing: 0.15px;
            text-transform: uppercase; color: #8f8f8f;
            padding: 16px 0 6px;
          }
          .add-ex {
            display: flex; align-items: center; gap: 6px;
            font-size: 11px; font-weight: 600; letter-spacing: 0;
            text-transform: uppercase; color: #18C27C;
            padding: 8px 0 0;
          }
          .add-ex::before {
            content: ''; width: 6px; height: 6px; border-radius: 50%;
            background: #18C27C; flex-shrink: 0;
          }
          .add-row {
            position: relative;
            display: flex; align-items: center; gap: 14px;
            padding: 14px 0;
            cursor: pointer;
          }
          .add-row::after {
            content: '';
            position: absolute; left: 62px; right: 0; bottom: 0;
            height: 1px; background: #202020;
          }
        .add-logo {
          width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-weight: 600; font-size: 16px; color: #fff;
          overflow: hidden;
        }
        .add-logo img { width: 100%; height: 100%; object-fit: contain; padding: 7px; box-sizing: border-box; }
          .add-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
          .add-name {
            font-size: 17px; font-weight: 600; color: #fff; letter-spacing: -0.01em;
          }
          .add-sub { font-size: 13px; color: #8b8b8b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .add-btn {
            width: 40px; height: 40px; border: none; background: none;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; border-radius: 50%;
            transition: opacity 160ms ease-out, transform 160ms ease-out;
          }
          .add-btn:active { opacity: 0.9; transform: scale(0.98); }
        `}</style>
      </div>
    </div>
  )
}

function SelectBox({ label, value, options, open, onToggle, onSelect }) {
  return (
    <div className={`select-box ${open ? 'open' : ''}`}>
      <span className="select-label">{label}</span>
      <div className="select-value" onClick={onToggle}>
        <span>{value}</span>
        <ChevronDown size={15} className={`chev ${open ? 'up' : ''}`} />
      </div>
      {open && (
        <div className="select-menu">
          {options.map(o => (
            <button
              key={o.id}
              className={`select-opt ${o.active ? 'active' : ''}`}
              onClick={() => onSelect(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <style jsx>{`
        .select-box { position: relative; display: flex; flex-direction: column; gap: 2px; }
        .select-label {
          font-size: 11px; font-weight: 500; letter-spacing: 0.1px;
          text-transform: uppercase; color: #7a7a7a;
        }
        .select-value {
          display: flex; align-items: center; gap: 8px;
          min-height: 26px; cursor: pointer; user-select: none;
        }
        .select-value span {
          font-size: 14px; font-weight: 600; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 150px;
        }
        .select-value .chev { color: #8f8f8f; flex-shrink: 0; transition: transform 160ms ease-out; }
        .select-value .chev.up { transform: rotate(180deg); }
        .select-menu {
          position: absolute; top: calc(100% + 10px); left: 0;
          min-width: 180px; max-width: 280px; max-height: 260px; overflow-y: auto;
          background: #1C1C1C; border: 1px solid #2A2A2A; border-radius: 14px;
          padding: 6px; z-index: 60;
          box-shadow: 0 12px 40px rgba(0,0,0,0.7);
          animation: menuIn 0.14s ease-out;
        }
        @keyframes menuIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .select-opt {
          display: block; width: 100%; text-align: left;
          padding: 9px 12px; border: none; border-radius: 10px;
          background: none; color: #cfcfcf;
          font-family: inherit; font-size: 13.5px; font-weight: 500;
          cursor: pointer;
          transition: background 140ms ease-out, color 140ms ease-out;
        }
        .select-opt.active { background: rgba(0,192,135,0.14); color: #00C087; font-weight: 600; }
        .select-opt:hover { background: #262626; }
      `}</style>
    </div>
  )
}

export default function Watchlist() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  const [stocks, setStocks] = useState([])
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [cat, setCat] = useState('all')
  const [sector, setSector] = useState('')
  const [country, setCountry] = useState('')
  const [exchange, setExchange] = useState('')
  const [openSel, setOpenSel] = useState(null)
  const [unread, setUnread] = useState(0)
  const filterRef = useRef(null)
  const mounted = useRef(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    let alive = true
    const poll = () => getUnreadCount()
      .then(n => { if (alive) setUnread(n) })
      .catch(() => {})
    poll()
    const id = setInterval(poll, 120000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [user])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [e, o, f] = await Promise.all([
        getCompanies({ instrument_type: 'equity', limit: 300 }),
        getCompanies({ instrument_type: 'obligation', limit: 100 }),
        getCompanies({ instrument_type: 'fcp', limit: 100 }),
      ])
      if (!mounted.current) return
      const isPro = user?.tier === 'pro'
      const all = [...(e.data.companies || []), ...(o.data.companies || []), ...(f.data.companies || [])]
      // Offre Basic = BRVM seule ; NGX est réservé à l'offre Pro.
      setStocks(isPro ? all : all.filter(s => (s.exchange || 'BRVM') !== 'NGX'))
      setError(false)
      const favRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(FAV_KEY) : null
      const hasFav = favRaw !== null && JSON.parse(favRaw || '[]').length > 0
      if (!hasFav) {
        // 20 actions par défaut, visibles par tous les nouveaux utilisateurs.
        // Basic = BRVM uniquement (NGX réservé Pro) pour éviter une watchlist vide
        // quand les top market_cap sont NGX mais filtrés côté affichage.
        const pool = [...(e.data.companies || [])].filter(
          (s) => s.instrument_type === 'equity' && (isPro || (s.exchange || 'BRVM') !== 'NGX')
        )
        const top = pool
          .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
          .slice(0, 20)
          .map((s) => s.symbol)
        // Fallback : si pool < 20 (ex: BRVM seule 47 mais tri vide), compléter par BRVM
        if (top.length < 20) {
          const extra = [...(e.data.companies || [])]
            .filter((s) => s.instrument_type === 'equity' && !top.includes(s.symbol))
            .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
            .slice(0, 20 - top.length)
            .map((s) => s.symbol)
          top.push(...extra)
        }
        if (top.length) {
          setFavorites(top)
          saveJSON(FAV_KEY, top)
        }
      } else {
        // Migration : anciens utilisateurs avec 15 favoris NGX invisibles (Basic) ou 15 seulement → étendre à 20 BRVM
        try {
          const cur = JSON.parse(favRaw || '[]')
          if (cur.length > 0 && cur.length < 20) {
            const pool = [...(e.data.companies || [])].filter(
              (s) => s.instrument_type === 'equity' && (isPro || (s.exchange || 'BRVM') !== 'NGX')
            )
            const sortedPool = pool.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0)).map(s => s.symbol)
            const merged = [...cur]
            for (const sym of sortedPool) {
              if (merged.length >= 20) break
              if (!merged.includes(sym)) merged.push(sym)
            }
            if (merged.length > cur.length) {
              setFavorites(merged)
              saveJSON(FAV_KEY, merged)
            }
          }
        } catch {}
      }
    } catch {
      if (!silent && mounted.current) setError(true)
    } finally {
      if (!silent && mounted.current) setLoading(false)
    }
  }, [user?.tier])

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    setFavorites(loadJSON(FAV_KEY, []))
    fetchData()
    const interval = setInterval(() => fetchData(true), 60000)
    return () => {
      mounted.current = false
      clearInterval(interval)
    }
  }, [fetchData])

  useEffect(() => {
    const onClick = e => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setOpenSel(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Prix temps réel via /api/market/live (flux BRVM 30 s en séance)
  // et /api/market/ngx (flux NGX ~20 min en séance).
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const calls = [getMarketLive()]
        if (user?.tier === 'pro') calls.push(getMarketNGX())
        const [b, n] = await Promise.allSettled(calls)
        if (!alive) return
        const prices = {}
        const sourceOf = {}
        if (b.status === 'fulfilled') {
          Object.assign(prices, (b.value.data && b.value.data.prices) || {})
          Object.keys((b.value.data && b.value.data.prices) || {}).forEach(s => { sourceOf[s] = 'BRVM_LIVE' })
        }
        if (n && n.status === 'fulfilled') {
          Object.assign(prices, (n.value.data && n.value.data.prices) || {})
          Object.keys((n.value.data && n.value.data.prices) || {}).forEach(s => { sourceOf[s] = 'NGX_LIVE' })
        }
        setStocks(prev => {
          let changed = false
          const next = prev.map(s => {
            const p = prices[s.symbol]
            if (!p || p.price == null || s.current_price === p.price) return s
            changed = true
            return { ...s, current_price: p.price, change_percent: p.change ?? s.change_percent, price_source: sourceOf[s.symbol] || s.price_source }
          })
          return changed ? next : prev
        })
      } catch { /* réseau : le poll suivant réessaiera */ }
    }
    tick()
    const id = setInterval(tick, 15000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const toggleFavorite = (symbol) => {
    setFavorites(prev => {
      const next = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
      saveJSON(FAV_KEY, next)
      return next
    })
  }

  const sectors = [...new Set(stocks.map(s => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const countries = [...new Set(stocks.map(s => s.country).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const exchanges = [...new Set(stocks.map(s => s.exchange || 'BRVM').filter(Boolean))].sort((a, b) => a.localeCompare(b))

  const favList = stocks
    .filter(s => favorites.includes(s.symbol))
    .filter(s => cat === 'all' || s.instrument_type === cat)
    .filter(s => !sector || s.sector === sector)
    .filter(s => !country || s.country === country)
    .filter(s => !exchange || (s.exchange || 'BRVM') === exchange)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const selectValue = sel => sel === 'sector'
    ? (sector ? sector : t(lang, 'wlAllSectors'))
    : sel === 'country'
    ? (country ? country : t(lang, 'wlAllCountries'))
    : (exchange ? exchange : t(lang, 'wlAllExchanges'))

  return (
    <div className="wl-root">
      <div className="wl-frame">
        <header className="wl-header">
          <h1 className="wl-title">{t(lang, 'wlTitle')}</h1>
          <div className="wl-actions">
            <button className="wl-menu" onClick={() => router.push('/menu')} aria-label={t(lang, 'menu')}>
              <Menu size={19} strokeWidth={2.2} />
            </button>
            <button className="wl-bell" onClick={() => router.push('/notifications')} aria-label={t(lang, 'notifications')}>
              <Bell size={19} strokeWidth={2.2} />
              {unread > 0 && <span className="wl-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <button className="wl-search" onClick={() => setAddOpen(true)} aria-label={t(lang, 'wlSearchPlaceholder')}>
              <Search size={20} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <nav className="wl-cats">
          <button className="wl-cat-dot" onClick={() => setAddOpen(true)} aria-label={t(lang, 'wlAdd')}>
            <Plus size={20} strokeWidth={2.4} />
          </button>
          {CATS.map(c => (
            <button
              key={c.id}
              className={`wl-cat ${cat === c.id ? 'active' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {t(lang, c.label)}
            </button>
          ))}
        </nav>

        <div className="wl-filters" ref={filterRef}>
          <SelectBox
            label={t(lang, 'wlSector')}
            value={selectValue('sector')}
            open={openSel === 'sector'}
            onToggle={() => setOpenSel(openSel === 'sector' ? null : 'sector')}
            onSelect={id => { setSector(id); setOpenSel(null) }}
            options={[
              { id: '', label: t(lang, 'wlAllSectors'), active: sector === '' },
              ...sectors.map(s => ({ id: s, label: s, active: sector === s })),
            ]}
          />
          <SelectBox
            label={t(lang, 'wlCountry')}
            value={selectValue('country')}
            open={openSel === 'country'}
            onToggle={() => setOpenSel(openSel === 'country' ? null : 'country')}
            onSelect={id => { setCountry(id); setOpenSel(null) }}
            options={[
              { id: '', label: t(lang, 'wlAllCountries'), active: country === '' },
              ...countries.map(c => ({ id: c, label: c, active: country === c })),
            ]}
          />
          <SelectBox
            label={t(lang, 'wlExchange')}
            value={selectValue('exchange')}
            open={openSel === 'exchange'}
            onToggle={() => setOpenSel(openSel === 'exchange' ? null : 'exchange')}
            onSelect={id => { setExchange(id); setOpenSel(null) }}
            options={[
              { id: '', label: t(lang, 'wlAllExchanges'), active: exchange === '' },
              ...exchanges.map(e => ({ id: e, label: e, active: exchange === e })),
            ]}
          />
        </div>

        {error && (
          <DataErrorState lang={lang} size={140} message={t(lang, 'loadError')} retry={() => fetchData()} />
        )}

        <main className="wl-list">
          {user?.tier !== 'pro' && <PromoStrip lang={lang} />}

          {loading ? (
            <div className="loading-row"><TriLoader compact /></div>
          ) : favorites.length === 0 ? (
            <div className="empty-box">
              <Star size={26} />
              <span>{t(lang, 'emptyWatchlist')}</span>
              <span className="empty-sub">{t(lang, 'emptyWatchlistSub')}</span>
            </div>
          ) : favList.length === 0 ? (
            <div className="empty-box">
              <span>{t(lang, 'noResults')}</span>
            </div>
          ) : (
            favList.map(s => {
              const chg = s.change_percent ?? null
              const up = chg > 0
              const down = chg < 0
              const hasPrice = s.current_price != null
              return (
                <div
                  key={s.symbol}
                  className="wl-row"
                  onClick={() => router.push(`/company?id=${s.id}`)}
                >
                  <div className="wl-logo" style={{ background: `hsl(${(s.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                    {s.logo_url ? (
                      <img
                        crossOrigin="anonymous" src={s.logo_url} alt={s.symbol}
                        onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)}
                        onError={onLogoError}
                      />
                    ) : s.symbol?.[0]}
                  </div>
                  <div className="wl-info">
                    <div className="wl-name">
                      <span className="wl-name-txt">{s.name}</span>
                      <span className={`ex-badge ${s.exchange === 'NGX' ? 'ngx' : 'brvm'}`}>{s.exchange || 'BRVM'}</span>
                    </div>
                    <div className="wl-status">{t(lang, STATUS_LABEL[s.instrument_type] || 'wlActions')}</div>
                  </div>
                  <div className="wl-nums">
                    <div className="wl-price">{fmtPriceCur(lang, s.current_price, s.currency, 0)}</div>
                    <div className={`wl-chg ${!hasPrice ? 'flat' : up ? 'up' : down ? 'down' : 'flat'}`}>
                      {fmtChange(lang, chg)}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </main>
      </div>

      {addOpen && (
        <AddSheet
          lang={lang}
          favorites={favorites}
          onToggle={toggleFavorite}
          onClose={() => setAddOpen(false)}
        />
      )}

      <BottomNav active="watchlist" />

      <style jsx>{`
        .wl-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif;
          overflow: hidden;
        }
        .wl-frame {
          flex: 1; min-height: 0;
          display: flex; flex-direction: column; width: 100%;
        }
        .wl-header {
          height: 64px; padding: 0 22px;
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
          border-bottom: 1px solid #161616;
        }
        .wl-title {
          margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em;
          line-height: 1.1; color: #fff;
        }
        .wl-actions { display: flex; align-items: center; gap: 10px; }
        .wl-menu {
          width: 42px; height: 42px; border: none; border-radius: 50%;
          background: #2E2E2E; color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .wl-menu:active { opacity: 0.9; transform: scale(0.98); }
        .wl-search {
          width: 42px; height: 42px; border: none; border-radius: 50%;
          background: #2E2E2E; color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .wl-search:active { opacity: 0.9; transform: scale(0.98); }
        .wl-bell {
          position: relative;
          width: 42px; height: 42px; border: none; border-radius: 50%;
          background: #2E2E2E; color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .wl-bell:active { opacity: 0.9; transform: scale(0.98); }
        .wl-badge {
          position: absolute; top: -3px; right: -3px;
          min-width: 17px; height: 17px; padding: 0 4px;
          background: #F23645; border-radius: 9px;
          font-size: 10px; font-weight: 600; color: #fff;
          display: flex; align-items: center; justify-content: center;
        }

        .wl-cats {
          display: flex; align-items: center; gap: 10px;
          overflow-x: auto; padding: 14px 22px 12px;
          scrollbar-width: none; flex-shrink: 0;
        }
        .wl-cats::-webkit-scrollbar { display: none; }
        .wl-cat-dot {
          width: 40px; height: 40px; border-radius: 50%;
          background: #2E2E2E; color: #fff; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .wl-cat-dot:active { opacity: 0.9; transform: scale(0.98); }
        .wl-cat {
          height: 40px; padding: 0 20px; border: none; border-radius: 20px;
          background: #1A1A1A; color: #8b8b8b;
          font-family: inherit; font-size: 13.5px; font-weight: 500;
          white-space: nowrap; cursor: pointer; flex-shrink: 0;
          transition: background 160ms ease-out, color 160ms ease-out, transform 160ms ease-out;
        }
        .wl-cat:active { transform: scale(0.98); }
        .wl-cat.active {
          background: #00C087; color: #00150E; font-weight: 600;
        }

        .wl-filters {
          position: relative; z-index: 5;
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 10px 28px;
          margin: 4px 22px 0; padding: 10px 18px;
          background: #141414; border-radius: 18px;
          flex-shrink: 0;
        }
        :global(.wl-filters .select-box:last-of-type .select-menu) {
          left: auto; right: 0;
        }

        .error-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          border-radius: 12px; padding: 10px 12px; margin: 12px 22px 0;
          font-size: 12px; color: #ff9d9d; flex-shrink: 0;
        }
        .error-bar button {
          background: rgba(255,77,79,0.2); border: none; border-radius: 8px;
          color: #ff9d9d; font-size: 11px; padding: 5px 10px; cursor: pointer; font-family: inherit;
        }

        .wl-list {
          flex: 1; min-height: 0; overflow-y: auto;
          margin-top: 20px; padding-bottom: 88px;
          scrollbar-width: none;
        }
        .wl-list::-webkit-scrollbar { display: none; }
        .loading-row { display: flex; justify-content: center; padding: 40px; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #262626; border-top-color: #00C087;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-box {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 44px 20px; text-align: center;
          color: #a3a3a3; font-size: 14px;
        }
        .empty-sub { font-size: 12px; color: #666; }

        .wl-row {
          position: relative;
          display: flex; align-items: center;
          height: 88px; padding: 0 22px;
          cursor: pointer;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .wl-row:active { opacity: 0.9; transform: scale(0.98); }
        .wl-row::after {
          content: '';
          position: absolute; left: 88px; right: 0; bottom: 0;
          height: 1px; background: #1E1E1E;
        }
        .wl-logo {
          width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 17px; font-weight: 600;
          overflow: hidden;
        }
        .wl-logo img { width: 100%; height: 100%; object-fit: contain; padding: 8px; box-sizing: border-box; }
        .wl-info {
          flex: 1; min-width: 0; margin-left: 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .wl-name {
          display: flex; align-items: center; gap: 6px;
          width: 100%; min-width: 0;
        }
        .wl-name-txt {
          font-size: 16px; font-weight: 600; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          min-width: 0;
        }
        .ex-badge {
          font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px;
          margin-left: 6px; vertical-align: middle; letter-spacing: 0.3px;
          flex: none;
        }
        .ex-badge.brvm { color: #34d399; background: rgba(52,211,153,0.15); }
        .ex-badge.ngx { color: #8b5cf6; background: rgba(139,92,246,0.15); }
        .wl-status {
          font-size: 12px; font-weight: 400; color: #8B8B8B;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .wl-nums {
          display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
          margin-left: 12px; flex-shrink: 0;
        }
        .wl-price {
          font-size: 16.5px; font-weight: 600; color: #fff;
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .wl-chg {
          font-size: 12.5px; font-weight: 600;
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .wl-chg.up { color: #00C087; }
        .wl-chg.down { color: #F23645; }
        .wl-chg.flat { color: #8b8b8b; }

        @media (min-width: 768px) {
          .wl-root { background: #0D0D0D; }
          .wl-frame {
            width: min(760px, 100%);
            margin: 0 auto;
            background: #000;
            box-shadow: 0 0 0 1px #171717, 0 24px 90px rgba(0,0,0,0.75);
          }
          .wl-header { padding: 0 28px; }
          .wl-cats { padding-left: 28px; padding-right: 28px; }
          .wl-filters { margin-left: 28px; margin-right: 28px; }
          .wl-row { padding: 0 28px; }
          .wl-row::after { left: 96px; }
        }
      `}</style>
    </div>
  )
}
