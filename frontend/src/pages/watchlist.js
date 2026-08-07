import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies } from '../services/api'
import { supabase } from '../lib/supabase'
import { Search, Plus, Star, X, Wallet, ChevronDown, Bell } from 'lucide-react'
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

const TYPES = [
  { id: 'equity', label: 'wlActions' },
  { id: 'obligation', label: 'wlObligations' },
  { id: 'fcp', label: 'wlFcp' },
]

const COLLAPSE_AT = 5

const SYMBOL_COUNTRY = {
  'ABJC': 'CI', 'ABVC': 'CI', 'ADVTA': 'CI', 'AFRIC': 'CI', 'ALCIV': 'CI',
  'BICC': 'CI', 'BNDC': 'CI', 'BNBC': 'CI', 'BOAB': 'CI', 'BOAC': 'CI',
  'CBIBF': 'BF', 'CBIBJ': 'BJ', 'CDCI': 'CI', 'CEDAC': 'CI', 'CFAC': 'CI',
  'CIEC': 'CI', 'CIPLA': 'CI', 'COFINA': 'CI', 'CORIS': 'BF', 'ECOBANC': 'CI',
  'ECOBF': 'BF', 'ECOBJ': 'BJ', 'ECOTC': 'CI', 'ENI': 'CI', 'ETIT': 'CI',
  'FILTIS': 'CI', 'FINAN': 'ML', 'FONCIER': 'CI', 'FUTUR': 'CI', 'GEST': 'ML',
  'ICLA': 'CI', 'INTB': 'CI', 'LINAF': 'SN', 'LINBF': 'BF', 'LINBJ': 'BJ',
  'LINML': 'ML', 'LINSN': 'SN', 'LONTAB': 'CI', 'MTNE': 'CI', 'NASCI': 'CI',
  'NEI-CI': 'CI', 'NESLY': 'CI', 'NESTLE': 'CI', 'NTLC': 'TG', 'NUCL': 'SN',
  'ONATEL': 'BF', 'ONTBF': 'BF', 'ORAG': 'CI', 'ORAC': 'CI', 'PALCI': 'CI',
  'PRSC': 'CI', 'SABC': 'CI', 'SAHAM': 'SN', 'SECU': 'CI', 'SDCC': 'CI',
  'SEMBCI': 'CI', 'SGBF': 'BF', 'SGBCI': 'CI', 'SGBJ': 'BJ', 'SICOR': 'CI',
  'SITAB': 'CI', 'SIIC': 'SN', 'SIVC': 'CI', 'SMBF': 'BF', 'SNTS': 'SN',
  'SOCEF': 'SN', 'SOCOCIM': 'SN', 'SOLIBRA': 'CI', 'SONATEL': 'SN', 'SONEL': 'SN',
  'SPBF': 'BF', 'STAC': 'CI', 'STBAN': 'TG', 'TTLS': 'TG', 'UNCF': 'SN',
  'UNIWAX': 'CI', 'VIVO': 'CI', 'BNDC.O': 'CI', 'CIEC.O': 'CI', 'CIPLA.O': 'CI',
  'ETIT.O': 'CI', 'SABC.O': 'CI', 'SGBF.O': 'BF', 'SGBCI.O': 'CI', 'SONEL.O': 'SN',
}

const COUNTRY_NAMES = {
  'CI': 'Côte d\u2019Ivoire', 'BJ': 'Bénin', 'BF': 'Burkina Faso', 'ML': 'Mali',
  'NE': 'Niger', 'SN': 'Sénégal', 'TG': 'Togo', 'UEMOA': 'UEMOA',
}

const COUNTRY_KEYS = { 'CI': 'CI', 'BJ': 'BJ', 'BF': 'BF', 'ML': 'ML', 'NE': 'NE', 'SN': 'SN', 'TG': 'TG' }

function countryOf(s) {
  if (!s) return 'UEMOA'
  if (SYMBOL_COUNTRY[s.symbol]) return SYMBOL_COUNTRY[s.symbol]
  if (s.instrument_type === 'fcp') return 'UEMOA'
  const n = (s.name || '')
  if (n.includes('Bénin')) return 'BJ'
  if (n.includes('Burkina')) return 'BF'
  if (n.includes('Mali')) return 'ML'
  if (n.includes('Niger')) return 'NE'
  if (n.includes('SÉNÉGAL') || n.includes('SENEGAL')) return 'SN'
  if (n.includes('Togo')) return 'TG'
  if (n.includes('CÔTE') || n.includes('COTE') || n.includes('IVOIR')) return 'CI'
  return 'UEMOA'
}

