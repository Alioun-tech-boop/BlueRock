import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies } from '../services/api'
import { supabase } from '../lib/supabase'
import { Search, Plus, Star, ChevronLeft, X, Wallet } from 'lucide-react'
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

const SECTOR_FILTERS = [
  { id: 'all', label: 'wlAll', match: null },
  { id: 'banks', label: 'wlBanks', match: ['Banque', 'Services Financiers'] },
  { id: 'telecom', label: 'wlTelecom', match: ['Télécommunications'] },
  { id: 'industry', label: 'wlIndustry', match: ['Industriels', 'Matériaux'] },
  { id: 'transport', label: 'wlTransport', match: ['Transport'] },
  { id: 'insurance', label: 'wlInsurance', match: ['Assurance'] },
  { id: 'agro', label: 'wlAgro', match: ['Agroalimentaire', 'Consommation de Base'] },
  { id: 'energy', label: 'wlEnergy', match: ['Énergie', 'Pétrolier'] },
]

function AddSheet({ lang, favorites, onToggle, onClose }) {
  const [query, setQuery] = useState('')
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCompanies({ limit: 47 })
      .then(r => setStocks(r.data.companies || []))
      .catch(() => setStocks([]))
      .finally(() => setLoading(false))
  }, [])

  const q = query.trim().toLowerCase()
  const list = stocks.filter(s =>
    !q || s.symbol.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q)
  )

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
          {!loading && list.length === 0 && <div className="sheet-empty">{t(lang, 'noResults')}</div>}
          {list.map(s => {
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
          .add-row {
            position: relative;
            display: flex; align-items: center; gap: 14px;
            padding: 12px 0;
            cursor: pointer;
          }
          .add-row::after {
            content: '';
            position: absolute; left: 54px; right: 0; bottom: 0;
            height: 1px; background: #202020;
          }
          .add-logo {
            width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 14px; color: #fff;
          }
          .add-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
          .add-name { font-size: 15px; font-weight: 700; color: #fff; }
          .add-sub { font-size: 12px; color: #8b8b8b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .add-btn {
            width: 36px; height: 36px; border: none; background: none;
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
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const mounted = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const cRes = await getCompanies({ limit: 47 })
      if (!mounted.current) return
      setStocks(cRes.data.companies || [])
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

  const q = query.trim().toLowerCase()
  const filter = SECTOR_FILTERS.find(f => f.id === sector)
  const list = stocks.filter(s => {
    if (filter && filter.match && !filter.match.some(m => (s.sector || '').includes(m))) return false
    if (!q) return true
    return (
      s.symbol.toLowerCase().includes(q) ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.sector || '').toLowerCase().includes(q)
    )
  })

  const favList = [...list].sort((a, b) => {
    const fa = favorites.includes(a.symbol) ? 0 : 1
    const fb = favorites.includes(b.symbol) ? 0 : 1
    return fa - fb
  })

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

        <div className="search-bar">
          <Search size={18} className="sb-icon" />
          <input
            placeholder={t(lang, 'wlSearchPlaceholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-btn mini" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="filters-row">
          {SECTOR_FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-chip ${sector === f.id ? 'active' : ''}`}
              onClick={() => setSector(f.id)}
            >
              {t(lang, f.label)}
            </button>
          ))}
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
            {favList.map(s => {
              const chg = s.change_percent || 0
              const up = chg > 0
              const down = chg < 0
              const isFav = favorites.includes(s.symbol)
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
                      <span className="row-dash" />
                    </div>
                    <div className="row-sub">{s.name}</div>
                  </div>
                  <div className="row-right">
                    <div className="row-price">{fmtPrice(lang, s.current_price, 0)}</div>
                    <div className={`row-chg ${up ? 'up' : down ? 'down' : 'flat'}`}>
                      <span className="chg-val">{fmtPrice(lang, (s.current_price || 0) * chg / 100, 0)}</span>
                      <span className="chg-pct">{fmtChange(lang, chg)}</span>
                    </div>
                  </div>
                  <button
                    className={`row-star ${isFav ? 'active' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleFavorite(s.symbol) }}
                    aria-label="favori"
                  >
                    <Star size={11} fill={isFav ? '#00C087' : 'none'} color={isFav ? '#00C087' : '#5a5a5a'} />
                  </button>
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
        .safe-area { flex: 1; overflow-y: auto; }
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

        .stock-list { padding: 0 0 16px; }
        .stock-row {
          position: relative;
          display: flex; align-items: center;
          height: 76px; padding: 0 16px 0 0;
          cursor: pointer;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .stock-row:active { opacity: 0.9; transform: scale(0.98); }
        .row-logo {
          width: 42px; height: 42px; border-radius: 50%;
          margin-left: 16px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 13px; font-weight: 700;
        }
        .row-info {
          flex: 1; min-width: 0;
          margin-left: 14px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .row-title-line { display: flex; align-items: center; gap: 7px; }
        .row-symbol {
          font-size: 15px; font-weight: 700; color: #fff;
          white-space: nowrap;
        }
        .row-dash {
          width: 11px; height: 5px; border-radius: 3px;
          background: #8E8E8E;
        }
        .row-sub {
          font-size: 11px; font-weight: 400; color: #8B8B8B;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .row-right {
          display: flex; flex-direction: column; align-items: flex-end; gap: 3px;
          padding-right: 16px; flex-shrink: 0;
        }
        .row-price {
          font-size: 14px; font-weight: 700; color: #fff;
          font-family: 'JetBrains Mono', monospace; white-space: nowrap;
        }
        .row-chg {
          display: flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }
        .row-chg.up { color: #00C087; }
        .row-chg.down { color: #F23645; }
        .row-chg.flat { color: #8b8b8b; }
        .row-star {
          position: absolute; top: 5px; right: 6px;
          width: 22px; height: 22px; border: none; background: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border-radius: 50%;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .row-star:active { opacity: 0.9; transform: scale(0.98); }
      `}</style>
    </div>
  )
}
