import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import { getScreen, getSectors } from '../services/api'
import { ArrowLeft, RefreshCw, X, Filter } from 'lucide-react'
import { detectLang, t } from '../lib/i18n'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import DataErrorState from '../components/DataErrorState'

const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C']

function fmtNum(n, digits = 2) {
  if (n == null) return '—'
  if (typeof n !== 'number') return n
  return n.toFixed(digits)
}

export default function Screen() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  const [stocks, setStocks] = useState([])
  const [sectorOptions, setSectorOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filters, setFilters] = useState(() => {
    const initial = { sector: '', rating: '', minScore: '' }
    if (typeof window !== 'undefined' && window.location.search) {
      const p = new URLSearchParams(window.location.search)
      if (p.get('sector')) initial.sector = p.get('sector')
    }
    return initial
  })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    getSectors().then(r => { if (mounted.current) setSectorOptions(r.data || []) }).catch(() => {})
    return () => { mounted.current = false }
  }, [])

  const fetchScreen = (f = filters) => {
    setLoading(true)
    setError(false)
    const params = {}
    if (f.sector) params.sector = f.sector
    if (f.rating) params.rating = f.rating
    if (f.minScore) params.min_score = f.minScore
    getScreen(params)
      .then(res => {
        if (!mounted.current) return
        setStocks(Array.isArray(res.data) ? res.data : (res.data.companies || res.data.stocks || []))
      })
      .catch(() => { if (mounted.current) setError(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
  }

  useEffect(() => { fetchScreen() }, [])

  const handleFilter = (key, val) => {
    const newF = { ...filters, [key]: val }
    setFilters(newF)
    fetchScreen(newF)
  }

  const clearFilters = () => {
    const newF = { sector: '', rating: '', minScore: '' }
    setFilters(newF)
    fetchScreen(newF)
  }

  const hasFilters = filters.sector || filters.rating || filters.minScore

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="sc-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div className="sc-title">
            <span>{t(lang, 'screener')}</span>
            <span className="sc-count">{loading ? '...' : `${stocks.length} ${t(lang, 'results')}`}</span>
          </div>
          <button className="icon-btn" onClick={() => fetchScreen()}>
            <RefreshCw size={18} />
          </button>
        </header>

        <div className="filters">
          <select value={filters.sector} onChange={e => handleFilter('sector', e.target.value)}>
            <option value="">{t(lang, 'allSectors')}</option>
            {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.rating} onChange={e => handleFilter('rating', e.target.value)}>
            <option value="">{t(lang, 'allRatings')}</option>
            {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filters.minScore} onChange={e => handleFilter('minScore', e.target.value)}>
            <option value="">{t(lang, 'minScore')}</option>
            <option value="8">8+</option>
            <option value="7">7+</option>
            <option value="6">6+</option>
            <option value="5">5+</option>
          </select>
          {hasFilters && (
            <button className="clear-btn" onClick={clearFilters} title={t(lang, 'clear')}>
              <X size={16} />
            </button>
          )}
        </div>

        {error && (
          <DataErrorState lang={lang} size={140} message={t(lang, 'loadError')} retry={() => fetchScreen()} />
        )}

        <div className="result-list">
          {loading ? (
            <div className="loading-row"><TriLoader compact /></div>
          ) : stocks.length === 0 ? (
            <div className="empty">
              <Filter size={22} />
              <span>{t(lang, 'noResults')}</span>
              <span className="empty-sub">{t(lang, 'emptySub')}</span>
              {hasFilters && (
                <button className="clear-btn-lg" onClick={clearFilters}>{t(lang, 'clear')}</button>
              )}
            </div>
          ) : stocks.map((s, idx) => (
            <div key={s.company_id || idx} className="result-row" onClick={() => router.push(`/company?id=${s.company_id}`)}>
              <div className="rr-rank">{idx + 1}</div>
              <div className="rr-logo">
                {s.logo_url ? <img src={s.logo_url} alt="" onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)} onError={onLogoError} /> : null}
              </div>
              <div className="rr-symbol">{s.symbol}</div>
              <div className="rr-info">
                <span className="rr-sector">{s.sector}</span>
                <span className={`rr-rating good`}>{s.rating}</span>
              </div>
              <div className="rr-right">
                <div className="rr-score">{s.score != null ? s.score.toFixed(1) : '—'}</div>
                <div className="rr-pe">PE {s.pe_ratio != null ? s.pe_ratio.toFixed(1) : '—'}</div>
              </div>
            </div>
          ))}
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
        .sc-header {
          display: flex; align-items: center; justify-content: space-between; height: 60px;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .sc-title { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .sc-title span:first-child { font-size: 17px; font-weight: 700; }
        .sc-count { font-size: 11px; color: #9AA3B2; }
        .filters { display: flex; gap: 8px; margin-bottom: 14px; }
        .filters select {
          flex: 1; min-width: 0;
          height: 40px; padding: 0 10px;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #fff; font-size: 12px; font-family: inherit;
          outline: none; cursor: pointer;
        }
        .clear-btn {
          width: 40px; height: 40px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #ff9d9d; cursor: pointer;
        }
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
        .result-list { display: flex; flex-direction: column; padding-bottom: 16px; }
        .result-row {
          display: flex; align-items: center; gap: 10px;
          min-height: 58px; padding: 8px 4px; cursor: pointer;
          border-bottom: 1px solid #1a1a1a;
        }
        .rr-rank { font-size: 12px; color: #9AA3B2; width: 22px; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .rr-logo { width: 28px; height: 28px; border-radius: 50%; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .rr-logo img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
        .rr-symbol { font-size: 18px; font-weight: 700; color: #F8F8FA; width: 74px; }
        .rr-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .rr-sector { font-size: 14px; color: #9AA3B2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rr-rating { font-size: 10px; font-weight: 600; align-self: flex-start; padding: 1px 7px; border-radius: 9px; color: #18C27C; background: rgba(24,194,124,0.12); }
        .rr-right { text-align: right; display: flex; flex-direction: column; gap: 2px; }
        .rr-score { font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; color: #8E95A3; }
        .rr-pe { font-size: 14px; color: #9AA3B2; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .loading-row { display: flex; justify-content: center; padding: 40px; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #262626; border-top-color: #8b5cf6;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 48px 20px; color: #6B7A94; font-size: 14px;
        }
        .empty-sub { font-size: 12px; color: #6B7A94; }
        .clear-btn-lg {
          margin-top: 6px; background: #8b5cf6; border: none; border-radius: 12px;
          color: #fff; padding: 9px 18px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
      `}</style>
    </div>
  )
}
