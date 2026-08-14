import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from './TriLoader'
import { getPremiumPlans, getPremiumPlansLite } from '../services/api'
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
  const [loadError, setLoadError] = useState(false)
  const [type, setType] = useState(null)
  const [tick, setTick] = useState(0)
  const mounted = useRef(true)

  const goBack = () => {
    if (back !== router.pathname) {
      router.push(back)
      return
    }
    if (window.history.length > 1) router.back()
    else router.replace('/portfolio')
  }

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
    setLoadError(false)
    // Hub = vue légère (pas de snapshots/positions) ; pages détaillées = payload complet.
    const fetchPlans = section === 'hub' ? getPremiumPlansLite() : getPremiumPlans()
    fetchPlans
      .then(r => { if (!cancelled) setPlans(r.data.plans || []) })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, authLoading, tick, section])

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
        <button className="ph-back" onClick={goBack} aria-label="back">
          <ChevronLeft size={21} />
        </button>
        <div className="ph-title-wrap">
          <div className="ph-title"><Compass size={18} className="ph-ico" /> {t(lang, 'patTitle')}</div>
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
                  <Icon size={15} strokeWidth={2.2} />
                  <span>{t(lang, pt.key)}</span>
                  {active && <i className="type-dot" />}
                </button>
              )
            })}
          </div>
          <div className="sub-nav">
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
          </div>
        </>
      )}

      <div className="safe-area">
        {!user ? (
          <div className="login-note" onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}>
            {t(lang, 'premiumLogin')}
          </div>
        ) : loading ? (
          <div className="loading-row">
            <TriLoader compact />
            <button className="mini-refresh" onClick={() => setTick(x => x + 1)} aria-label="refresh">
              <RefreshCw size={15} />
            </button>
          </div>
        ) : loadError ? (
          <div className="load-error-box">
            <div className="load-error-msg">{t(lang, 'patLoadError')}</div>
            <button className="load-error-btn" onClick={() => setTick(x => x + 1)}>
              <RefreshCw size={15} /> {t(lang, 'patRetry')}
            </button>
          </div>
        ) : typeof children === 'function' ? (
          children(ctx)
        ) : (
          children
        )}
      </div>

      <BottomNav active="portfolio" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #F7F8FA;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .ph-top {
          display: flex; align-items: center; gap: 13px;
          padding: 20px 20px 0;
        }
        .ph-back {
          width: 40px; height: 40px; border-radius: 13px; border: 1px solid #222222; cursor: pointer; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(180deg, #141414, #0C0C0C); color: #F7F8FA;
          transition: transform .12s ease;
        }
        .ph-back:active { transform: scale(0.94); }
        .ph-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ph-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 22px; font-weight: 800; letter-spacing: -0.035em;
          font-family: Inter, sans-serif;
        }
        .ph-ico { color: #2ACB8A; }
        .ph-sub {
          font-size: 12.5px; font-weight: 500; color: #8E8E93;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .type-chips {
          display: flex; gap: 9px; overflow-x: auto; padding: 20px 20px 0;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .type-chips::-webkit-scrollbar { display: none; }
        .type-chip {
          flex-shrink: 0; display: flex; align-items: center; gap: 7px;
          height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid #242424;
          background: linear-gradient(180deg, #121212, #0B0B0B); color: #8C99AF; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 700; letter-spacing: -0.01em; position: relative;
          transition: all .2s ease;
        }
        .type-chip:active { transform: scale(0.96); }
        .type-chip.active {
          background: rgba(42,203,138,0.12); color: #2ACB8A;
          border-color: rgba(42,203,138,0.55);
          font-weight: 800;
        }
        .type-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #2ACB8A; margin-left: 1px;
        }
        .sub-nav {
          display: flex; gap: 6px; overflow-x: auto; padding: 16px 20px 0;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .sub-nav::-webkit-scrollbar { display: none; }
        .sn-item {
          flex-shrink: 0; height: 40px; padding: 0 17px; border-radius: 999px; border: 1px solid transparent; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap;
          background: #101010; color: #8C99AF;
          transition: all .2s ease;
        }
        .sn-item:active { transform: scale(0.96); }
        .sn-item.active {
          background: #FFFFFF; color: #111111; font-weight: 800;
          box-shadow: 0 4px 18px -6px rgba(255,255,255,0.35);
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 22px 20px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .loading-row { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 80px 0; }
        .spinner {
          width: 28px; height: 28px;
          border: 3px solid #242424; border-top-color: #2ACB8A;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .mini-refresh {
          width: 38px; height: 38px; border-radius: 13px; border: 1px solid #242424; cursor: pointer;
          background: #101010; color: #8C99AF; display: flex; align-items: center; justify-content: center;
          transition: transform .12s ease;
        }
        .mini-refresh:active { transform: rotate(90deg); }
        .load-error-box {
          display: flex; flex-direction: column; align-items: center; gap: 14px;
          padding: 34px 20px; text-align: center;
          border: 1px dashed rgba(244,68,56,0.4); border-radius: 18px; background: rgba(244,68,56,0.05);
        }
        .load-error-msg { font-size: 14px; font-weight: 500; color: #F7F8FA; line-height: 1.5; }
        .load-error-btn {
          display: flex; align-items: center; gap: 7px; height: 42px; padding: 0 18px;
          border-radius: 13px; border: 1px solid #2A2A2A; background: #101010;
          color: #F7F8FA; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .load-error-btn:active { transform: scale(0.96); }
        .login-note {
          text-align: center; padding: 20px; border-radius: 20px;
          border: 1px dashed rgba(42,203,138,0.45); color: #2ACB8A; font-size: 14px; font-weight: 600; cursor: pointer;
          background: rgba(42,203,138,0.05); line-height: 1.5;
        }
      `}</style>
    </div>
  )
}