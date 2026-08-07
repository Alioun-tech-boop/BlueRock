import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import NewsThumb from '../components/NewsThumb'
import { getCompanies, getMarketOverview, getMarketSparklines, getMarketNews, getNewsArticle } from '../services/api'
import { t, detectLang, fmtPrice, timeAgo } from '../lib/i18n'
import { Newspaper, Calendar, Briefcase, BarChart3, TrendingUp, DollarSign, AlertTriangle, RefreshCw, ExternalLink, X, Loader2, Compass } from 'lucide-react'

const sectorInfo = {
  Banque: { icon: BarChart3, color: '#3b82f6' },
  'Services Financiers': { icon: BarChart3, color: '#3b82f6' },
  Télécommunications: { icon: TrendingUp, color: '#8b5cf6' },
  Pétrolier: { icon: DollarSign, color: '#f59e0b' },
  Énergie: { icon: DollarSign, color: '#f59e0b' },
  Agroalimentaire: { icon: BarChart3, color: '#10b981' },
  'Consommation de Base': { icon: BarChart3, color: '#10b981' },
  'Consommation Discrétionnaire': { icon: TrendingUp, color: '#ec4899' },
  Industriels: { icon: TrendingUp, color: '#06b6d4' },
  'Services Publics': { icon: BarChart3, color: '#facc15' },
}

const tabs = () => [
  { key: 'overview', label: t('overview') },
  { key: 'stocks', label: t('stocks') },
  { key: 'announcements', label: t('news') },
]

function fmt(n, lang) {
  return fmtPrice(lang, n, 0)
}

