import PatrimoineShell from '../../components/PatrimoineShell'
import PatrimoineSectionStyles from '../../components/PatrimoineSectionStyles'
import PatrimoineEmpty from '../../components/PatrimoineEmpty'
import { fmtFCFA, fmtPct, fmtCompactShort } from '../../lib/plan'
import { t } from '../../lib/i18n'
import { Wallet } from 'lucide-react'

export default function Contributions() {
  return (
    <PatrimoineShell section="contributions">
      {({ plan, type, lang }) => (
        <>
          <PatrimoineSectionStyles />
          {!plan ? (
            <PatrimoineEmpty type={type} lang={lang} />
          ) : (
            <>
              <div className="card">
                <div className="card-title"><Wallet size={15} color="#2ACB8A" /> {t(lang, 'premiumContributions')}</div>
                <div className="summary-grid">
                  <div className="stat"><span className="stat-l">{t(lang, 'patCapital')}</span><span className="stat-v">{fmtFCFA(plan.amount)}</span></div>
                  <div className="stat"><span className="stat-l">{t(lang, 'patMonthly')}</span><span className="stat-v">{fmtFCFA(plan.monthly)}</span></div>
                  <div className="stat"><span className="stat-l">{t(lang, 'premiumInvested')}</span><span className="stat-v">{fmtFCFA(plan.invested)}</span></div>
                  <div className="stat"><span className="stat-l">{t(lang, 'premiumCashBuffer')}</span><span className="stat-v">{fmtFCFA(plan.cash_buffer)}</span></div>
                  <div className="stat up"><span className="stat-l">{t(lang, 'premiumContributions')}</span><span className="stat-v">{fmtFCFA(plan.total_contributions)}</span></div>
                  <div className="stat gold"><span className="stat-l">{t(lang, 'premiumGain')}</span><span className="stat-v">{plan.gain >= 0 ? '+' : ''}{fmtFCFA(plan.gain)}</span></div>
                </div>
                <div className="sum-hint">{t(lang, 'premiumCashHint')}</div>
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
              </div>
              <div className="disclaimer">{t(lang, 'premiumDisclaimer')}</div>
            </>
          )}
          <div className="footer-note">Bluerock © 2026</div>
        </>
      )}
    </PatrimoineShell>
  )
}
