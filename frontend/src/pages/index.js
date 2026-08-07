import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import NewsThumb from '../components/NewsThumb'
import { getMarketOverview, getTopPerformers, getMarketNews } from '../services/api'
import { Search, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react'
import { t, detectLang, fmtPrice, fmtCompact, timeAgo } from '../lib/i18n'

function fmtCap(n, lang) {
  if (!n) return 'ÔÇö'
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T'
  return fmtCompact(lang, n)
}

export default function Home() {
  const router = useRouter()
  const [lang] = useState(() => detectLang())
  const [data, setData] = useState(null)
  const [performers, setPerformers] = useState([])
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = (initial = false) => {
    if (initial) setLoading(true)
    setError('')
    Promise.all([getMarketOverview(), getTopPerformers(), getMarketNews(12)])
      .then(([m, p, n]) => { setData(m.data); setPerformers(p.data); setNews(n.data.items || []) })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData(true) }, [])

  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) fetchData(false) }, 300000)
    const onVis = () => { if (!document.hidden) fetchData(false) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  if (loading && !data) {
    return (
      <div className="mobile-root">
        <div className="loading-area">
          <div className="spinner" />
          <span>{t('loading')}</span>
        </div>
        <BottomNav active="watchlist" />
        <style jsx>{`
          .mobile-root {
            display: flex; flex-direction: column; height: 100vh;
            background: #0E1627; color: #fff;
            font-family: Inter, -apple-system, sans-serif;
          }
          .loading-area {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 12px;
            color: #9AA3B2; font-size: 14px;
          }
          .spinner {
            width: 28px; height: 28px;
            border: 3px solid #262626; border-top-color: #8b5cf6;
            border-radius: 50%; animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  const indices = data?.indices || {}
  const stocks = data?.stocks || []
  const gainers = data?.gainers || []
  const losers = data?.losers || []
  const sectors = data?.sectors || {}

  const indicesList = [
    { name: 'BRVM Composite', value: indices.brvm_composite, change: indices.brvm_composite_change },
    { name: 'BRVM 30', value: indices.brvm_30, change: indices.brvm_30_change },
    { name: 'BRVM Prestige', value: indices.brvm_prestige, change: indices.brvm_prestige_change },
  ]

  const sectorItems = Object.entries(sectors)
    .sort((a, b) => Math.abs(b[1].change) - Math.abs(a[1].change))
    .slice(0, 6)

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="hm-header">
          <div className="hm-brand">
            <span className="hm-logo">BLUEROCK</span>
            <span className="hm-sub">BRVM ┬À {indices.date || 'ÔÇö'}</span>
          </div>
          <div className="hm-actions">
            <button className="icon-btn" onClick={() => router.push('/companies')}>
              <Search size={20} />
            </button>
            <button className="icon-btn" onClick={() => fetchData()}>
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {error && (
          <div className="error-bar">
            <AlertTriangle size={14} color="#F04438" />
            <span>{error}</span>
            <button onClick={() => fetchData()} className="retry-btn"><RefreshCw size={13} /></button>
          </div>
        )}

        <div className="indices-strip">
          {indicesList.map((idx, i) => (
            <div key={i} className="index-card">
              <span className="idx-name">{idx.name}</span>
              <span className="idx-val">{idx.value?.toFixed(2) || 'ÔÇö'}</span>
              <span className={`idx-chg ${(idx.change || 0) >= 0 ? 'up' : 'down'}`}>
                {(idx.change || 0) >= 0 ? '+' : ''}{(idx.change || 0).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>

        <div className="market-stats">
          <div className="stat-box">
            <span className="sb-label">{t('marketCap')}</span>
            <span className="sb-value">{fmtCap(indices.market_cap, lang)}</span>
          </div>
          <div className="stat-box">
            <span className="sb-label">{t('volume')}</span>
            <span className="sb-value">{fmtCompact(lang, indices.volume_total)}</span>
          </div>
          <div className="stat-box">
            <span className="sb-label">{t('advancers')}</span>
            <span className="sb-value up">+{indices.up_count ?? 0}</span>
          </div>
          <div className="stat-box">
            <span className="sb-label">{t('decliners')}</span>
            <span className="sb-value down">{indices.down_count ?? 0}</span>
          </div>
        </div>

        <div className="section-header">
          <span>{t('market')}</span>
          <span className="arrow">{stocks.length} {t('companies')}</span>
        </div>

        <div className="stock-list">
          {stocks.slice(0, 12).map(s => {
            const chg = s.change_percent || 0
            const up = chg >= 0
            return (
              <div key={s.id} className="stock-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                <div className="stock-logo" style={{ background: `hsl(${(s.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                  {s.logo_url ? <img src={s.logo_url} alt={s.symbol} className="stock-logo-img" /> : s.symbol?.[0]}
                </div>
                <div className="stock-info">
                  <div className="stock-name">{s.symbol}</div>
                  <div className="stock-sub">{s.company_name?.substring(0, 28)}</div>
                </div>
                <div className="stock-right">
                  <div className="stock-price">{fmtPrice(lang, s.close_price ?? s.current_price, 0)}</div>
                  <div className={`stock-chg ${up ? 'up' : 'down'}`}>
                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="topflop-section">
          <div className="topflop-col">
            <div className="topflop-header top">{t('top5')}</div>
            {gainers.length ? gainers.slice(0, 5).map((s, i) => (
              <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                <span className="tf-logo">{s.logo_url ? <img src={s.logo_url} alt="" /> : null}</span>
                <span className="tf-symbol">{s.symbol}</span>
                <span className="tf-price">{fmtPrice(lang, s.close_price, 0)}</span>
                <span className="tf-chg up">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
              </div>
            )) : <span className="tf-empty">ÔÇö</span>}
          </div>
          <div className="topflop-col">
            <div className="topflop-header flop">{t('flop5')}</div>
            {losers.length ? losers.slice(0, 5).map((s, i) => (
              <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                <span className="tf-logo">{s.logo_url ? <img src={s.logo_url} alt="" /> : null}</span>
                <span className="tf-symbol">{s.symbol}</span>
                <span className="tf-price">{fmtPrice(lang, s.close_price, 0)}</span>
                <span className="tf-chg down">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
              </div>
            )) : <span className="tf-empty">ÔÇö</span>}
          </div>
        </div>

        <div className="section-header">
          <span>{t('news')}</span>
          <span className="arrow" onClick={() => router.push('/explorer')}>{t('all')} {'>'}</span>
        </div>

        <div className="news-list">
          {news.length === 0 && <div className="news-empty">{t('newsEmpty')}</div>}
          {news.slice(0, 5).map((item, i) => (
            <a key={i} className="news-row" href={item.url} target="_blank" rel="noopener noreferrer">
              <NewsThumb image={item.image} label={item.source} size={48} radius={8} />
              <div className="news-text">
                <div className="news-meta">
                  <span className={`news-badge ${item.category === 'BRVM' ? 'official' : ''}`}>
                    {item.category === 'BRVM' ? t('newsOfficial') : item.source}
                  </span>
                  <span className="news-time">{timeAgo(lang, item.date)}</span>
                  <ExternalLink size={11} />
                </div>
                <div className="news-title">{item.title}</div>
              </div>
            </a>
          ))}
        </div>

        <div className="section-header">
          <span>{t('sectors')}</span>
          <span className="arrow" onClick={() => router.push('/explorer')}>{t('all')} {'>'}</span>
        </div>

        <div className="grid-2">
          {sectorItems.map(([name, sdata]) => {
            const up = sdata.change >= 0
            return (
              <div key={name} className="grid-card" onClick={() => router.push(`/screen?sector=${encodeURIComponent(name)}`)}>
                <div className="gc-top">
                  <span className="gc-name">{name}</span>
                </div>
                <div className="gc-value">{sdata.companies} {t('companies')}</div>
                <div className={`gc-chg ${up ? 'up' : 'down'}`}>
                  {up ? '+' : ''}{sdata.change.toFixed(2)}%
                </div>
              </div>
            )
          })}
        </div>

        <div className="section-header">
          <span>{t('bestScores')}</span>
        </div>
        <div className="perf-list">
          {performers.slice(0, 5).map((p, i) => (
            <div key={p.symbol || i} className="perf-row" onClick={() => router.push(`/company?id=${p.company_id}`)}>
              <span className="perf-logo">{p.logo_url ? <img src={p.logo_url} alt="" /> : null}</span>
              <span className="perf-symbol">{p.symbol}</span>
              <span className="perf-rating">{p.rating}</span>
              <span className={`perf-score ${p.total_score >= 7 ? 'up' : p.total_score >= 5 ? 'mid' : 'down'}`}>
                {p.total_score?.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <BottomNav active="watchlist" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #0E1627; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area {
          flex: 1; overflow-y: auto; padding: 0 16px 8px;
        }
        .safe-area::-webkit-scrollbar { display: none; }
        .hm-header {
          display: flex; align-items: center; justify-content: space-between;
          height: 60px; margin-bottom: 8px;
        }
        .hm-brand { display: flex; flex-direction: column; gap: 1px; }
        .hm-logo {
          font-size: 27px; font-weight: 800; letter-spacing: 2px; line-height: 1;
          font-family: Inter, -apple-system, sans-serif;
        }
        .hm-sub { font-size: 11px; color: #9AA3B2; }
        .hm-actions { display: flex; gap: 4px; }
        .error-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px; background: #261010;
          border: 1px solid #F0443855; border-radius: 12px;
          font-size: 13px; color: #f0b4b4; margin-bottom: 12px;
        }
        .retry-btn { margin-left: auto; background: none; border: none; color: #F04438; cursor: pointer; padding: 2px; }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .indices-strip {
          display: flex; gap: 10px; margin-bottom: 12px;
          overflow-x: auto; padding-bottom: 4px;
        }
        .indices-strip::-webkit-scrollbar { display: none; }
        .index-card {
          display: flex; flex-direction: column; gap: 2px;
          padding: 12px 14px; background: #1B1B1B; border-radius: 16px;
          min-width: 130px; flex-shrink: 0;
        }
        .idx-name { font-size: 12px; color: #9AA3B2; }
        .idx-val { font-size: 18px; font-weight: 700; color: #8E95A3; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .idx-chg { font-size: 15px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .idx-chg.up { color: #18C27C; }
        .idx-chg.down { color: #F04438; }
        .market-stats {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px;
        }
        .stat-box {
          display: flex; flex-direction: column; gap: 3px;
          padding: 10px 8px; background: #141414; border-radius: 14px;
        }
        .sb-label { font-size: 10px; color: #9AA3B2; white-space: nowrap; }
        .sb-value { font-size: 13px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sb-value.up { color: #18C27C; }
        .sb-value.down { color: #F04438; }
        .section-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px; font-size: 18px; font-weight: 600;
        }
        .arrow { font-size: 12px; color: #9AA3B2; cursor: pointer; }
        .stock-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
        .stock-row {
          display: flex; align-items: center; gap: 12px; height: 68px;
          cursor: pointer; padding: 0 4px;
        }
        .stock-logo {
          width: 44px; height: 44px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 17px; flex-shrink: 0;
          overflow: hidden;
        }
        .stock-logo-img { width: 100%; height: 100%; object-fit: cover; }
        .stock-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .stock-name { font-size: 18px; font-weight: 700; color: #F8F8FA; }
        .stock-sub { font-size: 14px; color: #9AA3B2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stock-right { text-align: right; display: flex; flex-direction: column; gap: 5px; }
        .stock-price { font-size: 18px; font-weight: 700; color: #8E95A3; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .stock-chg { font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .stock-chg.up { color: #18C27C; }
        .stock-chg.down { color: #F04438; }
        .topflop-section { display: flex; gap: 12px; margin-bottom: 20px; }
        .topflop-col {
          flex: 1; display: flex; flex-direction: column; gap: 8px;
          padding: 14px; background: #141414; border-radius: 18px;
        }
        .topflop-header { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
        .topflop-header.top { color: #18C27C; }
        .topflop-header.flop { color: #F04438; }
        .topflop-row {
          display: flex; align-items: center; justify-content: space-between;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 12px;
          cursor: pointer; padding: 2px 0;
        }
        .tf-symbol { font-weight: 700; color: #F8F8FA; }
        .tf-logo { width: 20px; height: 20px; border-radius: 50%; background: #1e1e1e; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; margin-right: -6px; }
        .tf-logo img { width: 100%; height: 100%; object-fit: cover; }
        .tf-price { color: #8E95A3; font-weight: 700; }
        .tf-chg { font-weight: 500; font-size: 15px; }
        .tf-chg.up { color: #18C27C; }
        .tf-chg.down { color: #F04438; }
        .tf-empty { font-size: 12px; color: #6B7A94; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .grid-card {
          display: flex; flex-direction: column; gap: 4px;
          padding: 14px; background: #141414; border-radius: 18px; cursor: pointer;
        }
        .gc-name { font-size: 12px; color: #9AA3B2; }
        .gc-value { font-size: 20px; font-weight: 700; color: #F8F8FA; }
        .gc-chg { font-size: 15px; font-weight: 500; }
        .gc-chg.up { color: #18C27C; }
        .gc-chg.down { color: #F04438; }
        .perf-list { display: flex; flex-direction: column; padding: 4px 0 16px; }
        .perf-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 4px; border-bottom: 1px solid #1a1a1a; cursor: pointer;
        }
        .perf-symbol { flex: 1; font-size: 14px; font-weight: 600; }
        .perf-logo { width: 26px; height: 26px; border-radius: 50%; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .perf-logo img { width: 100%; height: 100%; object-fit: cover; }
        .perf-rating { font-size: 11px; color: #9AA3B2; background: #262626; padding: 2px 8px; border-radius: 10px; }
        .perf-score { font-size: 15px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .perf-score.up { color: #18C27C; }
        .perf-score.mid { color: #facc15; }
        .perf-score.down { color: #F04438; }
        .news-list { display: flex; flex-direction: column; padding: 4px 0 16px; }
        .news-row {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 10px 4px; border-bottom: 1px solid #1a1a1a;
          text-decoration: none; color: #fff;
        }
        .news-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .news-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #9AA3B2; }
        .news-badge {
          font-size: 10px; font-weight: 700; color: #8b5cf6;
          background: rgba(139,92,246,0.12); padding: 2px 8px; border-radius: 9px;
          max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .news-badge.official { color: #18C27C; background: rgba(24,194,124,0.12); }
        .news-time { flex: 1; }
        .news-title { font-size: 13px; font-weight: 500; line-height: 1.35; }
        .news-empty { padding: 18px 0; text-align: center; color: #666; font-size: 13px; }
      `}</style>
    </div>
  )
}
