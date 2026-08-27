import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { t } from '../../lib/i18n'
import { getMarketOverview, getMarketSparklines } from '../../services/api'
import Sparkline from './Sparkline'

let cache = null
function loadMarket() {
  if (!cache) {
    cache = Promise.all([getMarketOverview(), getMarketSparklines(90)])
      .then(([ov, sp]) => {
        const data = sp.data || {}
        const map = { ...(data._meta || {}) }
        ;[...(ov.data.gainers || []), ...(ov.data.losers || [])].forEach(s => {
          if (s && s.symbol) map[s.symbol.toUpperCase()] = { ...map[s.symbol.toUpperCase()], ...s }
        })
        const series = {}
        Object.keys(data).forEach(k => {
          if (k !== '_meta' && Array.isArray(data[k]) && !series[k]) series[k] = data[k]
        })
        return { map, series }
      })
      .catch(() => ({ map: {}, series: {} }))
  }
  return cache
}

function fmtPrice(v, lang, cur) {
  if (v == null) return '—'
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
      style: 'currency', currency: cur || 'XOF', maximumFractionDigits: 2, minimumFractionDigits: 0,
    }).format(v)
  } catch {
    return `${v.toLocaleString('fr-FR')} ${cur || 'FCFA'}`
  }
}

export function useMarketData() {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    loadMarket().then(d => { if (alive) setData(d) })
    return () => { alive = false }
  }, [])
  return data
}

function initialsOf(name) {
  return (name || '?')?.charAt(0).toUpperCase() || '?'
}

export default function FinancialEmbed({ lang, symbol }) {
  const data = useMarketData()
  const [win, setWin] = useState(30)

  const key = (symbol || '').toUpperCase()
  if (!key) return null

  const row = data?.map?.[key]
  const spark = data?.series?.[key]
  if (!row && !spark) return null

  const up = (row?.change_percent ?? 0) >= 0
  const pts = spark && spark.length ? spark.slice(-win) : null
  const trend = pts && pts.length > 1
    ? ((pts[pts.length - 1] - pts[0]) / Math.max(Math.abs(pts[0]), 0.0001)) * 100
    : null
  const ranges = [
    { n: 1, l: lang === 'en' ? '1D' : '1J' },
    { n: 7, l: lang === 'en' ? '1W' : '1S' },
    { n: 30, l: '1M' },
    { n: 90, l: '3M' },
    { n: 365, l: lang === 'en' ? '1Y' : '1A' },
  ]

  return (
    <div className="fe-card">
      <div className="fe-head">
        <span className="fe-logo">
          {row?.logo_url
            ? <img src={row.logo_url} alt="" loading="lazy" />
            : <span style={{ background: `linear-gradient(135deg, #222226, #0e0e12)` }}>{initialsOf(row?.name || key)}</span>}
        </span>
        <span className="fe-id">
          <span className="fe-cname">{row?.name || key}</span>
          <span className="fe-sym">{key} · {t(lang, 'fePrice')}</span>
        </span>
        <span className={`fe-delta ${up ? 'up' : 'down'}`}>
          {row?.change_percent != null ? `${up ? '+' : ''}${row.change_percent.toFixed(2)}%` : '—'}
        </span>
      </div>

      <div className="fe-price-row">
        <span className="fe-price">{fmtPrice(row?.close_price ?? (pts && pts[pts.length - 1]), lang, row?.currency)}</span>
        {row?.change_percent != null && (
          <span className={`fe-chg ${up ? 'up' : 'down'}`}>
            {up ? '▲' : '▼'} {Math.abs(row.change_percent).toFixed(2)}%
          </span>
        )}
      </div>

      {pts && pts.length > 1 && (
        <div className="fe-chart">
          <Sparkline data={pts} w={560} h={64} stroke={up ? '#18C27C' : '#E11D48'} />
        </div>
      )}

      <div className="fe-ranges">
        {ranges.map(r => (
          <button key={r.n} className={`fe-range ${win === r.n ? 'on' : ''}`} onClick={() => setWin(r.n)}>
            {r.l}
          </button>
        ))}
      </div>

      <div className="fe-grid">
        <div className="fe-m"><span className="k">{t(lang, 'fePrice')}</span><span className="v">{fmtPrice(row?.close_price ?? (pts && pts[pts.length - 1]), lang, row?.currency)}</span></div>
        <div className="fe-m"><span className="k">{t(lang, 'feChange')}</span><span className="v">{row?.change_percent != null ? `${up ? '+' : ''}${row.change_percent.toFixed(2)}%` : '—'}</span></div>
        <div className="fe-m"><span className="k">{t(lang, 'feTrend')}</span><span className="v">{trend != null ? `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%` : '—'}</span></div>
      </div>

      <div className="fe-foot">
        <a className="fe-link" href={`/quote?symbol=${key}`}>
          {t(lang, 'feView')} · {key} <ArrowUpRight size={13} />
        </a>
      </div>
    </div>
  )
}