import { useRouter } from 'next/router'
import PatrimoineShell from '../components/PatrimoineShell'
import PatrimoineSectionStyles from '../components/PatrimoineSectionStyles'
import { PLAN_TYPES, PLAN_ICONS, planTypeMeta, fmtFCFA, fmtPct, progressPctOf } from '../lib/plan'
import { t } from '../lib/i18n'
import { Activity, Plus } from 'lucide-react'

export default function Patrimoine() {
  const router = useRouter()
  return (
    <PatrimoineShell section="hub">
      {({ plans, lang }) => {
        const activePlans = plans.filter(p => p.status === 'active')
        return (
          <>
            <PatrimoineSectionStyles />
            {plans.length === 0 ? (
              <div className="empty-box">
                <div className="empty-ring"><Plus size={30} /></div>
                <div className="empty-title">{t(lang, 'patEmpty')}</div>
                <div className="empty-sub">{t(lang, 'patEmptySub')}</div>
                <button className="empty-btn" onClick={() => router.push('/patrimoine/parametres')}>
                  {t(lang, 'patCreateFirst')}
                </button>
              </div>
            ) : (
              <>
                <div className="summary-grid">
                  <div className="stat gold">
                    <span className="stat-l">{t(lang, 'patTotalValue')}</span>
                    <span className="stat-v">{fmtFCFA(activePlans.reduce((s, p) => s + (p.last_value || 0), 0))}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-l">{t(lang, 'patActiveCount')}</span>
                    <span className="stat-v">{activePlans.length}</span>
                  </div>
                </div>

                {activePlans.map(p => {
                  const meta = planTypeMeta(p.plan_type)
                  const Icon = PLAN_ICONS[meta.icon]
                  const pct = progressPctOf(p)
                  return (
                    <div key={p.id} className="card plan-card">
                      <div className="pc-head">
                        <span className="pc-ico"><Icon size={18} /></span>
                        <div className="pc-info">
                          <div className="pc-name">{t(lang, meta.key)}</div>
                          <div className="pc-sub">{fmtFCFA(p.amount)} · {p.horizon_years} {t(lang, 'years')}</div>
                        </div>
                        <span className="pc-status"><Activity size={12} /> {t(lang, 'planStatusActive')}</span>
                      </div>
                      <div className="pc-grid">
                        <div>
                          <span className="stat-l">{t(lang, 'planLiveValue')}</span>
                          <b className="pc-v">{fmtFCFA(p.last_value)}</b>
                        </div>
                        <div>
                          <span className="stat-l">{t(lang, 'planLivePnl')}</span>
                          <b className={`pc-v ${(p.last_pnl_pct || 0) >= 0 ? 'green' : 'red'}`}>{fmtPct(p.last_pnl_pct)}</b>
                        </div>
                      </div>
                      <div className="progress-row">
                        <span className="stat-l">{t(lang, 'planElapsed')}</span>
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="progress-txt">{pct.toFixed(0)}%</span>
                      </div>
                      <button className="tc-btn primary" onClick={() => router.push(`/patrimoine/apercu?type=${p.plan_type}`)}>
                        {t(lang, 'patViewPlan')}
                      </button>
                    </div>
                  )
                })}

                <div className="card-title-inline">{t(lang, 'patTypes')}</div>
                {PLAN_TYPES.map(pt => {
                  const Icon = PLAN_ICONS[pt.icon]
                  const exist = plans.find(x => x.plan_type === pt.id)
                  const act = exist && exist.status === 'active'
                  return (
                    <div key={pt.id} className="card type-card">
                      <div className="tc-head">
                        <span className="pc-ico"><Icon size={18} /></span>
                        <div className="pc-info">
                          <div className="pc-name">{t(lang, pt.key)}</div>
                          <div className="pc-sub">{t(lang, pt.desc)}</div>
                        </div>
                        {act ? (
                          <span className="pc-status"><Activity size={12} /> {t(lang, 'planStatusActive')}</span>
                        ) : exist ? (
                          <span className="pc-tag muted">{t(lang, 'planStatusCancelled')}</span>
                        ) : (
                          <span className="pc-tag">{t(lang, 'patNew')}</span>
                        )}
                      </div>
                      <div className="tc-cta-row">
                        <button className="tc-btn primary" onClick={() => router.push(`/patrimoine/plan?type=${pt.id}`)}>
                          {exist ? t(lang, 'patViewPlan') : t(lang, 'patCreatePlan')}
                        </button>
                        {exist && (
                          <button className="tc-btn ghost" onClick={() => router.push(`/patrimoine/apercu?type=${pt.id}`)}>
                            {t(lang, 'patOverview')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
            <div className="footer-note">BlueRock © 2026</div>
            <style jsx>{`
              .plan-card .stat-l { font-size: 13px; }
              .pc-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
              .pc-ico {
                width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
                display: flex; align-items: center; justify-content: center;
                background: rgba(42,203,138,0.14); color: #2ACB8A;
              }
              .pc-info { flex: 1; min-width: 0; }
              .pc-name { font-size: 16px; font-weight: 700; color: #F7F8FA; }
              .pc-sub { font-size: 13px; font-weight: 400; color: #8C99AF; font-variant-numeric: tabular-nums; }
              .pc-status {
                display: flex; align-items: center; gap: 5px; flex-shrink: 0;
                font-size: 11px; font-weight: 700; color: #2ACB8A;
                background: rgba(42,203,138,0.12); padding: 4px 10px; border-radius: 999px;
              }
              .pc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
              .pc-grid > div { display: flex; flex-direction: column; gap: 2px; }
              .pc-v { font-size: 17px; font-weight: 700; color: #F7F8FA; font-variant-numeric: tabular-nums; }
              .type-card .pc-sub { font-size: 12px; line-height: 1.4; }
              .pc-tag {
                flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
                color: #2ACB8A; background: rgba(42,203,138,0.12);
              }
              .pc-tag.muted { color: #8996AE; background: #1C2740; }
              .tc-cta-row { display: flex; gap: 10px; margin-top: 14px; }
              .tc-btn {
                flex: 1; height: 46px; border-radius: 14px; border: none; cursor: pointer;
                font-family: inherit; font-size: 14px; font-weight: 700; letter-spacing: 0.25px;
                display: flex; align-items: center; justify-content: center;
              }
              .tc-btn.primary { background: #FFFFFF; color: #111111; }
              .tc-btn.ghost { flex: 0 0 auto; padding: 0 22px; background: transparent; border: 1px solid #46536A; color: #F7F8FA; }
            `}</style>
          </>
        )
      }}
    </PatrimoineShell>
  )
}
