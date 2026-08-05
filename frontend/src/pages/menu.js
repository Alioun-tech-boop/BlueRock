import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../lib/auth'
import { Building2, Filter, Sparkles, LayoutGrid, Home, Database, Briefcase, Globe2, UserRound, LogOut, Crown } from 'lucide-react'
import { t } from '../lib/i18n'

export default function Menu() {
  const router = useRouter()
  const { user, logout } = useAuth()

  const sections = [
    {
      title: t('menuMarket'),
      items: [
        { label: t('menuHome'), desc: t('menuHomeDesc'), icon: Home, path: '/' },
        { label: t('menuCompanies'), desc: t('menuCompaniesDesc'), icon: Building2, path: '/companies' },
        { label: t('menuScreener'), desc: t('menuScreenerDesc'), icon: Filter, path: '/screen' },
        { label: t('menuExplorer'), desc: t('menuExplorerDesc'), icon: Globe2, path: '/explorer' },
      ],
    },
    {
      title: t('menuAnalysis'),
      items: [
        { label: t('premiumTitle'), desc: t('menuPremiumDesc'), icon: Crown, path: '/premium' },
        { label: t('aiAnalyst'), desc: t('menuAnalystDesc'), icon: Sparkles, path: '/analyst' },
        { label: t('community'), desc: t('menuCommunityDesc'), icon: LayoutGrid, path: '/community' },
        { label: t('portfolio'), desc: t('menuPortfolioDesc'), icon: Briefcase, path: '/watchlist' },
      ],
    },
    {
      title: t('menuData'),
      items: [
        { label: t('menuPdf'), desc: t('menuPdfDesc'), icon: Database, path: '/donnees' },
      ],
    },
    {
      title: t('pfAccount'),
      items: [
        { label: t('pfTitle'), desc: t('pfSecurity'), icon: UserRound, path: '/profile' },
      ],
    },
  ]

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="mn-header">
          <div className="mn-brand">BlueRock</div>
          <div className="mn-sub">{t('menuSub')}</div>
        </header>

        {user ? (
          <div className="acct-card" onClick={() => router.push('/profile')}>
            <div className="acct-avatar"><UserRound size={18} /></div>
            <div className="acct-info">
              <span className="acct-name">{user.name}</span>
              <span className="acct-email">{user.email}</span>
              <span className={`acct-type-badge ${user.account_type}`}>
                {user.account_type === 'real' ? t('authReal') : t('authDemo')}
                {user.account_type === 'real' && user.broker_name ? ` · ${user.broker_name}` : ''}
              </span>
            </div>
            <button className="acct-logout" onClick={() => logout()}>
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="acct-card guest" onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}>
            <div className="acct-avatar"><UserRound size={18} /></div>
            <div className="acct-info">
              <span className="acct-name">{t('authLogin')}</span>
              <span className="acct-email">{t('authRequiredSub')}</span>
            </div>
            <span className="row-arrow">›</span>
          </div>
        )}

        {sections.map(sec => (
          <div key={sec.title}>
            <div className="section-title">{sec.title}</div>
            <div className="card-list">
              {sec.items.map((it, i) => (
                <div key={i} className="row" onClick={() => router.push(it.path)}>
                  <div className="row-icon"><it.icon size={18} /></div>
                  <div className="row-text">
                    <span className="row-label">{it.label}</span>
                    <span className="row-desc">{it.desc}</span>
                  </div>
                  <span className="row-arrow">›</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="footer-note">BlueRock © 2026 · {t('footerData')}</div>
      </div>

      <BottomNav active="menu" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .mn-header { display: flex; flex-direction: column; justify-content: center; height: 72px; }
        .mn-brand { font-size: 22px; font-weight: 800; }
        .mn-sub { font-size: 12px; color: #a3a3a3; }
        .section-title { font-size: 16px; font-weight: 600; margin-bottom: 10px; margin-top: 10px; }
        .card-list {
          background: #141414; border-radius: 18px;
          padding: 4px 16px; margin-bottom: 20px;
        }
        .row {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 0; border-bottom: 1px solid #1f1f1f; cursor: pointer;
        }
        .row:last-child { border-bottom: none; }
        .row-icon {
          width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(139,92,246,0.12); color: #a78bfa;
        }
        .row-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .row-label { font-size: 14px; font-weight: 600; }
        .row-desc { font-size: 12px; color: #a3a3a3; }
        .row-arrow { font-size: 20px; color: #666; }
        .acct-card {
          display: flex; align-items: center; gap: 12px;
          background: #141414; border-radius: 18px;
          padding: 14px 16px; margin: 6px 0 20px; cursor: pointer;
        }
        .acct-card.guest { border: 1px solid #262626; }
        .acct-avatar {
          width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,200,83,0.12); color: #00C853;
        }
        .acct-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .acct-name { font-size: 14px; font-weight: 700; }
        .acct-email { font-size: 11px; color: #8f8f8f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acct-type-badge {
          align-self: flex-start; font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 8px; margin-top: 2px;
        }
        .acct-type-badge.demo { color: #4ea8ff; background: rgba(78,168,255,0.12); }
        .acct-type-badge.real { color: #ffd166; background: rgba(255,209,102,0.12); }
        .acct-logout {
          width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,77,79,0.12); color: #FF4D4F;
          border: none; cursor: pointer;
        }
        .footer-note { text-align: center; font-size: 11px; color: #555; padding: 12px 0; }
      `}</style>
    </div>
  )
}
