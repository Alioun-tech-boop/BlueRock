import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies } from '../services/api'
import { Search, ArrowLeft, Star, FileText } from 'lucide-react'
import { detectLang, t, fmtPrice, fmtChange } from '../lib/i18n'

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
  const [lang, setLang] = useState('fr')
  const [stocks, setStocks] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [favorites, setFavorites] = useState([])
  const mounted = useRef(true)

  const fetchData = () => {
    setLoading(true)
    setError(false)
    getCompanies({ limit: 47 })
      .then(r => { if (mounted.current) setStocks(r.data.companies || []) })
      .catch(() => { if (mounted.current) setError(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
  }

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    setFavorites(loadJSON(FAV_KEY, []))
    fetchData()
    return () => { mounted.current = false }
  }, [])

  const toggleFavorite = (symbol) => {
    setFavorites(prev => {
      const next = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
      saveJSON(FAV_KEY, next)
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

        <div className="search-bar">
          <Search size={16} className="sb-icon" />
          <input
            placeholder={t(lang, 'searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {error && (
          <div className="error-bar">
            <span>{t(lang, 'loadError')}</span>
            <button onClick={fetchData}>{t(lang, 'tryAgain')}</button>
          </div>
        )}

        <div className="stock-list">
          {loading ? (
            <div className="loading-row"><div className="spinner" /></div>
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
                  {s.logo_url ? <img src={s.logo_url} alt={s.symbol} className="stock-logo-img" /> : s.symbol?.[0]}
                </div>
                <div className="stock-info">
                  <div className="stock-name">{s.symbol}</div>
                  <div className="stock-sub">{s.name?.substring(0, 30)}</div>
                  <div className="stock-tags">
                    <span className="sm-sector">{s.sector}</span>
                    {s.rating && <span className="sm-rating">{s.rating}</span>}
                  </div>
                </div>
                <div className="stock-right">
                  <div className="stock-price">{fmtPrice(lang, s.current_price)}</div>
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
          background: #000; color: #fff;
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
        .co-count { font-size: 11px; color: #a3a3a3; }
        .search-bar {
          display: flex; align-items: center; gap: 10px;
          background: #1B1B1B; border-radius: 14px;
          padding: 0 14px; height: 44px; margin-bottom: 14px;
        }
        .sb-icon { color: #a3a3a3; flex-shrink: 0; }
        .search-bar input {
          flex: 1; background: none; border: none; outline: none;
          color: #fff; font-size: 14px; font-family: inherit;
        }
        .search-bar input::placeholder { color: #666; }
        .error-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          border-radius: 12px; padding: 10px 12px; margin-bottom: 14px;
          font-size: 12px; color: #ff9d9d;
        }
        .error-bar button {
          background: rgba(255,77,79,0.2); border: none; border-radius: 8px;
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
        .stock-logo-img { width: 100%; height: 100%; object-fit: cover; }
        .stock-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .stock-name { font-size: 14px; font-weight: 600; }
        .stock-sub { font-size: 11px; color: #a3a3a3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stock-tags { display: flex; gap: 6px; align-items: center; }
        .sm-sector { font-size: 9px; color: #777; }
        .sm-rating {
          font-size: 9px; font-weight: 700; color: #00C853;
          background: rgba(0,200,83,0.12); padding: 1px 6px; border-radius: 8px;
        }
        .stock-right { text-align: right; display: flex; flex-direction: column; gap: 2px; min-width: 68px; }
        .stock-price { font-size: 14px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .stock-chg { font-size: 11px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
        .stock-chg.up { color: #00C853; }
        .stock-chg.down { color: #FF4D4F; }
        .stock-chg.flat { color: #a3a3a3; }
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
          padding: 44px 20px; color: #a3a3a3; font-size: 14px;
        }
      `}</style>
    </div>
  )
}
