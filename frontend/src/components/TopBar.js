import { useState, useEffect } from 'react'
import { getMarketOverview } from '../services/api'

export default function TopBar() {
  const [data, setData] = useState(null)

  useEffect(() => {
    getMarketOverview()
      .then(res => setData(res.data))
      .catch(() => {})
    const interval = setInterval(() => {
      getMarketOverview()
        .then(res => setData(res.data))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const indices = data?.indices || {}
  const change = indices.change_percent || 0

  return (
    <div className="topbar">
      <div className="topbar-item">
        <span className="label">BRVM C</span>
        <span className="value">{indices.brvm_composite?.toFixed(2) || '—'}</span>
        <span className={`change ${change >= 0 ? 'c-green' : 'c-red'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
      <div className="topbar-divider" />
      <div className="topbar-item">
        <span className="label">Cap.</span>
        <span className="value">{indices.market_cap ? `${(indices.market_cap / 1e12).toFixed(2)}T` : '—'}</span>
      </div>
      <div className="topbar-divider" />
      <div className="topbar-item">
        <span className="label">Volume</span>
        <span className="value">{indices.volume_total ? `${(indices.volume_total / 1e9).toFixed(1)}Md` : '—'}</span>
      </div>
      {data?.stocks && (
        <>
          <div className="topbar-divider" />
          <div className="topbar-item">
            <span className="label">Hausses</span>
            <span className="change c-green">+{indices.up_count ?? data.gainers?.length ?? 0}</span>
          </div>
          <div className="topbar-item">
            <span className="label">Baisses</span>
            <span className="change c-red">{indices.down_count ?? data.losers?.length ?? 0}</span>
          </div>
          <div className="topbar-item">
            <span className="label">Stables</span>
            <span className="change c-muted">
              {(data.stocks || []).filter(s => !s.change_percent || s.change_percent === 0).length}
            </span>
          </div>
        </>
      )}
      <div className="ml-auto topbar-item">
        <span className="label">{indices.date || '—'}</span>
      </div>
    </div>
  )
}
