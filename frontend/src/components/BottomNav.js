import { useRouter } from 'next/router'
import { Home, Compass, CandlestickChart, Briefcase, MoreHorizontal } from 'lucide-react'
import { t } from '../lib/i18n'

const items = [
  { id: 'home', label: 'navHome', icon: Home, path: '/' },
  { id: 'markets', label: 'navMarkets', icon: Compass, path: '/explorer' },
  { id: 'trading', label: 'navTrading', icon: CandlestickChart, path: '/quote?symbol=ETIT' },
  { id: 'portfolio', label: 'navPortfolio', icon: Briefcase, path: '/portfolio' },
  { id: 'more', label: 'navMore', icon: MoreHorizontal, path: '/menu' },
]

export default function BottomNav({ active }) {
  const router = useRouter()

  const go = (e, item) => {
    if (item.id === 'trading') {
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
          <a
            key={item.id}
            href={item.path}
            onClick={e => go(e, item)}
            className={`bn-item ${isActive ? 'active' : ''}`}
          >
            <span className="bn-ico">
              <Icon size={21} strokeWidth={2} />
            </span>
            <span className="bn-label">{t(item.label)}</span>
          </a>
        )
      })}
      <style jsx>{`
        .bottom-nav {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-around;
          height: calc(74px + env(safe-area-inset-bottom));
          padding: 6px 0 env(safe-area-inset-bottom);
          background: linear-gradient(180deg, rgba(14,22,39,0.96) 0%, #0E1627 55%);
          flex-shrink: 0;
          border-top: 1px solid rgba(40,201,138,0.16);
          box-shadow: 0 -12px 32px -14px rgba(40,201,138,0.30);
          overflow: hidden;
        }
        .bottom-nav::before {
          content: '';
          position: absolute;
          top: -1px; left: 12%; right: 12%; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(40,201,138,0.9), transparent);
          filter: blur(0.6px);
          animation: glowLine 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes glowLine {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        .bn-item {
          position: relative;
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          background: none;
          border: none;
          text-decoration: none;
          color: #9AA3B2;
          font-size: 11px;
          cursor: pointer;
          padding: 4px 2px;
          transition: color 0.18s ease;
          font-family: inherit;
        }
        .bn-ico {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 30px;
          border-radius: 15px;
          transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
        }
        .bn-item:active .bn-ico { transform: scale(0.92); }
        .bn-item:active { color: #28C98B; }
        .bn-item.active { color: #28C98B; }
        .bn-item.active .bn-ico {
          background: rgba(40,201,138,0.13);
          box-shadow: 0 0 16px rgba(40,201,138,0.35), 0 0 6px rgba(40,201,138,0.25) inset;
        }
        .bn-item.active :global(svg) {
          filter: drop-shadow(0 0 6px rgba(40,201,138,0.95)) drop-shadow(0 0 14px rgba(40,201,138,0.55));
          animation: icoGlow 2.4s ease-in-out infinite;
        }
        @keyframes icoGlow {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(40,201,138,0.7)) drop-shadow(0 0 10px rgba(40,201,138,0.4)); }
          50% { filter: drop-shadow(0 0 8px rgba(40,201,138,1)) drop-shadow(0 0 18px rgba(40,201,138,0.7)); }
        }
        .bn-label {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .bn-item.active .bn-label {
          font-weight: 600;
          color: #F7F8FA;
        }
        .bn-item.active::after {
          content: '';
          position: absolute;
          bottom: 1px;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #28C98B;
          box-shadow: 0 0 8px 2px rgba(40,201,138,0.7);
          animation: dotPulse 2s ease-in-out infinite;
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </nav>
  )
}
