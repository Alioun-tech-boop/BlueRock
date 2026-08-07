import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { LayoutDashboard, Building2, Brain, Search, BarChart3 } from 'lucide-react'
import { getCompanies } from '../services/api'

const navItems = [
  { id: 'dashboard', label: 'Marché', icon: LayoutDashboard, path: '/' },
  { id: 'companies', label: 'Entreprises', icon: Building2, path: '/companies' },
  { id: 'screen', label: 'Analyseur', icon: Search, path: '/screen' },
  { id: 'analyst', label: 'Analyste IA', icon: Brain, path: '/analyst' },
]

export default function Sidebar({ active }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [stocks, setStocks] = useState([])
  const [filtered, setFiltered] = useState([])

  useEffect(() => {
    getCompanies({ limit: 49 })
      .then(res => {
        const list = res.data.companies || []
        setStocks(list)
        setFiltered(list)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(stocks)
      return
    }
    const q = search.toUpperCase()
    setFiltered(stocks.filter(s =>
      s.symbol.toUpperCase().includes(q) || s.name.toUpperCase().includes(q)
    ))
  }, [search, stocks])

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon"><BarChart3 size={14} /></div>
        <span className="logo-text">BlueRock</span>
      </div>
      <div className="sidebar-search">
        <input
          placeholder="Rechercher un symbole..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="sidebar-nav">
        <div className="nav-section">Navigation</div>
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => router.push(item.path)}
          >
            <item.icon className="nav-icon" size={16} />
            {item.label}
          </button>
        ))}
        <div className="nav-section" style={{ marginTop: 12 }}>Watchlist</div>
        {filtered.slice(0, 30).map(s => (
          <div
            key={s.id}
            className="tv-company-row"
            onClick={() => router.push(`/company?id=${s.id}`)}
          >
            <div className="symbol" style={{ color: s.change_percent >= 0 ? 'var(--tv-green)' : 'var(--tv-red)' }}>
              {s.symbol}
            </div>
            <div className="price">
              {s.current_price?.toLocaleString('fr-FR') || '—'}
            </div>
            <div className="change" style={{ color: s.change_percent >= 0 ? 'var(--tv-green)' : 'var(--tv-red)' }}>
              {s.change_percent >= 0 ? '+' : ''}{s.change_percent?.toFixed(2) || '0'}%
            </div>
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="version">BlueRock v1 · BRVM</div>
      </div>
      <style jsx>{`
        .nav-item { font-size: 16px; font-weight: 600; color: #F2F4F7; }
        .nav-item.active { color: #18C27C; }
        .nav-section { font-size: 14px; font-weight: 400; color: #9AA3B2; letter-spacing: 0.25px; }
        .tv-company-row .symbol { font-weight: 700; font-variant-numeric: tabular-nums; }
        .tv-company-row .price { color: #8E95A3; font-variant-numeric: tabular-nums; }
        .tv-company-row .change { font-weight: 500; font-variant-numeric: tabular-nums; }
      `}</style>
    </nav>
  )
}
