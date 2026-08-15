import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../lib/auth'
import { getUnreadCount, getKycStatus } from '../services/api'
import { Building2, Filter, Sparkles, LayoutGrid, Home, Database, Briefcase, Globe2, UserRound, Compass, Bell, Trophy, ShieldCheck, Gem } from 'lucide-react'
import { t } from '../lib/i18n'

export default function Menu() {
  const router = useRouter()
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)
  const [kycStatus, setKycStatus] = useState('')

  const KYC_STATUS_KEY = {
    not_started: 'kycStatusNotStarted', in_progress: 'kycStatusInProgress',
    document_submitted: 'kycStatusDocumentSubmitted', verification_in_progress: 'kycStatusVerificationInProgress',
    verified: 'kycStatusVerified', review_required: 'kycStatusReviewRequired',
    rejected: 'kycStatusRejected', retry_required: 'kycStatusRetryRequired', error: 'kycStatusError',
  }

  useEffect(() => {
    if (!user) return
    let mounted = true
    const load = () => {
      getUnreadCount()
        .then(r => { if (mounted) setUnread(r.data.unread || 0) })
        .catch(() => {})
      getKycStatus()
        .then(r => { if (mounted && r.data?.status) setKycStatus(r.data.status) })
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 60000)
    return () => { mounted = false; clearInterval(iv) }
  }, [user])

  const sections = [
    {
      title: t('menuMarket'),
      items: [
        { label: t('menuHome'), desc: t('menuHomeDesc'), icon: Home, path: '/menu' },
        { label: t('menuCompanies'), desc: t('menuCompaniesDesc'), icon: Building2, path: '/companies' },
        { label: t('menuScreener'), desc: t('menuScreenerDesc'), icon: Filter, path: '/screen' },
        { label: t('menuExplorer'), desc: t('menuExplorerDesc'), icon: Globe2, path: '/explorer' },
      ],
    },
    {
      title: t('menuAnalysis'),
      items: [
        { label: t('offers'), desc: t('menuOffersDesc'), icon: Gem, path: '/premium' },
        { label: t('premiumTitle'), desc: t('menuPremiumDesc'), icon: Compass, path: '/patrimoine' },
        { label: t('aiAnalyst'), desc: t('menuAnalystDesc'), icon: Sparkles, path: '/analyst' },
        { label: t('community'), desc: t('menuCommunityDesc'), icon: LayoutGrid, path: '/community' },
        { label: t('challenges'), desc: t('ch2Tagline'), icon: Trophy, path: '/challenges' },
        { label: t('portfolio'), desc: t('menuPortfolioDesc'), icon: Briefcase, path: '/portfolio' },
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
        { label: t('kycTitle'), desc: t(KYC_STATUS_KEY[kycStatus] || 'kycStatusNotStarted'), icon: ShieldCheck, path: '/kyc' },
        { label: t('notifTitle'), desc: t('notifSub'), icon: Bell, path: '/notifications', badge: unread },
      ],
    },
  ]

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="mn-header">
          <div className="mn-brand">Bluerock</div>
          <div className="mn-sub">{t('menuSub')}</div>
        </header>

        {user ? (
          <div className="acct-card" onClick={() => router.push('/profile')}>
            <div className="acct-avatar">
              {typeof user.avatar === 'string' && user.avatar.startsWith('data:image/')
                ? <img className="acct-avatar-img" src={user.avatar} alt={user.name || 'avatar'} />
                : <UserRound size={18} />}
            </div>
            <div className="acct-info">
              <span className="acct-name">{user.name}</span>
              <span className="acct-email">{user.email}</span>
            </div>
            <span className="row-arrow">›</span>
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
                  {it.badge > 0 && <span className="row-badge">{it.badge > 99 ? '99+' : it.badge}</span>}
                  <span className="row-arrow">›</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="footer-note">Bluerock © 2026 · {t('footerData')}</div>
      </div>

      <BottomNav active="portfolio" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .mn-header { display: flex; flex-direction: column; justify-content: center; height: 72px; }
        .mn-brand { font-size: 22px; font-weight: 600; }
        .mn-sub { font-size: 12px; color: #9AA3B2; }
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
        .row-desc { font-size: 12px; color: #9AA3B2; }
        .row-arrow { font-size: 20px; color: #666; }
        .row-badge {
          min-width: 20px; height: 20px; border-radius: 999px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(24,194,124,0.15); color: #18C27C;
          font-size: 11px; font-weight: 600; padding: 0 6px;
        }
        .acct-card {
          display: flex; align-items: center; gap: 12px;
          background: #141414; border-radius: 18px;
          padding: 14px 16px; margin: 6px 0 20px; cursor: pointer;
        }
        .acct-card.guest { border: 1px solid #262626; }
        .acct-avatar {
          width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(24,194,124,0.12); color: #18C27C;
          overflow: hidden;
        }
        .acct-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .acct-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .acct-name { font-size: 14px; font-weight: 600; }
        .acct-email { font-size: 11px; color: #9AA3B2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .footer-note { text-align: center; font-size: 11px; color: #555; padding: 12px 0; }
      `}</style>
    </div>
  )
}
