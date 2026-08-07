import PatrimoineShell from '../../components/PatrimoineShell'
import PatrimoineSectionStyles from '../../components/PatrimoineSectionStyles'
import PatrimoineEmpty from '../../components/PatrimoineEmpty'
import { fmtFCFA, fmtPct, fmtDate, fmtCompactShort, curveOf } from '../../lib/plan'
import { t } from '../../lib/i18n'
import { Activity } from 'lucide-react'

export default function Projections() {
  return (
    <PatrimoineShell section="projections">
      {({ plan, type, lang }) => {
        const curve = curveOf(plan)
        return (
          <>
            <PatrimoineSectionStyles />
            {!plan ? (
              <PatrimoineEmpty type={type} lang={lang} />
            ) : (
              <>
                <div className="card">
                  <div className="card-title"><Activity size={15} color="#2ACB8A" /> {t(lang, 'planCurve')}</div>
                  {curve ? (
                    <>
                      <svg className="curve" viewBox="0 0 300 90" preserveAspectRatio="none">
                        <line x1="0" y1={curve.startY} x2="300" y2={curve.startY} className="curve-base" />
                        <polyline points={curve.points} className="curve-line" fill="none" />
                        <polyline points={`0,90 ${curve.points} 300,90`} className="curve-fill" />
                      </svg>
                      <div className="curve-axis">
                        <span>{fmtDate(curve.first)}</span>
                        <span>{fmtDate(curve.lastDate)} · {fmtFCFA(curve.last)}</span>
                      </div>
                      <div className="curve-hint">{t(lang, 'planCurveHint')}</div>
                    </>
                  ) : (
                    <div className="plan-no-alerts">{t(lang, 'patNoSnap')}</div>
                  )}
                </div>

                {plan.schedule && plan.schedule.length > 0 && (
                  <div className="card">
                    <div className="card-title">{t(lang, 'premiumSchedule')}</div>
                    <div className="bars">
                      {plan.schedule.map(s => {
                        const max = Math.max(...plan.schedule.map(x => x.value))
                        return (
                          <div key={s.year} className="bar-col">
                            <span className="bar-val">{fmtCompactShort(s.value)}</span>
                            <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(8, (s.value / max) * 100)}%` }} /></div>
                            <span className="bar-year">Y{s.year}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="summary-grid">
                  <div className="stat gold"><span className="stat-l">{t(lang, 'premiumProjected')}</span><span className="stat-v">{fmtFCFA(plan.projected_final)}</span></div>
                  <div className="stat"><span className="stat-l">{t(lang, 'premiumExpectedReturn')}</span><span className="stat-v">{fmtPct(plan.expected_return * 100)}</span></div>
                  <div className="stat"><span className="stat-l">{t(lang, 'premiumInvested')}</span><span className="stat-v">{fmtFCFA(plan.invested)}</span></div>
                  <div className="stat up"><span className="stat-l">{t(lang, 'premiumGain')}</span><span className="stat-v">+{fmtFCFA(plan.gain)}</span></div>
                </div>
                <div className="disclaimer">{t(lang, 'premiumCashHint')}</div>
              </>
            )}
            <div className="footer-note">BlueRock © 2026</div>
          </>
        )
      }}
    </PatrimoineShell>
  )
}
