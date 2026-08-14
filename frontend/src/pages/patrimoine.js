import { useRouter } from 'next/router'
import PatrimoineShell from '../components/PatrimoineShell'
import PatrimoineSectionStyles from '../components/PatrimoineSectionStyles'
import { PLAN_TYPES, PLAN_ICONS, planTypeMeta, fmtFCFA, fmtPct, progressPctOf } from '../lib/plan'
import { t } from '../lib/i18n'
import { Activity, Plus, ArrowUpRight, Sparkles } from 'lucide-react'

export default function Patrimoine() {
  const router = useRouter()
  return (
    <PatrimoineShell section="hub" back="/portfolio">
      {({ plans, lang }) => {
        const activePlans = plans.filter(p => p.status === 'active')
        const totalValue = activePlans.reduce((s, p) => s + (p.last_value || 0), 0)
        return (
          <>
            <PatrimoineSectionStyles />
            {plans.length === 0 ? (
              <div className="empty-box">
                <div className="empty-ring"><Plus size={30} /></div>
                <div className="empty-title">{t(lang, 'patEmpty')}</div>
                <div className="empty-sub">{t(lang, 'patEmptySub')}</div>
                <button className="empty-btn" onClick={() => router.push('/patrimoine/parametres')}>
                  {t(lang, 'patCreateFirst')} <ArrowUpRight size={18} />
                </button>
              </div>
            ) : (
              <>
                <div className="hero-summary">
                  <div className="hs-orb" />
                  <div className="hs-top">
                    <span className="hs-label">{t(lang, 'patTotalValue')}</span>
                    <span className="hs-badge"><Activity size={12} /> {t(lang, 'patTitle')}</span>
                  </div>
                  <div className="hs-value">{fmtFCFA(totalValue)}</div>
                  <div className="hs-metrics">
                    <div className="hs-m">
                      <span className="hs-m-l">{t(lang, 'patActiveCount')}</span>
                      <b className="hs-m-v">{activePlans.length}</b>
                    </div>
                    {activePlans.length > 0 && (
                      <div className="hs-m">
                        <span className="hs-m-l">{t(lang, 'planStatusActive')}</span>
                        <b className="hs-m-v hs-g">
                          <Sparkles size={13} />
                          {t(lang, 'patViewPlan')}
                        </b>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card-title-inline">{t(lang, 'patTitle')} · {t(lang, 'patTypes')}</div>

                {activePlans.map(p => {
                  const meta = planTypeMeta(p.plan_type)
                  const Icon = PLAN_ICONS[meta.icon]
                  const pct = progressPctOf(p)
                  const pnl = (p.last_pnl_pct || 0)
                  return (
                    <div key={p.id} className="card plan-card">
                      <div className="pc-head">
                        <span className="pc-ico"><Icon size={19} /></span>
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
                          <b className={`pc-v ${pnl >= 0 ? 'green' : 'red'}`}>{fmtPct(pnl)}</b>
                        </div>
                      </div>
                      <div className="progress-row">
                        <span className="stat-l">{t(lang, 'planElapsed')}</span>
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="progress-txt">{pct.toFixed(0)}%</span>
                      </div>
                      <button className="tc-btn primary" onClick={() => router.push(`/patrimoine/apercu?type=${p.plan_type}`)}>
                        {t(lang, 'patViewPlan')} <ArrowUpRight size={17} />
                      </button>
                    </div>
                  )
                })}

                <div className="card-title-inline" style={{ marginTop: 8 }}>{t(lang, 'patTypes')}</div>
                {PLAN_TYPES.map(pt => {
                  const Icon = PLAN_ICONS[pt.icon]
                  const exist = plans.find(x => x.plan_type === pt.id)
                  const act = exist && exist.status === 'active'
                  return (
                    <div key={pt.id} className="card type-card">
                      <div className="tc-head">
                        <span className="pc-ico"><Icon size={19} /></span>
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
                          <ArrowUpRight size={16} />
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
            <div className="footer-note">Bluerock © 2026</div>
            <style jsx>{`
              .plan-card .stat-l { font-size: 13px; }
              .pc-head { display: flex; align-items: center; gap: 13px; margin-bottom: 16px; }
              .pc-ico {
                width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
                display: flex; align-items: center; justify-content: center;
                background: rgba(42,203,138,0.13); color: #2ACB8A;
                border: 1px solid rgba(42,203,138,0.3);
              }
              .pc-info { flex: 1; min-width: 0; }
              .pc-name {
                font-size: 16px; font-weight: 600; color: #F7F8FA; letter-spacing: -0.01em;
                font-family: Inter, sans-serif;
              }
              .pc-sub {
                font-size: 13px; font-weight: 400; color: #8C99AF;
                font-variant-numeric: tabular-nums; margin-top: 2px;
              }
              .pc-status {
                display: flex; align-items: center; gap: 5px; flex-shrink: 0;
                font-size: 11px; font-weight: 600; color: #2ACB8A;
                background: rgba(42,203,138,0.11); border: 1px solid rgba(42,203,138,0.32);
                padding: 5px 11px; border-radius: 999px;
                font-family: Inter, sans-serif;
              }
              .pc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
              .pc-grid > div {
                display: flex; flex-direction: column; gap: 3px;
                background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.05);
                border-radius: 14px; padding: 12px 14px;
              }
              .pc-v {
                font-size: 17px; font-weight: 600; color: #F7F8FA;
                font-variant-numeric: tabular-nums; font-family: Inter, sans-serif;
              }
              .type-card .pc-sub { font-size: 12px; line-height: 1.45; }
              .pc-tag {
                flex-shrink: 0; font-size: 11px; font-weight: 600; padding: 5px 11px; border-radius: 999px;
                color: #2ACB8A; background: rgba(42,203,138,0.11);
                border: 1px solid rgba(42,203,138,0.32);
                font-family: Inter, sans-serif;
              }
              .pc-tag.muted { color: #8996AE; background: #121212; border-color: #242424; }
              .tc-cta-row { display: flex; gap: 10px; margin-top: 16px; }
              .tc-btn {
                flex: 1; height: 48px; border-radius: 15px; border: none; cursor: pointer;
                font-family: inherit; font-size: 14px; font-weight: 600; letter-spacing: 0;
                display: flex; align-items: center; justify-content: center; gap: 7px;
                transition: transform .12s ease;
              }
              .tc-btn:active { transform: scale(0.975); }
              .tc-btn.primary {
                background: #FFFFFF; color: #111111;
                box-shadow: 0 8px 24px -10px rgba(255,255,255,0.3);
              }
              .tc-btn.ghost {
                flex: 0 0 auto; padding: 0 24px; background: transparent;
                border: 1px solid #2A2A2A; color: #F7F8FA;
              }
              .hero-summary {
                position: relative; overflow: hidden;
                background: linear-gradient(150deg, rgba(42,203,138,0.17), rgba(78,168,255,0.05) 55%, rgba(0,0,0,0) 100%);
                border: 1px solid rgba(42,203,138,0.35);
                border-radius: 24px; padding: 22px 22px 20px; margin-bottom: 8px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
              }
              .hs-orb {
                position: absolute; top: -70px; right: -50px; width: 190px; height: 190px;
                border-radius: 50%;
                pointer-events: none;
              }
              .hs-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
              .hs-label {
                font-size: 11px; font-weight: 800; color: #9FACBF;
                letter-spacing: 0.1em; text-transform: uppercase;
                font-family: Inter, sans-serif;
              }
              .hs-badge {
                display: flex; align-items: center; gap: 5px;
                font-size: 11px; font-weight: 700; color: #2ACB8A;
                background: rgba(42,203,138,0.12); border: 1px solid rgba(42,203,138,0.35);
                padding: 5px 11px; border-radius: 999px;
                font-family: Inter, sans-serif;
              }
              .hs-value {
                font-size: 40px; font-weight: 800; color: #F7F8FA; margin-top: 14px;
                font-variant-numeric: tabular-nums; letter-spacing: -0.035em;
                font-family: Inter, sans-serif;
              }
              .hs-metrics {
                display: flex; gap: 10px; margin-top: 18px;
              }
              .hs-m {
                flex: 1; display: flex; flex-direction: column; gap: 3px;
                background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06);
                border-radius: 15px; padding: 12px 14px;
              }
              .hs-m-l { font-size: 10.5px; font-weight: 700; color: #8C99AF; letter-spacing: 0.05em; text-transform: uppercase; }
              .hs-m-v {
                display: flex; align-items: center; gap: 6px;
                font-size: 16px; font-weight: 800; color: #F7F8FA;
                font-variant-numeric: tabular-nums; font-family: Inter, sans-serif; letter-spacing: -0.02em;
              }
              .hs-m-v.hs-g { color: #2ACB8A; font-size: 12px; font-weight: 700; }
            `}</style>
          </>
        )
      }}
    </PatrimoineShell>
  )
}