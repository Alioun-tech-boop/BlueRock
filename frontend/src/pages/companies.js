import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import { getCompanies } from '../services/api'
import { Search, ArrowLeft, Star, FileText, Lock } from 'lucide-react'
import { detectLang, t, fmtPrice, fmtPriceCur, fmtChange } from '../lib/i18n'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import { useAuth } from '../lib/auth'
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

export default function Companies() {
  const router = useRouter()
  const { user } = useAuth()
  const isPro = user?.tier === 'pro'
  const [lang, setLang] = useState('fr')
  const [stocks, setStocks] = useState([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('equity')
  const [exchange, setExchange] = useState('BRVM')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [favorites, setFavorites] = useState([])
  const mounted = useRef(true)

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true)
    setError(false)
    const ex = exchange === 'NGX' && !isPro ? 'BRVM' : exchange
    getCompanies({ instrument_type: type, exchange: ex, limit: 100 })
      .then(r => { if (mounted.current) setStocks(r.data.companies || []) })
      .catch(() => { if (!silent && mounted.current) setError(true) })
      .finally(() => { if (!silent && mounted.current) setLoading(false) })
  }

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    try { migrateAnonFavToUser(user) } catch {}
    setFavorites(loadJSON(getFavKey(user), []))
    if (router.query?.exchange === 'NGX' && !isPro) {
      setExchange('BRVM')
      return
    }
    fetchData()
    return () => { mounted.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, exchange, isPro, user?.id, user?.auth_id])

  const switchType = (v) => { if (v !== type) { setType(v); setSearch('') } }
  const switchExchange = (v) => {
    if (v !== exchange) {
      setExchange(v)
      if (v === 'NGX' && type !== 'equity') setType('equity')
      setSearch('')
    }
  }

  const toggleFavorite = (symbol) => {
    const favKey = getFavKey(user)
    setFavorites(prev => {
      const next = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
      saveJSON(favKey, next)
      try { if (favKey !== FAV_KEY) saveJSON(FAV_KEY, next) } catch {}
      if (user) {
        import('../services/api').then(({ addWatchlist, removeWatchlist }) => {
          const p = next.includes(symbol) ? addWatchlist(symbol) : removeWatchlist(symbol)
          p.catch(()=>{})
        })
      }
      return next
    })
  }

  const q = search.trim().toUpperCase()
  const filtered = q
    ? stocks.filter(s => s.symbol.toUpperCase().includes(q) || (s.name || '').toUpperCase().includes(q))
    : stocks

  const sorted = [...filtered].sort((a, b) => {
    const fa = favorites.includes(a.symbol) ? 0 : 1
    const fb = favorites.includes(b.symbol) ? 0 : 1
    return fa - fb
  })

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="co-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div className="co-title">
            <span>{t(lang, 'companies')}</span>
            <span className="co-count">{sorted.length} / {stocks.length}</span>
          </div>
          <div className="icon-btn spacer" />
        </header>

        <div className="type-tabs">
          {[
            { id: 'equity', label: 'wlActions' },
            { id: 'obligation', label: 'wlObligations' },
            { id: 'fcp', label: 'wlFcp' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`type-tab ${type === tab.id ? 'active' : ''}`}
              onClick={() => switchType(tab.id)}
            >
              {t(lang, tab.label)}
            </button>
          ))}
        </div>

        <div className="exchange-tabs">
          {[
            { id: 'BRVM', label: 'BRVM' },
            { id: 'NGX', label: 'NGX', locked: !isPro },
          ].map(tab => (
            <button
              key={tab.id}
              className={`type-tab ${exchange === tab.id ? 'active' : ''} ${tab.locked ? 'locked' : ''}`}
              onClick={() => tab.locked ? router.push('/premium') : switchExchange(tab.id)}
              title={tab.locked ? t(lang, 'proLocked') : undefined}
            >
              {tab.id === 'NGX' ? 'NGX' : 'BRVM'}
              {tab.locked && <Lock size={10} style={{ marginLeft: 4 }} />}
              <span className="ex-sub">{tab.id === 'NGX' ? '₦' : 'FCFA'}</span>
            </button>
          ))}
        </div>

        <div className="search-bar">
          <span className="sb-chip"><img src="/logo-sm.png" alt="" className="sb-logo" /></span>
          <input
            placeholder={t(lang, 'searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {error && (
          <DataErrorState lang={lang} size={140} message={t(lang, 'loadError')} retry={fetchData} />
        )}

        <div className="stock-list">
          {loading ? (
            <div className="loading-row"><TriLoader compact /></div>
          ) : sorted.length === 0 ? (
            <div className="empty-box">
              <Search size={22} />
              <span>{t(lang, 'noResults')}</span>
            </div>
          ) : sorted.map(s => {
            const chg = s.change_percent || 0
            const up = chg > 0
            const down = chg < 0
            const isFav = favorites.includes(s.symbol)
            return (
              <div key={s.symbol} className="stock-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                <div className="stock-logo" style={{ background: `hsl(${(s.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                  {s.logo_url ? (
                    <img
                      src={s.logo_url} alt={s.symbol} className="stock-logo-img"
                      onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)}
                      onError={onLogoError}
                    />
                  ) : s.symbol?.[0]}
                </div>
                <div className="stock-info">
                  <div className="stock-name">
                    <span>{s.symbol}</span>
                    <span className={`ex-badge ${s.exchange === 'NGX' ? 'ngx' : 'brvm'}`}>{s.exchange || 'BRVM'}</span>
                  </div>
                  <div className="stock-sub">{s.name?.substring(0, 30)}</div>
                  <div className="stock-tags">
                    {s.sub_sector && <span className="sm-sub">{s.sub_sector}</span>}
                    {s.rating && <span className="sm-rating">{s.rating}</span>}
                  </div>
                </div>
                <div className="stock-right">
                  <div className="stock-price">{fmtPriceCur(lang, s.current_price, s.currency)}</div>
                  <div className={`stock-chg ${up ? 'up' : down ? 'down' : 'flat'}`}>{fmtChange(lang, chg)}</div>
                </div>
                <div className="row-actions">
                  <button
                    className="act-btn"
                    onClick={(e) => { e.stopPropagation(); router.push(`/company?id=${s.id}`) }}
                    title={t(lang, 'fundamentals')}
                  >
                    <FileText size={15} />
                  </button>
                  <button
                    className={`act-btn ${isFav ? 'fav' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(s.symbol) }}
                  >
                    <Star size={16} fill={isFav ? '#ffd166' : 'none'} color={isFav ? '#ffd166' : '#5a5a5a'} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <BottomNav />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .co-header {
          display: flex; align-items: center; justify-content: space-between; height: 60px;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .spacer { opacity: 0; }
        .co-title { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .co-title span:first-child { font-size: 17px; font-weight: 700; }
        .co-count { font-size: 11px; color: #9AA3B2; }
        .type-tabs {
          display: flex; gap: 6px; margin-bottom: 12px;
        }
        .type-tab {
          flex: 1; height: 34px;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #9AA3B2; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: background 160ms ease-out, color 160ms ease-out;
        }
        .type-tab.active { background: #8b5cf6; color: #fff; }
        .exchange-tabs {
          display: flex; gap: 6px; margin-bottom: 12px;
        }
        .exchange-tabs .type-tab { flex: 0 0 auto; padding: 0 14px; width: auto; }
        .ex-sub { font-size: 9px; opacity: 0.7; margin-left: 4px; }
        .ex-badge {
          font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px;
          margin-left: 6px; vertical-align: middle; letter-spacing: 0.3px;
        }
        .ex-badge.brvm { color: #34d399; background: rgba(52,211,153,0.15); }
        .ex-badge.ngx { color: #8b5cf6; background: rgba(139,92,246,0.15); }
        .sm-sub {
          font-size: 9px; font-weight: 600; color: #9AA3B2;
          background: rgba(154,163,178,0.12); padding: 1px 6px; border-radius: 8px;
        }
        .stock-cur { font-size: 11px; color: #9AA3B2; }
        .search-bar {
          display: flex; align-items: center; gap: 10px;
          background: #1B1B1B; border-radius: 14px;
          padding: 0 14px; height: 44px; margin-bottom: 14px;
        }
        .sb-chip {
          width: 26px; height: 26px; flex-shrink: 0; border-radius: 7px;
          background: #FFFFFF; display: flex; align-items: center; justify-content: center;
        }
        .sb-logo { width: 18px; height: 18px; }
        .search-bar input {
          flex: 1; background: none; border: none; outline: none;
          color: #fff; font-size: 14px; font-family: inherit;
        }
        .search-bar input::placeholder { color: #666; }
        .error-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.3);
          border-radius: 12px; padding: 10px 12px; margin-bottom: 14px;
          font-size: 12px; color: #ff9d9d;
        }
        .error-bar button {
          background: rgba(240,68,56,0.2); border: none; border-radius: 8px;
          color: #ff9d9d; font-size: 11px; padding: 5px 10px; cursor: pointer; font-family: inherit;
        }
        .stock-list { display: flex; flex-direction: column; padding-bottom: 16px; }
        .stock-row {
          position: relative;
          display: flex; align-items: center; gap: 10px;
          min-height: 66px; cursor: pointer; padding: 6px 0;
        }
        .stock-row::after {
          content: '';
          position: absolute; left: 50px; right: 0; bottom: 0;
          height: 1px; background: #1a1a1a;
        }
        .stock-logo {
          width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 15px; flex-shrink: 0;
          overflow: hidden;
        }
        .stock-logo-img { width: 100%; height: 100%; object-fit: contain; padding: 6px; box-sizing: border-box; }
        .stock-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .stock-name { font-size: 14px; font-weight: 600; }
        .stock-sub { font-size: 11px; color: #9AA3B2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stock-tags { display: flex; gap: 6px; align-items: center; }
        .sm-rating {
          font-size: 9px; font-weight: 700; color: #18C27C;
          background: rgba(24,194,124,0.12); padding: 1px 6px; border-radius: 8px;
        }
        .stock-right { text-align: right; display: flex; flex-direction: column; gap: 2px; min-width: 68px; }
        .stock-price { font-size: 12.5px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .stock-chg { font-size: 11px; font-weight: 600; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .stock-chg.up { color: #18C27C; }
        .stock-chg.down { color: #F04438; }
        .stock-chg.flat { color: #9AA3B2; }
        .row-actions { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
        .act-btn {
          width: 32px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #666; cursor: pointer; border-radius: 8px;
        }
        .act-btn:hover { background: #1a1a1a; color: #fff; }
        .act-btn.fav { color: #ffd166; }
        .loading-row { display: flex; justify-content: center; padding: 40px; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #262626; border-top-color: #8b5cf6;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-box {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 44px 20px; color: #9AA3B2; font-size: 14px;
        }
      `}</style>
    </div>
  )
}