const TYPE_ORDER = ['equity', 'obligation', 'fcp']

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
                      <Star size={18} fill={isFav ? '#18C27C' : 'none'} color={isFav ? '#18C27C' : '#9AA3B2'} />
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
          .ss-icon { color: #9AA3B2; flex-shrink: 0; }
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
            text-transform: uppercase; color: #9AA3B2;
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
            
          }
          .add-sub { font-size: 13px; color: #9AA3B2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
  const [typeFilter, setTypeFilter] = useState('equity')
  const [groupMode, setGroupMode] = useState('pays')
  const [unread, setUnread] = useState(0)
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

  const typeList = stocks
    .filter(s => s.instrument_type === typeFilter)
    .sort((a, b) => (a.symbol || '').localeCompare(b.symbol || ''))

  const grouped = []
  const bucket = new Map()
  for (const s of typeList) {
    const g = groupMode === 'pays' ? countryOf(s) : (s.sector || 'Autres')
    if (!bucket.has(g)) { bucket.set(g, []); grouped.push({ key: g, list: bucket.get(g) }) }
    bucket.get(g).push(s)
  }
  grouped.sort((a, b) => b.list.length - a.list.length)

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="top-bar">
          <button className="top-bell" onClick={() => router.push('/notifications')} aria-label={t(lang, 'notifications')}>
            <Bell size={18} strokeWidth={2} />
            {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <div className="logo">BlueRock</div>
          <button className="top-wallet" onClick={() => router.push('/portfolio')} aria-label={t(lang, 'portfolio')}>
            <Wallet size={17} strokeWidth={2} />
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

        <div className="filter-stack">
          <div className="filter-bar buttons">
            {TYPES.map(tp => (
              <button
                key={tp.id}
                className={`filter-btn ${typeFilter === tp.id ? 'active' : ''}`}
                onClick={() => setTypeFilter(tp.id)}
              >
                {t(lang, tp.label)}
              </button>
            ))}
          </div>
          <div className="filter-bar menus">
            <button
              className={`filter-btn ${groupMode === 'pays' ? 'active' : ''}`}
              onClick={() => setGroupMode('pays')}
            >
              {t(lang, 'pays')}
            </button>
            <button
              className={`filter-btn ${groupMode === 'secteur' ? 'active' : ''}`}
              onClick={() => setGroupMode('secteur')}
            >
              {t(lang, 'secteurs')}
            </button>
            <span className="filter-count">{typeList.length}</span>
          </div>
        </div>

        {error && (
          <div className="error-bar">
            <span>{t(lang, 'loadError')}</span>
            <button onClick={() => fetchData()}>{t(lang, 'tryAgain')}</button>
          </div>
        )}

        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : typeList.length === 0 ? (
          <div className="empty-box">
            <Star size={26} />
            <span>{t(lang, 'emptyWatchlist')}</span>
            <span className="empty-sub">{t(lang, 'emptyWatchlistSub')}</span>
          </div>
        ) : (
          <div className="stock-list">
            {grouped.map(g => {
              const group = g.list
              const isOpen = !!expanded[g.key]
              const visible = isOpen ? group : group.slice(0, COLLAPSE_AT)
              const hidden = group.length - visible.length
              const gName = groupMode === 'pays' ? (COUNTRY_NAMES[g.key] || g.key) : g.key
              return (
                <div key={g.key} className="list-section">
                  <div className="list-group">
                    <span>{gName}</span>
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
                          <Star size={14} fill={isFav ? '#18C27C' : 'none'} color={isFav ? '#18C27C' : '#5a5a5a'} />
                        </button>
                      </div>
                    )
                  })}
                  {hidden > 0 && (
                    <button className="section-toggle" onClick={() => setExpanded(prev => ({ ...prev, [g.key]: !isOpen }))}>
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
          background: #0E1627; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding-bottom: 110px; }
        .safe-area::-webkit-scrollbar { display: none; }

        .top-bar {
          height: 54px; padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .top-bell {
          position: relative;
          width: 34px; height: 34px; border-radius: 50%;
          background: none; border: none; cursor: pointer;
          color: #F8F8FA; display: flex; align-items: center; justify-content: center;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .top-bell:active { opacity: 0.9; transform: scale(0.98); }
        .bell-badge {
          position: absolute; top: -2px; right: -2px;
          min-width: 17px; height: 17px; padding: 0 4px;
          border-radius: 9px;
          background: #F04438; color: #fff;
          font-size: 10px; font-weight: 700; line-height: 17px;
          display: flex; align-items: center; justify-content: center;
        }
        .logo {
          font-size: 19px; font-weight: 700; letter-spacing: 0.25px;
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
          color: #fff; font-size: 17px; font-weight: 600;
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

        .filter-stack {
          display: flex; flex-direction: column; gap: 10px;
          padding: 4px 22px 14px; flex-shrink: 0;
        }
        .filter-bar {
          display: flex; align-items: center; gap: 8px;
          overflow-x: auto; scrollbar-width: none;
        }
        .filter-bar::-webkit-scrollbar { display: none; }
        .filter-bar.buttons .filter-btn {
          flex-shrink: 0; height: 40px; padding: 0 20px;
          border: none; border-radius: 20px;
          background: #1A1A1A; color: #A5ADBB;
          font-size: 17px; font-weight: 600; cursor: pointer; font-family: inherit;
          transition: background 160ms ease-out, color 160ms ease-out, box-shadow 160ms ease-out;
        }
        .filter-bar.buttons .filter-btn.active {
          background: #F8F8FA; color: #111111;
          animation: btnGlow 2s ease-in-out infinite;
        }
        @keyframes btnGlow {
          0%, 100% { box-shadow: 0 0 6px rgba(24,194,124,0.35); }
          50% { box-shadow: 0 0 16px rgba(24,194,124,0.75); }
        }
        .filter-bar.menus .filter-btn {
          flex-shrink: 0; height: 34px; padding: 0 16px;
          border: none; border-radius: 17px;
          background: #1A1A1A; color: #6B7A94;
          font-size: 16px; font-weight: 600; cursor: pointer; font-family: inherit;
          transition: background 160ms ease-out, color 160ms ease-out;
        }
        .filter-bar.menus .filter-btn.active {
          background: rgba(24,194,124,0.14); color: #F2F4F7;
        }
        .filter-count {
          margin-left: auto; flex-shrink: 0;
          font-size: 14px; font-weight: 500; color: #6B7A94;
        }

        .search-bar {
          display: flex; align-items: center; gap: 8px;
          background: #1A1A1A; border-radius: 14px;
          padding: 0 14px; height: 46px; margin: 6px 22px 12px;
        }
        .sb-icon { color: #9AA3B2; flex-shrink: 0; }
        .search-bar input {
          flex: 1; background: none; border: none; outline: none;
          color: #fff; font-size: 14px; font-family: inherit;
        }
        .search-bar input::placeholder { color: #5a5a5a; }
        .icon-btn.mini {
          width: 28px; height: 28px; background: none; border: none;
          color: #9AA3B2; cursor: pointer; border-radius: 50%;
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
          background: #1A1A1A; color: #9AA3B2;
          font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit;
          transition: background 160ms ease-out, color 160ms ease-out;
        }
        .filter-chip.active { background: #2E2E2E; color: #fff; font-weight: 600; }

        .error-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.3);
          border-radius: 12px; padding: 10px 12px; margin: 0 22px 14px;
          font-size: 12px; color: #ff9d9d;
        }
        .error-bar button {
          background: rgba(240,68,56,0.2); border: none; border-radius: 8px;
          color: #ff9d9d; font-size: 11px; padding: 5px 10px; cursor: pointer; font-family: inherit;
        }
        .loading-row { display: flex; justify-content: center; padding: 40px; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #262626; border-top-color: #18C27C;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-box {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 44px 20px; text-align: center;
          color: #9AA3B2; font-size: 14px;
        }
        .empty-sub { font-size: 12px; color: #666; }

        .stock-list { padding: 0 0 8px; }
        .list-section { padding-bottom: 6px; }
        .list-group {
          display: flex; align-items: center; gap: 10px;
          font-size: 14px; font-weight: 600; letter-spacing: 0.25px;
          color: #F2F4F7;
          padding: 20px 22px 10px;
        }
        .list-count {
          min-width: 24px; height: 24px; padding: 0 8px;
          display: flex; align-items: center; justify-content: center;
          background: #1E1E1E; border-radius: 12px;
          font-size: 12px; font-weight: 600; color: #18C27C;
        }
        .section-toggle {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin: 10px 22px 4px;
          width: calc(100% - 44px); height: 44px;
          background: #1A1A1A; border: none; border-radius: 14px;
          color: #18C27C; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          
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
          font-size: 18px; font-weight: 700; color: #F8F8FA;
          white-space: nowrap;
        }
        .row-sub {
          font-size: 14px; font-weight: 400; color: #9AA3B2;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .row-right {
          display: flex; flex-direction: column; align-items: flex-end; gap: 5px;
          padding-right: 16px; flex-shrink: 0;
        }
        .row-price {
          font-size: 18px; font-weight: 700; color: #8E95A3;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .row-chg {
          display: flex; align-items: center; gap: 10px;
          font-size: 16px; font-weight: 500;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
        }
        .row-chg.up {
          color: #18C27C;
        }
        .row-chg.down {
          color: #F04438;
        }
        .row-chg.flat {
          color: #9AA3B2;
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
