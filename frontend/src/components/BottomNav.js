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
    <nav className="bottom-nav" aria-label="Navigation principale">
      {items.map(item => {
        const isActive = active === item.id
        const Icon = item.icon
        return (
          <Link
            key={item.id}
            href={item.path}
            onClick={e => go(e, item)}
            className={`bn-item ${isActive ? 'active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={t(item.label)}
          >
            <span className="bn-ico" aria-hidden="true">
              <Icon size={20} strokeWidth={1.9} />
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
          height: 64px;
          padding: 6px 8px;
          background: rgba(14, 14, 17, 0.8);
          backdrop-filter: blur(24px) saturate(1.4);
          -webkit-backdrop-filter: blur(24px) saturate(1.4);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 22px;
          box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          flex-shrink: 0;
        }
        :global(.bn-item) {
          position: relative;
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          background: none;
          border: none;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.4);
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          padding: 2px;
          transition: color 0.18s ease;
          font-family: inherit;
        }
        :global(.bn-ico) {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 30px;
          border-radius: 14px;
          transition: background 0.18s ease;
        }
        :global(.bn-item.active) { color: #fff; }
        :global(.bn-item.active .bn-ico) { background: rgba(255, 255, 255, 0.1); }
        :global(.bn-item.active .bn-label) {
          color: #fff;
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
