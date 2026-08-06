import { useRouter } from 'next/router'
import { List, CandlestickChart, Compass, Users, Menu } from 'lucide-react'
import { t } from '../lib/i18n'

const items = [
  { id: 'watchlist', label: 'watchlist', icon: List, path: '/watchlist' },
  { id: 'chart', label: 'chart', icon: CandlestickChart, path: '/quote?symbol=ETIT' },
  { id: 'explorer', label: 'explorer', icon: Compass, path: '/explorer' },
  { id: 'community', label: 'community', icon: Users, path: '/community' },
  { id: 'menu', label: 'menu', icon: Menu, path: '/menu' },
]

export default function BottomNav({ active }) {
  const router = useRouter()

  const go = (e, item) => {
    if (item.id === 'chart') {
      e.preventDefault()
      let sym = 'ETIT'
      try {
        const favs = JSON.parse(localStorage.getItem('bluerock_favorites_v1') || '[]')
        if (Array.isArray(favs) && favs.length) sym = favs[0]
        else sym = localStorage.getItem('bluerock_last_symbol') || 'ETIT'
      } catch {}
      router.push(`/quote?symbol=${encodeURIComponent(sym)}`)
    }
  }

  return (
    <nav className="bottom-nav">
      {items.map(item => {
        const isActive = active === item.id
        return (
          <a
            key={item.id}
            href={item.path}
            onClick={e => go(e, item)}
            className={`bn-item ${isActive ? 'active' : ''}`}
          >
            <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
            <span>{t(item.label)}</span>
          </a>
        )
      })}
      <style jsx>{`
        .bottom-nav {
          display: flex;
          align-items: center;
          justify-content: space-around;
          height: calc(74px + env(safe-area-inset-bottom));
          padding: 6px 0 env(safe-area-inset-bottom);
          background: #000;
          border-top: 1px solid #2a2a2a;
          flex-shrink: 0;
        }
        .bn-item {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          background: none;
          border: none;
          text-decoration: none;
          color: #5a5a5a;
          font-size: 9px;
          cursor: pointer;
          padding: 4px 2px;
          transition: color 0.15s;
          font-family: inherit;
        }
        .bn-item.active {
          color: #fff;
        }
        .bn-item span {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
      `}</style>
    </nav>
  )
}
