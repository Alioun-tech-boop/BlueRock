import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getPremiumPlans } from '../services/api'
import { useAuth } from '../lib/auth'
import { ChevronLeft, PiggyBank, Umbrella, GraduationCap, Landmark, Compass, RefreshCw } from 'lucide-react'
import { detectLang, t } from '../lib/i18n'
import { PLAN_TYPES } from '../lib/plan'

const ICONS = { PiggyBank, Umbrella, GraduationCap, Landmark }

const SECTIONS = [
  { id: 'apercu', key: 'patOverview', path: '/patrimoine/apercu' },
  { id: 'allocation', key: 'patAllocation', path: '/patrimoine/allocation' },
  { id: 'projections', key: 'patProjections', path: '/patrimoine/projections' },
  { id: 'contributions', key: 'patContributions', path: '/patrimoine/contributions' },
  { id: 'parametres', key: 'patSettings', path: '/patrimoine/parametres' },
]

export default function PatrimoineShell({ section, back = '/patrimoine', children }) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [lang, setLang] = useState('fr')
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState(null)
  const [tick, setTick] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    if (!user) {
      setPlans([])
      setLoading(false)
      return
    }
    setLoading(true)
    getPremiumPlans()
      .then(r => { if (!cancelled) setPlans(r.data.plans || []) })
      .catch(() => { if (!cancelled) setPlans([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, authLoading, tick])

  useEffect(() => {
    const q = router.query && router.query.type
    if (q && PLAN_TYPES.some(x => x.id === q)) setType(q)
  }, [router.query])

  useEffect(() => {
    if (!type && plans.length) {
      const active = plans.find(p => p.status === 'active')
      setType(active ? active.plan_type : plans[0].plan_type)
    }
  }, [plans, type])

  const plan = plans.find(p => p.plan_type === type && p.status === 'active') || plans.find(p => p.plan_type === type)

  const ctx = { plans, plan, type, setType, lang, reload: () => setTick(x => x + 1) }

  return (
    <div className="mobile-root">
      <header className="ph-top">
        <button className="ph-back" onClick={() => router.push(back)} aria-label="back">
          <ChevronLeft size={22} />
        </button>
        <div className="ph-title-wrap">
          <div className="ph-title"><Compass size={17} color="#2ACB8A" /> {t(lang, 'patTitle')}</div>
          <div className="ph-sub">{t(lang, 'patSub')}</div>
        </div>
      </header>

      {section !== 'hub' && (
        <>
          <div className="type-chips">
            {PLAN_TYPES.map(pt => {
              const Icon = ICONS[pt.icon]
              const active = type === pt.id
              return (
                <button
                  key={pt.id}
                  className={`type-chip ${active ? 'active' : ''}`}
                  onClick={() => {
                    setType(pt.id)
                    router.replace({ pathname: router.pathname, query: { type: pt.id } }, undefined, { scroll: false })
                  }}
                >
                  <Icon size={16} strokeWidth={2.2} />
                  <span>{t(lang, pt.key)}</span>
                  {active && <i className="type-dot" />}
                </button>
              )
            })}
          </div>
          <nav className="sub-nav">
            {SECTIONS.map(s => {
              const active = section === s.id
              return (
                <button
                  key={s.id}
                  className={`sn-item ${active ? 'active' : ''}`}
                  onClick={() => router.push({ pathname: s.path, query: type ? { type } : {} })}
                >
                  {t(lang, s.key)}
                </button>
              )
            })}
          </nav>
        </>
      )}

      <div className="safe-area">
        {!user ? (
          <div className="login-note" onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}>
            {t(lang, 'premiumLogin')}
          </div>
        ) : loading ? (
          <div className="loading-row">
            <div className="spinner" />
            <button className="mini-refresh" onClick={() => setTick(x => x + 1)} aria-label="refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        ) : typeof children === 'function' ? (
          children(ctx)
        ) : (
          children
        )}
      </div>

      <BottomNav active="menu" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #0D162B; color: #F7F8FA;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .ph-top { display: flex; align-items: center; gap: 12px; padding: 18px 20px 0; }
        .ph-back {
          width: 38px; height: 38px; border-radius: 12px; border: none; cursor: pointer; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: #172239; color: #F7F8FA;
        }
        .ph-title-wrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ph-title { display: flex; align-items: center; gap: 7px; font-size: 20px; font-weight: 700; letter-spacing: 0.25px; }
        .ph-sub { font-size: 12px; font-weight: 400; color: #8C99AF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .type-chips {
          display: flex; gap: 9px; overflow-x: auto; padding: 18px 20px 0;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .type-chips::-webkit-scrollbar { display: none; }
        .type-chip {
          flex-shrink: 0; display: flex; align-items: center; gap: 7px;
          height: 42px; padding: 0 15px; border-radius: 999px; border: 1px solid #1B2941;
          background: #172239; color: #8C99AF; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 600; letter-spacing: 0.25px; position: relative;
        }
        .type-chip.active {
          background: #FFFFFF; color: #111111; border-color: #FFFFFF; font-weight: 700;
        }
        .type-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #2ACB8A; margin-left: 2px;
          box-shadow: 0 0 8px rgba(42,203,138,0.8);
        }
        .sub-nav {
          display: flex; gap: 8px; overflow-x: auto; padding: 14px 20px 0;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .sub-nav::-webkit-scrollbar { display: none; }
        .sn-item {
          flex-shrink: 0; height: 38px; padding: 0 16px; border-radius: 999px; border: none; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 600; letter-spacing: 0.25px; white-space: nowrap;
          background: #1C2740; color: #8996AE;
        }
        .sn-item.active { background: #FFFFFF; color: #111111; font-weight: 700; }
        .safe-area { flex: 1; overflow-y: auto; padding: 20px 20px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .loading-row { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 70px 0; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #1B2941; border-top-color: #2ACB8A;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .mini-refresh {
          width: 36px; height: 36px; border-radius: 12px; border: 1px solid #1B2941; cursor: pointer;
          background: #172239; color: #8C99AF; display: flex; align-items: center; justify-content: center;
        }
        .login-note {
          text-align: center; padding: 18px; border-radius: 18px;
          border: 1px dashed rgba(42,203,138,0.45); color: #2ACB8A; font-size: 14px; font-weight: 600; cursor: pointer;
          background: rgba(42,203,138,0.06);
        }
        .card {
          background: #172239; border: 1px solid #1B2941; border-radius: 20px;
          padding: 18px 20px; margin-bottom: 14px;
        }
        .card-title {
          display: flex; align-items: center; gap: 7px;
          font-size: 16px; font-weight: 600; color: #F7F8FA; margin-bottom: 14px;
        }
        .card-title-inline {
          display: flex; align-items: center; gap: 8px;
          font-size: 16px; font-weight: 600; color: #F7F8FA; margin: 18px 0 10px;
        }
        .uni-badge { margin-left: auto; font-size: 12px; color: #8C99AF; font-weight: 500; }
        .green { color: #2ACB8A !important; }
        .red { color: #F04438 !important; }
        .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 14px; }
        .sum-hint { font-size: 12px; color: #5F6D85; text-align: center; margin: -6px 4px 14px; line-height: 1.35; }
        .stat {
          background: #172239; border: 1px solid #1B2941; border-radius: 18px; padding: 14px 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .stat.gold { background: linear-gradient(135deg, rgba(42,203,138,0.2), rgba(42,203,138,0.06)); border: 1px solid rgba(42,203,138,0.4); }
        .stat-l { font-size: 14px; font-weight: 400; color: #8C99AF; }
        .stat-v { font-size: 18px; font-weight: 700; color: #F7F8FA; font-variant-numeric: tabular-nums; }
        .stat.gold .stat-v { color: #2ACB8A; font-size: 18px; }
        .stat.up .stat-v { color: #2ACB8A; }
        .empty-box {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 70px 24px; text-align: center;
        }
        .empty-ring {
          width: 96px; height: 96px; border-radius: 50%;
          border: 4px solid #46536A; display: flex; align-items: center; justify-content: center;
          color: #8C99AF;
        }
        .empty-title { font-size: 17px; font-weight: 700; color: #F7F8FA; }
        .empty-sub { font-size: 13px; color: #8C99AF; line-height: 1.5; }
        .empty-btn {
          margin-top: 8px; height: 56px; padding: 0 34px; border-radius: 16px; cursor: pointer;
          background: #FFFFFF; color: #111111; border: none;
          font-size: 16px; font-weight: 700; font-family: inherit; letter-spacing: 0.25px;
        }
        .footer-note { text-align: center; font-size: 12px; color: #4A5770; padding: 12px 0; }
      `}</style>
    </div>
  )
}
