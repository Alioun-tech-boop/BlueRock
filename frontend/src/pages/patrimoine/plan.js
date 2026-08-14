import { useRouter } from 'next/router'
import PatrimoineShell from '../../components/PatrimoineShell'
import PatrimoineSectionStyles from '../../components/PatrimoineSectionStyles'
import PlanForm from '../../components/PlanForm'
import { PLAN_TYPES, PLAN_ICONS, PLAN_TYPE_DEFAULTS, fmtFCFA } from '../../lib/plan'
import { t } from '../../lib/i18n'

export default function PlanType() {
  const router = useRouter()
  const qtype = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type
  return (
    <PatrimoineShell section="parametres" back="/patrimoine">
      {({ plan, type, lang, reload }) => {
        const cur = type || qtype || 'epargne'
        const meta = PLAN_TYPES.find(x => x.id === cur) || PLAN_TYPES[0]
        const Icon = PLAN_ICONS[meta.icon]
        const d = PLAN_TYPE_DEFAULTS[cur] || PLAN_TYPE_DEFAULTS.epargne
        return (
          <>
            <PatrimoineSectionStyles />
            <div className="type-hero">
              <span className="type-hero-ico"><Icon size={22} /></span>
              <div>
                <div className="type-hero-name">{t(lang, meta.key)}</div>
                <div className="type-hero-desc">{t(lang, meta.desc)}</div>
                <div className="rec-row">
                  <span className="rec-chip">{t(lang, 'patRecHorizon')} : {d.horizon} {t(lang, 'years')}</span>
                  <span className="rec-chip">{t(lang, 'patRecRisk')} : {t(lang, d.risk === 'conservative' ? 'riskConservative' : d.risk === 'growth' ? 'riskGrowth' : 'riskBalanced')}</span>
                  {plan && plan.status === 'active' && <span className="rec-chip">{fmtFCFA(plan.last_value)}</span>}
                </div>
              </div>
            </div>
            <PlanForm
              lang={lang}
              type={cur}
              plan={plan}
              onDone={reload}
              onCancel={reload}
            />
            <div className="footer-note">Bluerock © 2026</div>
          </>
        )
      }}
    </PatrimoineShell>
  )
}
