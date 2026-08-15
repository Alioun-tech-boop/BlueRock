import { useRouter } from 'next/router'
import { LayoutDashboard, Star, Wallet, Globe2, MessageCircle, Trophy, Sparkles, UserRound, Gem } from 'lucide-react'
import { t } from '../lib/i18n'

const items = [
  { id: 'market', label: t('market'), icon: LayoutDashboard, path: '/' },
  { id: 'watchlist', label: t('watchlist'), icon: Star, path: '/watchlist' },
  { id: 'portfolio', label: t('portfolio'), icon: Wallet, path: '/portfolio' },
  { id: 'explorer', label: t('menuExplorer'), icon: Globe2, path: '/explorer' },
  { id: 'community', label: t('community'), icon: MessageCircle, path: '/community' },
  { id: 'challenges', label: t('challenges'), icon: Trophy, path: '/challenges' },
  { id: 'analyst', label: t('aiAnalyst'), icon: Sparkles, path: '/analyst' },
  { id: 'premium', label: t('offers'), icon: Gem, path: '/premium' },
  { id: 'menu', label: t('menu'), icon: UserRound, path: '/menu' },
]

export default function DesktopDock() {
  const router = useRouter()
  if (router.pathname === '/login') return null

  const active = (() => {
    const p = router.pathname
    if (p.startsWith('/watchlist') || p.startsWith('/company') || p.startsWith('/quote') || p.startsWith('/chart')) return 'watchlist'
    if (p.startsWith('/portfolio')) return 'portfolio'
    if (p.startsWith('/explorer') || p.startsWith('/calendar') || p.startsWith('/brokers') || p.startsWith('/donnees')) return 'explorer'
    if (p.startsWith('/community') || p.startsWith('/challenges')) return 'community'
    if (p.startsWith('/analyst')) return 'analyst'
    if (p.startsWith('/premium')) return 'premium'
    if (p.startsWith('/menu') || p.startsWith('/profile') || p.startsWith('/notifications') || p.startsWith('/compte-titre')) return 'menu'
    return 'market'
  })()

  return (
    <nav className="mac-dock" aria-label="Navigation principale">
      {items.map(item => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            className={`md-item ${active === item.id ? 'active' : ''}`}
            onClick={() => router.push(item.path)}
          >
            <Icon size={16} strokeWidth={2} />
            <span className="md-label">{item.label}</span>
          </button>
        )
      })}
      <style jsx>{`
        :global(.mac-dock) {
          position: fixed;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 200;
          display: none;
          align-items: center;
          gap: 2px;
          padding: 6px;
          border-radius: 999px;
          background: rgba(22, 22, 26, 0.68);
          backdrop-filter: blur(24px) saturate(1.6);
          -webkit-backdrop-filter: blur(24px) saturate(1.6);
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: 0 12px 38px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
          pointer-events: none;
        }
        :global(.mac-dock .md-item) {
          pointer-events: auto;
        }
        @media (min-width: 1024px) {
          :global(.mac-dock) {
            display: flex;
          }
        }
        :global(.md-item) {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 15px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: transparent;
          color: #9AA3B2;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
        }
        :global(.md-item:hover) {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          transform: translateY(-1px);
        }
        :global(.md-item.active) {
          background: rgba(76, 141, 255, 0.16);
          color: #7ab2ff;
        }
        :global(.md-item.active::after) {
          content: '';
          position: absolute;
          bottom: 5px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #4C8DFF;
          box-shadow: 0 0 8px rgba(76, 141, 255, 0.9);
        }
      `}</style>
    </nav>
  )
}