function Sparkline({ series, up }) {
  if (!series || series.length < 2) return <div className="gc-empty" />
  const points = series.slice(-25)
  const h = 54; const w = 96
  const max = Math.max(...points); const min = Math.min(...points)
  const r = h / (max - min || 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (points.length - 1)) * w} ${h - (p - min) * r}`).join(' ')
  const area = `${d} L${w} ${h} L0 ${h} Z`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={up ? '#18C27C' : '#F04438'} strokeWidth={2} />
      <path d={area} fill={up ? 'rgba(24,194,124,0.15)' : 'rgba(240,68,56,0.15)'} />
    </svg>
  )
}

export default function Explorer() {
  const router = useRouter()
  const [lang] = useState(() => detectLang())
  const [activeTab, setActiveTab] = useState('overview')
  const [companies, setCompanies] = useState([])
  const [indices, setIndices] = useState({})
  const [gainers, setGainers] = useState([])
  const [losers, setLosers] = useState([])
  const [sparklines, setSparklines] = useState({})
  const [news, setNews] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [article, setArticle] = useState(null)
  const [articleLoading, setArticleLoading] = useState(false)
  const [articleError, setArticleError] = useState('')

  const openArticle = (item) => {
    setArticle(item)
    setArticleLoading(true)
    setArticleError('')
    getNewsArticle(item.url)
      .then(r => {
        setArticle(prev => prev ? { ...prev, content: r.data.content || [], articleTitle: r.data.title, summary: r.data.summary || '' } : prev)
        setArticleLoading(false)
      })
      .catch(() => {
        setArticleError(t('newsReadError'))
        setArticleLoading(false)
      })
  }

  const closeArticle = () => {
    setArticle(null)
    setArticleError('')
    setArticleLoading(false)
  }

  const load = () => {
    setError('')
    setLoading(true)
    Promise.all([
      getCompanies({ limit: 47 }).then(r => setCompanies(r.data.companies || [])).catch(() => {}),
      getMarketOverview().then(r => {
        setIndices(r.data.indices || {})
        setGainers(r.data.gainers || [])
        setLosers(r.data.losers || [])
      }).catch(() => {}),
      getMarketSparklines(30).then(r => setSparklines(r.data || {})).catch(() => {}),
      getMarketNews(500).then(r => setNews(r.data.items || [])).catch(() => {}),
    ]).catch(() => setError(t('loadError'))).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) load() }, 300000)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const grouped = {}
  companies.forEach(c => {
    if (!grouped[c.sector]) grouped[c.sector] = []
    grouped[c.sector].push(c)
  })

  const gridItems = Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([sector, stocks]) => {
    const series = []
    const len = Math.min(...stocks.map(s => (sparklines[s.id] || []).length))
    if (len > 1) {
      for (let i = 0; i < len; i++) {
        const vals = stocks.map(s => sparklines[s.id][i]).filter(v => v != null)
        series.push(vals.reduce((a, b) => a + b, 0) / vals.length)
      }
    }
    return {
      name: sector,
      count: stocks.length,
      change: stocks.reduce((sum, s) => sum + (s.change_percent || 0), 0) / (stocks.length || 1),
      color: sectorInfo[sector]?.color || '#666',
      series,
    }
  })

  const T = tabs()

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <h1 className="explorer-title">{t('explorer')}</h1>

        {error && (
          <div className="error-bar">
            <AlertTriangle size={14} color="#F04438" />
            <span>{error}</span>
            <button onClick={load} className="retry-btn"><RefreshCw size={13} /></button>
          </div>
        )}

        <div className="action-buttons">
          <button className="action-btn" onClick={() => { setActiveTab('announcements'); document.querySelector('.news-section')?.scrollIntoView({ behavior: 'smooth' }) }}>
            <Newspaper size={28} color="#fff" />
            <span>{t('announcements')}</span>
          </button>
          <button className="action-btn" onClick={() => router.push('/calendar')}>
            <Calendar size={28} color="#fff" />
            <span>{t('calendar')}</span>
          </button>
          <button className="action-btn" onClick={() => router.push('/brokers')}>
            <Briefcase size={28} color="#fff" />
            <span>{t('brokers')}</span>
          </button>
          <button className="action-btn plan-btn" onClick={() => router.push('/patrimoine')}>
            <Compass size={28} color="#18C27C" />
            <span>{t('premiumTitle')}</span>
          </button>
        </div>

        <div className="tabs-strip">
          {T.map(({ key, label }) => (
            <button
              key={key}
              className={`tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="indices-strip">
              {[
                { name: 'BRVM Composite', value: indices.brvm_composite, change: indices.brvm_composite_change },
                { name: 'BRVM 30', value: indices.brvm_30, change: indices.brvm_30_change },
                { name: 'BRVM Prestige', value: indices.brvm_prestige, change: indices.brvm_prestige_change },
              ].map((idx, i) => (
                <div key={i} className="index-card">
                  <span className="idx-name">{idx.name}</span>
                  <span className="idx-val">{idx.value?.toFixed(2) || '—'}</span>
                  <span className={`idx-chg ${(idx.change || 0) >= 0 ? 'up' : 'down'}`}>
                    {(idx.change || 0) >= 0 ? '+' : ''}{(idx.change || 0).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>

            <div className="grid-2">
              {gridItems.map((item, i) => (
                <div key={i} className="grid-card" onClick={() => router.push(`/screen?sector=${encodeURIComponent(item.name)}`)}>
                  <div className="gc-top">
                    <div className="gc-dot" style={{ background: item.color }} />
                    <span className="gc-name">{item.name}</span>
                  </div>
                  <div className="gc-value">
                    {item.count} {t('companies')}
                  </div>
                  <div className={`gc-chg ${item.change >= 0 ? 'up' : 'down'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}% {t('today')}
                  </div>
                  <div className="gc-chart">
                    <Sparkline series={item.series} up={item.change >= 0} />
                  </div>
                </div>
              ))}
            </div>

            <div className="section-title">{t('stocks')}</div>
            <div className="topflop-section vertical">
              <div className="topflop-col">
                <div className="topflop-header top">Top 5</div>
                {gainers.map((s, i) => (
                  <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                    <span className="tf-logo">{s.logo_url ? <img src={s.logo_url} alt="" /> : null}</span>
                    <span className="tf-symbol">{s.symbol}</span>
                    <span className="tf-price">{fmt(s.close_price, lang)}</span>
                    <span className="tf-chg up">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
              <div className="topflop-col">
                <div className="topflop-header flop">Flop 5</div>
                {losers.map((s, i) => (
                  <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                    <span className="tf-logo">{s.logo_url ? <img src={s.logo_url} alt="" /> : null}</span>
                    <span className="tf-symbol">{s.symbol}</span>
                    <span className="tf-price">{fmt(s.close_price, lang)}</span>
                    <span className="tf-chg down">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-title">{t('announcements')}</div>
            <div className="news-section">
              {loading && !news.length && <div className="news-empty">{t('loading')}</div>}
              {!loading && !news.length && (
                <div className="news-empty">{t('newsEmpty')}</div>
              )}
              {news.filter(n => n.category === 'Société').length > 0 && (
                <>
                  <div className="news-group-title societes">{t('newsSocietes')}</div>
                  {news.filter(n => n.category === 'Société').slice(0, 8).map((item, i) => (
                    <button key={`s${i}`} className="news-item" onClick={() => openArticle(item)}>
                      <div className="news-row">
                        <NewsThumb image={item.image} label={item.source} size={62} />
                        <div className="news-text">
                          <div className="news-meta">
                            <span className="news-src societe">{item.source}</span>
                            <span className="dot">·</span>
                            <span>{timeAgo(detectLang(), item.date)}</span>
                          </div>
                          <div className="news-title">{item.title}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {news.filter(n => n.category === 'BRVM').length > 0 && (
                <>
                  <div className="news-group-title">{t('newsBRVM')}</div>
                  {news.filter(n => n.category === 'BRVM').map((item, i) => (
                    <button key={`b${i}`} className="news-item" onClick={() => openArticle(item)}>
                      <div className="news-row">
                        <NewsThumb image={item.image} label={item.source} size={62} />
                        <div className="news-text">
                          <div className="news-meta">
                            <span className="badge-official">{t('newsOfficial')}</span>
                            <span className="dot">·</span>
                            <span>{timeAgo(detectLang(), item.date)}</span>
                          </div>
                          <div className="news-title">{item.title}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {news.filter(n => n.category === 'Presse').length > 0 && (
                <>
                  <div className="news-group-title">{t('newsPresse')}</div>
                  {news.filter(n => n.category === 'Presse').slice(0, 8).map((item, i) => (
                    <button key={`p${i}`} className="news-item" onClick={() => openArticle(item)}>
                      <div className="news-row">
                        <NewsThumb image={item.image} label={item.source} size={62} />
                        <div className="news-text">
                          <div className="news-meta">
                            <span className="news-src">{item.source}</span>
                            <span className="dot">·</span>
                            <span>{timeAgo(detectLang(), item.date)}</span>
                          </div>
                          <div className="news-title">{item.title}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {activeTab === 'stocks' && (
          <div className="topflop-section vertical">
            <div className="topflop-col">
              <div className="topflop-header top">Top 5</div>
              {gainers.map((s, i) => (
                <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                  <span className="tf-logo">{s.logo_url ? <img src={s.logo_url} alt="" /> : null}</span>
                  <span className="tf-symbol">{s.symbol}</span>
                  <span className="tf-price">{fmt(s.close_price, lang)}</span>
                  <span className="tf-chg up">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                </div>
              ))}
            </div>
            <div className="topflop-col">
              <div className="topflop-header flop">Flop 5</div>
              {losers.map((s, i) => (
                <div key={i} className="topflop-row" onClick={() => router.push(`/quote?symbol=${s.symbol}`)}>
                  <span className="tf-logo">{s.logo_url ? <img src={s.logo_url} alt="" /> : null}</span>
                  <span className="tf-symbol">{s.symbol}</span>
                  <span className="tf-price">{fmt(s.close_price, lang)}</span>
                  <span className="tf-chg down">{s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="news-section">
            <div className="news-header">
              <span>{t('news')}</span>
            </div>
            {loading && !news.length && <div className="news-empty">{t('loading')}</div>}
            {!loading && !news.length && (
              <div className="news-empty">{t('newsEmpty')}</div>
            )}
            {news.filter(n => n.category === 'Société').length > 0 && (
              <>
                <div className="news-group-title societes">{t('newsSocietes')}</div>
                {news.filter(n => n.category === 'Société').slice(0, 15).map((item, i) => (
                  <button key={`s${i}`} className="news-item" onClick={() => openArticle(item)}>
                    <div className="news-row">
                      <NewsThumb image={item.image} label={item.source} size={62} />
                      <div className="news-text">
                        <div className="news-meta">
                          <span className="news-src societe">{item.source}</span>
                          <span className="dot">·</span>
                          <span>{timeAgo(detectLang(), item.date)}</span>
                        </div>
                        <div className="news-title">{item.title}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
            {news.filter(n => n.category === 'BRVM').length > 0 && (
              <>
                <div className="news-group-title">{t('newsBRVM')}</div>
                {news.filter(n => n.category === 'BRVM').map((item, i) => (
                  <button key={`b${i}`} className="news-item" onClick={() => openArticle(item)}>
                    <div className="news-row">
                      <NewsThumb image={item.image} label={item.source} size={62} />
                      <div className="news-text">
                        <div className="news-meta">
                          <span className="badge-official">{t('newsOfficial')}</span>
                          <span className="dot">·</span>
                          <span>{timeAgo(detectLang(), item.date)}</span>
                        </div>
                        <div className="news-title">{item.title}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
            {news.filter(n => n.category === 'Presse').length > 0 && (
              <>
                <div className="news-group-title">{t('newsPresse')}</div>
                {news.filter(n => n.category === 'Presse').slice(0, 15).map((item, i) => (
                  <button key={`p${i}`} className="news-item" onClick={() => openArticle(item)}>
                    <div className="news-row">
                      <NewsThumb image={item.image} label={item.source} size={62} />
                      <div className="news-text">
                        <div className="news-meta">
                          <span className="news-src">{item.source}</span>
                          <span className="dot">·</span>
                          <span>{timeAgo(detectLang(), item.date)}</span>
                        </div>
                        <div className="news-title">{item.title}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {article && (
          <div className="article-overlay" onClick={closeArticle}>
            <div className="article-modal" onClick={e => e.stopPropagation()}>
              <div className="article-top">
                <span className="article-src">{(article.source || '').toUpperCase()}</span>
                <button className="article-close" onClick={closeArticle} aria-label={t('close')}>
                  <X size={18} />
                </button>
              </div>
              <div className="article-body">
                <h2 className="article-title">{article.articleTitle || article.title}</h2>
                {article.image && (
                  <img className="article-cover" src={article.image} alt="" onError={e => e.target.style.display = 'none'} />
                )}
                {articleLoading && (
                  <div className="article-loading">
                    <Loader2 size={18} className="spin" />
                    <span>{t('newsLoading')}</span>
                  </div>
                )}
                {!articleLoading && articleError && (
                  <div className="article-fallback">
                    <AlertTriangle size={16} color="#f59e0b" />
                    <p>{articleError}</p>
                  </div>
                )}
                {!articleLoading && !articleError && article.summary && (
                  <div className="article-summary">{article.summary}</div>
                )}
                {!articleLoading && !articleError && (article.content || []).map((p, i) => (
                  <p key={i} className="article-para">{p}</p>
                ))}
                <a className="article-open" href={article.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  <span>{t('newsOpenSource')}</span>
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
      <BottomNav active="explorer" />
      <style jsx>{`
        .mobile-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0E1627;
          color: #fff;
          font-family: Inter, -apple-system, sans-serif;
          overflow: hidden;
        }
        .safe-area {
          flex: 1;
          overflow-y: auto;
          padding: 0 16px 8px;
        }
        .safe-area::-webkit-scrollbar { display: none; }
        .explorer-title {
          font-size: 44px;
          font-weight: 700;
          margin: 18px 0;
          letter-spacing: 0.25px;
        }
        .error-bar {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 13px 15px;
          background: #261010;
          border: 1px solid #F0443855;
          border-radius: 14px;
          font-size: 15px;
          color: #f0b4b4;
          margin-bottom: 16px;
        }
        .retry-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: #F04438;
          cursor: pointer;
          padding: 2px;
        }
        .action-buttons {
          display: flex;
          gap: 12px;
          margin-bottom: 22px;
        }
        .action-btn {
          flex: 1;
          height: 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #262626;
          border: none;
          border-radius: 20px;
          color: #fff;
          font-size: 15px;
          cursor: pointer;
          font-family: inherit;
          text-decoration: none;
        }
        .action-btn:hover { background: #333; }
        .action-btn.plan-btn {
          background: linear-gradient(160deg, rgba(24,194,124,0.16), rgba(139,92,246,0.12));
          border: 1px solid rgba(24,194,124,0.35);
        }
        .action-btn.plan-btn:hover { background: linear-gradient(160deg, rgba(24,194,124,0.26), rgba(139,92,246,0.2)); }
        .tabs-strip {
          display: flex;
          gap: 10px;
          margin-bottom: 18px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .tabs-strip::-webkit-scrollbar { display: none; }
        .tab-btn {
          padding: 10px 20px;
          background: none;
          border: none;
          border-radius: 17px;
          color: #666;
          font-size: 16px;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
        }
        .tab-btn.active {
          background: #262626;
          color: #fff;
        }
        .indices-strip {
          display: flex;
          gap: 12px;
          margin-bottom: 18px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .indices-strip::-webkit-scrollbar { display: none; }
        .index-card {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 15px 17px;
          background: #1B1B1B;
          border-radius: 18px;
          min-width: 150px;
          flex-shrink: 0;
        }
        .idx-name { font-size: 13.5px; color: #9AA3B2; }
        .idx-val { font-size: 18px; font-weight: 700; color: #8E95A3; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .idx-chg { font-size: 16px; font-weight: 500; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .idx-chg.up { color: #18C27C; }
        .idx-chg.down { color: #F04438; }
        .topflop-section {
          display: flex;
          gap: 14px;
          margin-bottom: 22px;
        }
        .topflop-section.vertical {
          flex-direction: column;
        }
        .topflop-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 17px;
          background: #141414;
          border-radius: 20px;
        }
        .topflop-header {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 3px;
        }
        .topflop-header.top { color: #18C27C; }
        .topflop-header.flop { color: #F04438; }
        .topflop-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          font-size: 14px;
          cursor: pointer;
          padding: 4px 0;
        }
        .tf-symbol { font-weight: 700; color: #F8F8FA; }
        .tf-logo { width: 28px; height: 28px; border-radius: 50%; background: #1e1e1e; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .tf-logo img { width: 100%; height: 100%; object-fit: cover; }
        .tf-price { color: #8E95A3; font-weight: 700; }
        .tf-chg { font-weight: 500; font-size: 16px; }
        .tf-chg.up { color: #18C27C; }
        .tf-chg.down { color: #F04438; }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 22px;
        }
        .grid-card {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 17px;
          background: #141414;
          border-radius: 20px;
          cursor: pointer;
        }
        .grid-card:hover { background: #1c1c1c; }
        .gc-top {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .gc-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
        }
        .gc-name { font-size: 13.5px; color: #9AA3B2; }
        .gc-value { font-size: 24px; font-weight: 700; color: #F8F8FA; }
        .gc-chg { font-size: 16px; font-weight: 500; }
        .gc-chg.up { color: #18C27C; }
        .gc-chg.down { color: #F04438; }
        .gc-chart { margin-top: 5px; }
        .gc-empty { height: 45px; }
        .section-title {
          font-size: 18px;
          font-weight: 700;
          margin: 10px 0 14px;
          letter-spacing: 0.25px;
        }
        .news-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-bottom: 18px;
        }
        .news-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 18px;
          font-weight: 600;
        }
        .news-group-title {
          font-size: 13px;
          font-weight: 600;
          color: #9AA3B2;
          margin: 16px 0 5px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .news-group-title.societes { color: #D4A843; }
        .badge-official {
          font-size: 11px;
          font-weight: 700;
          color: #18C27C;
          background: rgba(24,194,124,0.12);
          padding: 3px 9px;
          border-radius: 10px;
        }
        .news-src { font-size: 13px; color: #8b5cf6; font-weight: 600; }
        .news-src.societe { color: #D4A843; }
        .news-empty {
          padding: 26px 0;
          text-align: center;
          color: #666;
          font-size: 15px;
        }
        .news-item {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 11px 0;
          border: none;
          border-bottom: 1px solid #1a1a1a;
          background: none;
          text-align: left;
          text-decoration: none;
          color: #fff;
          font-family: inherit;
          cursor: pointer;
          width: 100%;
        }
        .news-item:active { opacity: 0.7; }
        .news-row {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
        }
        .news-text { flex: 1; min-width: 0; }
        .news-meta {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          color: #9AA3B2;
        }
        .dot { color: #333; }
        .news-title {
          font-size: 16px;
          font-weight: 500;
          line-height: 1.35;
        }
        .article-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          z-index: 90;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .article-modal {
          width: 100%;
          max-width: 480px;
          max-height: 82vh;
          background: #141414;
          border-radius: 20px 20px 0 0;
          display: flex;
          flex-direction: column;
          animation: sheetUp 0.22s ease;
        }
        @keyframes sheetUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .article-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 16px 0;
        }
        .article-src {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #8b5cf6;
        }
        .article-close {
          background: #262626;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .article-body {
          overflow-y: auto;
          padding: 16px 20px 30px;
        }
        .article-body::-webkit-scrollbar { display: none; }
        .article-title {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.35;
          margin: 5px 0 14px;
        }
        .article-cover {
          width: 100%;
          max-height: 240px;
          object-fit: cover;
          border-radius: 14px;
          margin: 0 0 14px;
        }
        .article-loading {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #9AA3B2;
          font-size: 15px;
          padding: 22px 0;
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .article-fallback {
          display: flex;
          gap: 11px;
          align-items: flex-start;
          background: #221a08;
          border: 1px solid #f59e0b33;
          border-radius: 14px;
          padding: 14px;
          font-size: 15px;
          color: #e8d9b5;
          margin: 9px 0;
        }
        .article-fallback p { margin: 0; }
        .article-summary {
          background: #1d1d1d;
          border-left: 3px solid #8b5cf6;
          border-radius: 12px;
          padding: 14px;
          font-size: 15px;
          color: #d6d6d6;
          line-height: 1.35;
          margin-bottom: 16px;
        }
        .article-para {
          font-size: 16px;
          line-height: 1.35;
          color: #e5e5e5;
          margin: 0 0 14px;
        }
        .article-open {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-top: 8px;
          padding: 12px 16px;
          background: #262626;
          border: 1px solid #333;
          border-radius: 14px;
          color: #fff;
          font-size: 15px;
          text-decoration: none;
        }
      `}</style>
    </div>
  )
}
