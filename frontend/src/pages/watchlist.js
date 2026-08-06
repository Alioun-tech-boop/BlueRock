import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies } from '../services/api'
import { supabase } from '../lib/supabase'
import { Search, Plus, Star, X, Wallet, ChevronDown } from 'lucide-react'
import { detectLang, t, fmtPrice, fmtChange } from '../lib/i18n'

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

const TYPES = [
  { id: 'equity', label: 'wlActions' },
  { id: 'obligation', label: 'wlObligations' },
  { id: 'fcp', label: 'wlFcp' },
]

const COLLAPSE_AT = 5

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
    ? TYPES.map(tp => ({ ...tp, list: (groups[tp.id] || []).filter(match) })).filter(g => g.list.length)
    : []

  return (
    <div className="overlay" onClick={onClose}>
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
              <div className="add-group">{g.label}</div>
              {g.list.map(s => {
                const isFav = favorites.includes(s.symbol)
                return (
                  <div key={s.symbol} className="add-row" onClick={() => onToggle(s.symbol)}>
                    <div className="add-logo" style={{ background: `hsl(${(s.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                      {s.symbol?.[0]}
                    </div>
                    <div className="add-info">
                      <div className="add-name">{s.symbol}</div>
                      <div className="add-sub">{s.name}</div>
                    </div>
                    <button className={`add-btn ${isFav ? 'active' : ''}`} aria-label="ajouter">
                      <Star size={18} fill={isFav ? '#00C087' : 'none'} color={isFav ? '#00C087' : '#8f8f8f'} />
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <style jsx>{`
          .overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
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
          .sheet-title { font-size: 20px; font-weight: 700; color: #fff; }
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
            font-size: 12px; font-weight: 700; letter-spacing: 0.4px;
            text-transform: uppercase; color: #8f8f8f;
            padding: 16px 0 6px;
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
            font-weight: 700; font-size: 16px; color: #fff;
          }
          .add-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
          .add-name {
            font-size: 17px; font-weight: 700; color: #fff;
            text-shadow: 0 0 10px rgba(255,255,255,0.35), 0 0 22px rgba(255,255,255,0.12);
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

export default function Watchlist() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  const [stocks, setStocks] = useState([])
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [expanded, setExpanded] = useState({})
  const mounted = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [e, o, f] = await Promise.all([
        getCompanies({ instrument_type: 'equity', limit: 100 }),
        getCompanies({ instrument_type: 'obligation', limit: 100 }),
        getCompanies({ instrument_type: 'fcp', limit: 100 }),
      ])
      if (!mounted.current) return
      setStocks([...(e.data.companies || []), ...(o.data.companies || []), ...(f.data.companies || [])])
      setError(false)
    } catch {
      if (!silent && mounted.current) setError(true)
    } finally {
      if (!silent && mounted.current) setLoading(false)
    }
  }, [])

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

  // Realtime Supabase : mise à jour des prix à l'insertion de ticks
  useEffect(() => {
    const channel = supabase
      .channel('watchlist-ticks')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'market_data',
      }, payload => {
        const row = payload.new || {}
        const price = row.close_price
        if (price == null) return
        setStocks(prev => prev.map(s =>
          s.id === row.company_id
            ? { ...s, current_price: price, change_percent: row.change_percent ?? s.change_percent }
            : s
        ))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const toggleFavorite = (symbol) => {
    setFavorites(prev => {
      const next = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
      saveJSON(FAV_KEY, next)
      return next
    })
  }

  const favList = stocks
    .filter(s => favorites.includes(s.symbol))
    .sort((a, b) => (a.symbol || '').localeCompare(b.symbol || ''))

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="top-bar">
          <button className="dots-btn" onClick={() => router.back()} aria-label="menu">
            <span /><span /><span />
          </button>
          <div className="logo">BlueRock</div>
          <button className="top-wallet" onClick={() => router.push('/portfolio')} aria-label={t(lang, 'portfolio')}>
            <Wallet size={17} strokeWidth={2.2} />
            <span>{t(lang, 'portfolio')}</span>
          </button>
        </header>

        <div className="second-bar">
          <button className="burger" onClick={() => router.back()} aria-label="retour">
            <span /><span /><span />
          </button>
          <div className="sep" />
          <button className="main-btn" onClick={() => router.push('/watchlist')}>
            {t(lang, 'wlListBtn')}
          </button>
          <button className="add-btn" onClick={() => setAddOpen(true)}>
            <Plus size={18} strokeWidth={2} />
            <span>{t(lang, 'wlAdd')}</span>
          </button>
        </div>

        {error && (
          <div className="error-bar">
            <span>{t(lang, 'loadError')}</span>
            <button onClick={() => fetchData()}>{t(lang, 'tryAgain')}</button>
          </div>
        )}

        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : favList.length === 0 ? (
          <div className="empty-box">
            <Star size={26} />
            <span>{t(lang, 'emptyWatchlist')}</span>
            <span className="empty-sub">{t(lang, 'emptyWatchlistSub')}</span>
          </div>
        ) : (
          <div className="stock-list">
            {TYPES.map(tp => {
              const group = favList.filter(s => s.instrument_type === tp.id)
              if (!group.length) return null
              const isOpen = !!expanded[tp.id]
              const visible = isOpen ? group : group.slice(0, COLLAPSE_AT)
              const hidden = group.length - visible.length
              return (
                <div key={tp.id} className="list-section">
                  <div className="list-group">
                    <span>{t(lang, tp.label)}</span>
                    <span className="list-count">{group.length}</span>
                  </div>
                  {visible.map(s => {
                    const chg = s.change_percent ?? null
                    const up = chg > 0
                    const down = chg < 0
                    const isFav = favorites.includes(s.symbol)
                    const hasPrice = s.current_price != null
                    return (
                      <div
                        key={s.symbol}
                        className="stock-row"
                        onClick={() => router.push(`/company?id=${s.id}`)}
                      >
                        <div className="row-logo" style={{ background: `hsl(${(s.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                          {s.symbol?.[0]}
                        </div>
                        <div className="row-info">
                          <div className="row-title-line">
                            <span className="row-symbol">{s.symbol}</span>
                          </div>
                          <div className="row-sub">{s.name}</div>
                        </div>
                        <div className="row-right">
                          <div className="row-price">{fmtPrice(lang, s.current_price, 0)}</div>
                          <div className={`row-chg ${!hasPrice ? 'flat' : up ? 'up' : down ? 'down' : 'flat'}`}>
                            <span className="chg-val">{hasPrice ? fmtPrice(lang, (s.current_price || 0) * (chg || 0) / 100, 0) : '—'}</span>
                            <span className="chg-pct">{fmtChange(lang, chg)}</span>
                          </div>
                        </div>
                        <button
                          className={`row-star ${isFav ? 'active' : ''}`}
                          onClick={e => { e.stopPropagation(); toggleFavorite(s.symbol) }}
                          aria-label="favori"
                        >
                          <Star size={14} fill={isFav ? '#00C087' : 'none'} color={isFav ? '#00C087' : '#5a5a5a'} />
                        </button>
                      </div>
                    )
                  })}
                  {hidden > 0 && (
                    <button className="section-toggle" onClick={() => setExpanded(prev => ({ ...prev, [tp.id]: !isOpen }))}>
                      {isOpen
                        ? <>{t(lang, 'wlSeeLess')} <ChevronDown size={15} className="chev up" /></>
                        : <>{t(lang, 'wlSeeMore')} · {hidden} <ChevronDown size={15} className="chev" /></>}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding-bottom: 110px; }
        .safe-area::-webkit-scrollbar { display: none; }

        .top-bar {
          height: 54px; padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .dots-btn {
          display: flex; align-items: center; gap: 8px;
          background: none; border: none; cursor: pointer; padding: 8px;
        }
        .dots-btn span {
          width: 7px; height: 7px; border-radius: 50%;
          background: #F2F2F2;
        }
        .logo {
          font-size: 19px; font-weight: 800; letter-spacing: -0.4px;
          color: #fff;
        }
        .top-wallet {
          height: 34px; padding: 0 14px; border: none;
          background: #2E2E2E; border-radius: 17px;
          color: #fff; cursor: pointer;
          display: flex; align-items: center; gap: 7px;
          font-family: inherit; font-size: 13px; font-weight: 600;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .top-wallet:active { opacity: 0.9; transform: scale(0.98); }

        .second-bar {
          height: 70px; padding: 0 22px;
          display: flex; align-items: center; gap: 16px;
          flex-shrink: 0;
        }
        .burger {
          display: flex; flex-direction: column; gap: 5px;
          background: none; border: none; cursor: pointer; padding: 4px;
        }
        .burger span {
          width: 34px; height: 3px; border-radius: 2px;
          background: #fff;
        }
        .sep {
          width: 1px; height: 36px; background: #262626;
        }
        .main-btn {
          flex: 1; height: 58px; min-width: 0;
          background: #2E2E2E; border: none; border-radius: 18px;
          color: #fff; font-size: 20px; font-weight: 600;
          padding: 16px 34px;
          cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .main-btn:active { opacity: 0.9; transform: scale(0.98); }
        .add-btn {
          height: 58px; padding: 0 28px;
          background: #2E2E2E; border: none; border-radius: 18px;
          color: #F7F7F7; font-size: 16px; font-weight: 600;
          display: flex; align-items: center; gap: 8px;
          cursor: pointer; font-family: inherit; flex-shrink: 0;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .add-btn:active { opacity: 0.9; transform: scale(0.98); }

        .search-bar {
          display: flex; align-items: center; gap: 8px;
          background: #1A1A1A; border-radius: 14px;
          padding: 0 14px; height: 46px; margin: 6px 22px 12px;
        }
        .sb-icon { color: #8f8f8f; flex-shrink: 0; }
        .search-bar input {
          flex: 1; background: none; border: none; outline: none;
          color: #fff; font-size: 14px; font-family: inherit;
        }
        .search-bar input::placeholder { color: #5a5a5a; }
        .icon-btn.mini {
          width: 28px; height: 28px; background: none; border: none;
          color: #8f8f8f; cursor: pointer; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }

        .filters-row {
          display: flex; gap: 8px; overflow-x: auto;
          padding: 0 22px 16px; scrollbar-width: none;
        }
        .filters-row::-webkit-scrollbar { display: none; }
        .filter-chip {
          flex-shrink: 0; height: 34px; padding: 0 16px;
          border-radius: 17px; border: none;
          background: #1A1A1A; color: #8b8b8b;
          font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit;
          transition: background 160ms ease-out, color 160ms ease-out;
        }
        .filter-chip.active { background: #2E2E2E; color: #fff; font-weight: 600; }

        .error-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          border-radius: 12px; padding: 10px 12px; margin: 0 22px 14px;
          font-size: 12px; color: #ff9d9d;
        }
        .error-bar button {
          background: rgba(255,77,79,0.2); border: none; border-radius: 8px;
          color: #ff9d9d; font-size: 11px; padding: 5px 10px; cursor: pointer; font-family: inherit;
        }
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

        .stock-list { padding: 0 0 8px; }
        .list-section { padding-bottom: 6px; }
        .list-group {
          display: flex; align-items: center; gap: 10px;
          font-size: 13px; font-weight: 800; letter-spacing: 0.6px;
          text-transform: uppercase; color: #b9b9b9;
          padding: 20px 22px 10px;
          text-shadow: 0 0 10px rgba(255,255,255,0.25);
        }
        .list-count {
          min-width: 24px; height: 24px; padding: 0 8px;
          display: flex; align-items: center; justify-content: center;
          background: #1E1E1E; border-radius: 12px;
          font-size: 12px; font-weight: 700; color: #00C087;
          text-shadow: 0 0 8px rgba(0,192,135,0.7);
        }
        .section-toggle {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin: 10px 22px 4px;
          width: calc(100% - 44px); height: 44px;
          background: #1A1A1A; border: none; border-radius: 14px;
          color: #00C087; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          text-shadow: 0 0 10px rgba(0,192,135,0.5);
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .section-toggle:active { opacity: 0.9; transform: scale(0.98); }
        .section-toggle .chev { transition: transform 160ms ease-out; }
        .section-toggle .chev.up { transform: rotate(180deg); }
        .stock-row {
          position: relative;
          display: flex; align-items: center;
          height: 96px; padding: 0 16px 0 0;
          cursor: pointer;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .stock-row:active { opacity: 0.9; transform: scale(0.98); }
        .row-logo {
          width: 56px; height: 56px; border-radius: 50%;
          margin-left: 18px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 17px; font-weight: 700;
        }
        .row-info {
          flex: 1; min-width: 0;
          margin-left: 16px;
          display: flex; flex-direction: column; gap: 5px;
        }
        .row-title-line { display: flex; align-items: center; gap: 8px; }
        .row-symbol {
          font-size: 20px; font-weight: 700; color: #fff;
          white-space: nowrap;
          text-shadow: 0 0 10px rgba(255,255,255,0.4), 0 0 24px rgba(255,255,255,0.15);
        }
        .row-sub {
          font-size: 13px; font-weight: 400; color: #8B8B8B;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .row-right {
          display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
          padding-right: 16px; flex-shrink: 0;
        }
        .row-price {
          font-size: 19px; font-weight: 700; color: #fff;
          font-family: 'JetBrains Mono', monospace; white-space: nowrap;
          text-shadow: 0 0 12px rgba(255,255,255,0.45), 0 0 26px rgba(255,255,255,0.18);
        }
        .row-chg {
          display: flex; align-items: center; gap: 10px;
          font-size: 13px; font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }
        .row-chg.up {
          color: #00C087;
          text-shadow: 0 0 10px rgba(0,192,135,0.9), 0 0 24px rgba(0,192,135,0.4);
        }
        .row-chg.down {
          color: #F23645;
          text-shadow: 0 0 10px rgba(242,54,69,0.9), 0 0 24px rgba(242,54,69,0.4);
        }
        .row-chg.flat {
          color: #8b8b8b;
          text-shadow: 0 0 8px rgba(139,139,139,0.5);
        }
        .row-star {
          position: absolute; top: 8px; right: 8px;
          width: 26px; height: 26px; border: none; background: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border-radius: 50%;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .row-star:active { opacity: 0.9; transform: scale(0.98); }
      `}</style>
    </div>
  )
}
