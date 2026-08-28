import { useRouter } from 'next/router'
import { LayoutDashboard, Star, Wallet, Globe2, MessageCircle, Trophy, Sparkles, UserRound, Gem, Brain } from 'lucide-react'
import { t, detectLang } from '../lib/i18n'
import { useState, useEffect } from 'react'

const itemDefs = [
  { id: 'graphique', key: 'dockMarket', icon: LayoutDashboard, path: '/chart' },
  { id: 'watchlist', key: 'dockWatchlist', icon: Star, path: '/watchlist' },
  { id: 'portfolio', key: 'dockPortfolio', icon: Wallet, path: '/portfolio' },
  { id: 'explorer', key: 'dockExplore', icon: Globe2, path: '/explorer' },
  { id: 'community', key: 'dockCommunity', icon: MessageCircle, path: '/community' },
  { id: 'challenges', key: 'dockChallenges', icon: Trophy, path: '/challenges' },
  { id: 'ai-studio', key: 'dockAiStudio', icon: Brain, path: '/ai-studio' },
  { id: 'analyst', key: 'dockAnalyst', icon: Sparkles, path: '/analyst' },
  { id: 'premium', key: 'dockPremium', icon: Gem, path: '/premium' },
  { id: 'menu', key: 'dockProfile', icon: UserRound, path: '/menu' },
]

export default function DesktopDock() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  useEffect(() => { setLang(detectLang()) }, [])
  const items = itemDefs.map(d => ({ ...d, label: t(lang, d.key) }))
  if (router.pathname === '/login') return null

  const active = (() => {
    const p = router.pathname
    if (p === '/login') return ''
    if (p.startsWith('/watchlist') || p.startsWith('/company') || p.startsWith('/companies') || p.startsWith('/screen')) return 'watchlist'
    if (p.startsWith('/quote') || p.startsWith('/chart')) return 'graphique'
    if (p.startsWith('/portfolio') || p.startsWith('/paiement')) return 'portfolio'
    if (p.startsWith('/explorer') || p.startsWith('/calendar') || p.startsWith('/brokers') || p.startsWith('/donnees')) return 'explorer'
    if (p.startsWith('/community')) return 'community'
    if (p.startsWith('/challenges')) return 'challenges'
    if (p.startsWith('/ai-studio')) return 'ai-studio'
    if (p.startsWith('/analyst')) return 'analyst'
    if (p.startsWith('/premium')) return 'premium'
    if (p.startsWith('/menu') || p.startsWith('/profile') || p.startsWith('/notifications') || p.startsWith('/compte-titre') || p.startsWith('/kyc') || p.startsWith('/privacy')) return 'menu'
    return ''
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
            <Icon size={15} strokeWidth={1.8} />
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
          gap: 3px;
          padding: 7px;
          border-radius: 999px;
          max-width: calc(100vw - 24px);
          overflow-x: auto;
          scrollbar-width: none;
          background: linear-gradient(180deg, rgba(28, 28, 34, 0.78), rgba(14, 14, 18, 0.72));
          backdrop-filter: blur(28px) saturate(1.6);
          -webkit-backdrop-filter: blur(28px) saturate(1.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 16px 48px -12px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          pointer-events: none;
        }
        :global(.mac-dock::-webkit-scrollbar) { display: none; }
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
          padding: 10px 15px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: transparent;
          color: rgba(255, 255, 255, 0.58);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.01em;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.18s cubic-bezier(0.2, 0, 0, 1), color 0.18s cubic-bezier(0.2, 0, 0, 1), transform 0.18s cubic-bezier(0.2, 0, 0, 1);
        }
        :global(.md-item svg) {
          transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1);
        }
        :global(.md-item:hover) {
          background: rgba(255, 255, 255, 0.09);
          color: #fff;
          transform: translateY(-1px);
        }
        :global(.md-item:hover svg) {
          transform: scale(1.06);
        }
        :global(.md-item.active) {
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          font-weight: 600;
        }
        :global(.md-item.active::after) {
          content: '';
          position: absolute;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #18C27C;
          box-shadow: 0 0 10px rgba(24, 194, 124, 0.6);
        }
      `}</style>
    </nav>
  )
}