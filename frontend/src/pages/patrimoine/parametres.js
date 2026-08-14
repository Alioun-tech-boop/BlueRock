import PatrimoineShell from '../../components/PatrimoineShell'
import PatrimoineSectionStyles from '../../components/PatrimoineSectionStyles'
import PlanForm from '../../components/PlanForm'
import { t } from '../../lib/i18n'
import { Sparkles } from 'lucide-react'

export default function Parametres() {
  return (
    <PatrimoineShell section="parametres">
      {({ plan, type, lang, reload }) => (
        <>
          <PatrimoineSectionStyles />
          <div className="hero-card">
            <Sparkles size={15} color="#2ACB8A" />
            <span>{t(lang, 'premiumHero')}</span>
          </div>
          <PlanForm
            lang={lang}
            type={type}
            plan={plan}
            onDone={reload}
            onCancel={reload}
          />
          {plan && plan.status === 'active' && (
            <div className="emitted-note"><Sparkles size={12} color="#2ACB8A" /> {t(lang, 'planEmittedBanner')}</div>
          )}
          <div className="footer-note">Bluerock © 2026</div>
          <style jsx>{`
            .hero-card {
              display: flex; gap: 8px; align-items: flex-start;
              background: linear-gradient(135deg, rgba(42,203,138,0.14), rgba(78,168,255,0.06));
              border: 1px solid rgba(42,203,138,0.35);
              border-radius: 18px; padding: 14px 16px; margin-bottom: 14px;
              font-size: 13px; line-height: 1.35; color: #C9EAD9;
            }
            .emitted-note {
              display: flex; align-items: center; gap: 6px;
              font-size: 12px; color: #C9EAD9; margin: 2px 0 12px; line-height: 1.35;
            }
          `}</style>
        </>
      )}
    </PatrimoineShell>
  )
}
