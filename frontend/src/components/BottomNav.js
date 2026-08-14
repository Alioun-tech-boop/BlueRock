import { useRouter } from 'next/router'
import Link from 'next/link'
import { LineChart, AreaChart, Globe, MessageCircle, Wallet } from 'lucide-react'
import { t } from '../lib/i18n'

const items = [
  { id: 'watchlist', label: 'watchlist', icon: LineChart, path: '/watchlist' },
  { id: 'chart', label: 'chart', icon: AreaChart, path: '/quote?symbol=ETIT' },
  { id: 'explorer', label: 'explorer', icon: Globe, path: '/explorer' },
  { id: 'community', label: 'community', icon: MessageCircle, path: '/community' },
  { id: 'portfolio', label: 'portfolio', icon: Wallet, path: '/portfolio' },
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
        const Icon = item.icon
        return (
          <Link
            key={item.id}
            href={item.path}
            onClick={e => go(e, item)}
            className={`bn-item ${isActive ? 'active' : ''}`}
          >
            <span className="bn-ico">
              <Icon size={21} strokeWidth={2} />
            </span>
            <span className="bn-label">{t(item.label)}</span>
          </Link>
        )
      })}
      <style jsx>{`
        :global(.bottom-nav) {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-around;
          height: calc(70px + env(safe-area-inset-bottom));
          padding: 4px 0 env(safe-area-inset-bottom);
          background: #0A0A0A;
          flex-shrink: 0;
          border-top: 1px solid #1E1E1E;
          overflow: hidden;
        }
        :global(.bn-item) {
          position: relative;
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          background: none;
          border: none;
          text-decoration: none;
          color: #9AA3B2;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          padding: 4px 2px;
          transition: color 0.15s ease;
          font-family: inherit;
        }
        :global(.bn-item:active) { color: #28C98B; }
        :global(.bn-item.active) { color: #28C98B; }
        :global(.bn-item.active .bn-label) {
          color: #F7F8FA;
          font-weight: 600;
        }
        :global(.bn-label) {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
      `}</style>
    </nav>
  )
}
