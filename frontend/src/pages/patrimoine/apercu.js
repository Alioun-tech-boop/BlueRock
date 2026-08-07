import PatrimoineShell from '../../components/PatrimoineShell'
import PatrimoineSectionStyles from '../../components/PatrimoineSectionStyles'
import PatrimoineEmpty from '../../components/PatrimoineEmpty'
import { fmtFCFA, fmtPct, fmtDate, progressPctOf } from '../../lib/plan'
import { t } from '../../lib/i18n'
import { cancelPremiumPlan } from '../../services/api'
import { Activity, CheckCircle2, XCircle, Sparkles, Wallet, Bell, X } from 'lucide-react'

export default function Apercu() {
  return (
    <PatrimoineShell section="apercu">
      {({ plan, type, lang, reload }) => (
        <>
          <PatrimoineSectionStyles />
          {!plan ? (
            <PatrimoineEmpty type={type} lang={lang} />
          ) : (
            <>
              <div className={`status-card ${plan.status}`}>
                <div className="status-head">
                  {plan.status === 'active' && <div className="status-badge active"><Activity size={12} /> {t(lang, 'planStatusActive')}</div>}
                  {plan.status === 'completed' && <div className="status-badge completed"><CheckCircle2 size={12} /> {t(lang, 'planStatusCompleted')}</div>}
                  {plan.status === 'cancelled' && <div className="status-badge cancelled"><XCircle size={12} /> {t(lang, 'planStatusCancelled')}</div>}
                  <span className="status-id">#{plan.id}</span>
                </div>
                <div className="status-dates">
                  {plan.issued_at && <div><span className="stat-l">{t(lang, 'planIssued')}</span><b>{fmtDate(plan.issued_at)}</b></div>}
                  {plan.matured_at && plan.status !== 'cancelled' && <div><span className="stat-l">{t(lang, 'planMaturity')}</span><b>{fmtDate(plan.matured_at)}</b></div>}
                  {(plan.cancelled_at || plan.completed_at) && <div><span className="stat-l">{t(lang, 'planMaturity')}</span><b>{fmtDate(plan.cancelled_at || plan.completed_at)}</b></div>}
                  {plan.status === 'active' && <div><span className="stat-l">{t(lang, 'planLiveValue')}</span><b className="green">{fmtFCFA(plan.last_value)}</b></div>}
                  {plan.status === 'active' && <div><span className="stat-l">{t(lang, 'planLivePnl')}</span><b className={(plan.last_pnl_pct || 0) >= 0 ? 'green' : 'red'}>{fmtPct(plan.last_pnl_pct)}</b></div>}
                </div>
                {plan.status === 'active' && (
                  <div className="progress-row">
                    <span className="stat-l">{t(lang, 'planElapsed')}</span>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPctOf(plan)}%` }} /></div>
                    <span className="progress-txt">{progressPctOf(plan).toFixed(0)}%</span>
                  </div>
                )}
                {plan.status === 'cancelled' && <div className="status-note">{t(lang, 'planCancelledNote').replace('{d}', fmtDate(plan.cancelled_at))}</div>}
                {plan.status === 'completed' && <div className="status-note">{t(lang, 'planCompletedNote').replace('{d}', fmtDate(plan.completed_at)).replace('{p}', fmtPct(plan.last_pnl_pct))}</div>}
                {plan.status === 'active' && <div className="emitted-note"><Sparkles size={12} color="#2ACB8A" /> {t(lang, 'planEmittedBanner')}</div>}
                {plan.status === 'active' && (
                  <button
                    className="cancel-btn"
                    onClick={async () => {
                      if (!window.confirm(t(lang, 'planCancelConfirm'))) return
                      try { await cancelPremiumPlan(plan.id) } catch {}
                      reload()
                    }}
                  >
                    <X size={14} /> {t(lang, 'planCancelBtn')}
                  </button>
                )}
              </div>

              {plan.status === 'active' && plan.coverage && (
                <div className="card">
                  <div className="card-title"><Wallet size={15} color="#4ea8ff" /> {t(lang, 'planCoverage')}</div>
                  <div className="coverage-bar"><div className="coverage-fill" style={{ width: `${Math.min(100, plan.coverage.coverage_pct)}%` }} /></div>
                  <div className="coverage-val">
                    <b className={plan.coverage.coverage_pct >= 60 ? 'green' : 'red'}>{fmtPct(plan.coverage.coverage_pct, 0)}</b>
                    <span className="coverage-hint">{t(lang, 'planCoverageHint')}</span>
                  </div>
                </div>
              )}

              {plan.status === 'active' && (
                <div className="card">
                  <div className="card-title"><Bell size={15} color="#a78bfa" /> {t(lang, 'planAlerts')}</div>
                  {plan.alerts && plan.alerts.length > 0 ? (
                    plan.alerts.slice(0, 6).map((a, i) => (
                      <div key={i} className="alert-row">
                        <div className="alert-title">{a.title}</div>
                        {a.body && <div className="alert-body">{a.body}</div>}
                        <div className="alert-date">{a.created_at}</div>
                      </div>
                    ))
                  ) : (
                    <div className="plan-no-alerts">{t(lang, 'planNoAlerts')}</div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="footer-note">BlueRock © 2026</div>
        </>
      )}
    </PatrimoineShell>
  )
}
