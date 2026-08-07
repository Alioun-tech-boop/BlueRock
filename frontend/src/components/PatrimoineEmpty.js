import { useRouter } from 'next/router'
import { t } from '../lib/i18n'
import { PLAN_TYPES, PLAN_ICONS } from '../lib/plan'
import { Sparkles } from 'lucide-react'

export default function PatrimoineEmpty({ type, lang, sub }) {
  const router = useRouter()
  const meta = PLAN_TYPES.find(x => x.id === type) || PLAN_TYPES[0]
  const Icon = PLAN_ICONS[meta.icon]
  return (
    <div className="empty-box">
      <div className="empty-ring"><Icon size={30} /></div>
      <div className="empty-title">{t(lang, 'patNoPlan')}</div>
      <div className="empty-sub">{sub || t(lang, 'patNoPlanSub').replace('{type}', t(lang, meta.key))}</div>
      <button className="empty-btn" onClick={() => router.push(`/patrimoine/plan?type=${type}`)}>
        <Sparkles size={17} /> {t(lang, 'patCreatePlan')}
      </button>
    </div>
  )
}
