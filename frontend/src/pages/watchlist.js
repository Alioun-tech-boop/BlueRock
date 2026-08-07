import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies } from '../services/api'
import { supabase } from '../lib/supabase'
import { Search, Plus, Star, X, ChevronDown, Bell } from 'lucide-react'
import { detectLang, t, fmtPrice, fmtChange } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { getUnreadCount } from '../services/api'

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

const SORTS = [
  { id: 'name', label: 'wlSortName' },
  { id: 'change', label: 'wlSortChange' },
  { id: 'price', label: 'wlSortPrice' },
]

const STATUS_LABEL = { equity: 'wlActions', obligation: 'wlObligations', fcp: 'wlFcp' }

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
    ? CATS.slice(1).map(tp => ({ ...tp, list: (groups[tp.id] || []).filter(match) })).filter(g => g.list.length)
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
              <div className="add-group">{t(lang, g.label)}</div>
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
                    <button className={`add-btn ${isFav ? 'active' : ''}`} aria-label={t(lang, 'wlAdd')}>
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
  const [sort, setSort] = useState('name')
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

  useEffect(() => {
    const onClick = e => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setOpenSel(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

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

  const sectors = [...new Set(stocks.map(s => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b))

  const favList = stocks
    .filter(s => favorites.includes(s.symbol))
    .filter(s => cat === 'all' || s.instrument_type === cat)
    .filter(s => !sector || s.sector === sector)
    .sort((a, b) => {
      if (sort === 'price') return (b.current_price ?? -1) - (a.current_price ?? -1)
      if (sort === 'change') return (b.change_percent ?? -999) - (a.change_percent ?? -999)
      return (a.name || '').localeCompare(b.name || '')
    })

  const selectValue = sel => sel === 'sector'
    ? (sector ? sector : t(lang, 'wlAllSectors'))
    : t(lang, SORTS.find(s => s.id === sort).label)

  return (
    <div className="wl-root">
      <div className="wl-frame">
        <header className="wl-header">
          <h1 className="wl-title">{t(lang, 'wlTitle')}</h1>
          <div className="wl-actions">
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
            label={t(lang, 'wlSort')}
            value={selectValue('sort')}
            open={openSel === 'sort'}
            onToggle={() => setOpenSel(openSel === 'sort' ? null : 'sort')}
            onSelect={id => { setSort(id); setOpenSel(null) }}
            options={SORTS.map(s => ({ id: s.id, label: t(lang, s.label), active: sort === s.id }))}
          />
        </div>

        {error && (
          <div className="error-bar">
            <span>{t(lang, 'loadError')}</span>
            <button onClick={() => fetchData()}>{t(lang, 'tryAgain')}</button>
          </div>
        )}

        <main className="wl-list">
          {loading ? (
            <div className="loading-row"><div className="spinner" /></div>
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
                    {s.symbol?.[0]}
                  </div>
                  <div className="wl-info">
                    <div className="wl-name">{s.name}</div>
                    <div className="wl-status">{t(lang, STATUS_LABEL[s.instrument_type] || 'wlActions')}</div>
                  </div>
                  <div className="wl-nums">
                    <div className="wl-price">{fmtPrice(lang, s.current_price, 0)}</div>
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
          font-family: 'Poppins', Inter, -apple-system, sans-serif;
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
          margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.4px;
          line-height: 1; color: #fff;
          text-shadow: 0 0 14px rgba(255,255,255,0.3), 0 0 34px rgba(255,255,255,0.1);
        }
        .wl-actions { display: flex; align-items: center; gap: 10px; }
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
          font-size: 10px; font-weight: 700; color: #fff;
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
          background: #00C087; color: #00150E; font-weight: 700;
          text-shadow: 0 1px 0 rgba(255,255,255,0.25);
        }

        .wl-filters {
          position: relative; z-index: 5;
          display: flex; align-items: center; gap: 26px;
          margin: 4px 22px 0; padding: 8px 18px;
          background: #141414; border-radius: 18px;
          flex-shrink: 0;
        }
        .select-box { position: relative; display: flex; flex-direction: column; gap: 2px; }
        .select-label {
          font-size: 10.5px; font-weight: 500; letter-spacing: 0.3px;
          text-transform: uppercase; color: #7a7a7a;
        }
        .select-value {
          display: flex; align-items: center; gap: 8px;
          min-height: 26px; cursor: pointer; user-select: none;
        }
        .select-value span {
          font-size: 14px; font-weight: 600; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 220px;
        }
        .select-value .chev { color: #8f8f8f; flex-shrink: 0; transition: transform 160ms ease-out; }
        .select-value .chev.up { transform: rotate(180deg); }
        .select-menu {
          position: absolute; top: calc(100% + 10px); left: 0;
          min-width: 190px; max-width: 280px; max-height: 260px; overflow-y: auto;
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
          color: #fff; font-size: 17px; font-weight: 700;
        }
        .wl-info {
          flex: 1; min-width: 0; margin-left: 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .wl-name {
          font-size: 16px; font-weight: 600; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .wl-status {
          font-size: 12px; font-weight: 400; color: #8B8B8B;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .wl-nums {
          display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
          margin-left: 12px; flex-shrink: 0;
        }
        .wl-price {
          font-size: 16.5px; font-weight: 700; color: #fff;
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
