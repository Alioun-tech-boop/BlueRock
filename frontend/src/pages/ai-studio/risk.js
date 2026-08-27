import { Shield, AlertTriangle, Layers, Link2, Gauge } from 'lucide-react'
import AiShell from '../../components/AiShell'
import { Stat, SectionHead, fmtPct, fmtNum, NA, DIM_LABELS } from '../../components/AiBits'
import { t } from '../../lib/i18n'

function stressTone(sev) {
  return sev === 'CRITICAL' ? 'critical' : sev === 'WARNING' ? 'warning' : ''
}

export default function AiRisk() {
  return (
    <AiShell section="risk">
      {({ risk }) => {
        const stress = Array.isArray(risk.stress_tests) ? risk.stress_tests : []
        const sec = risk.sector_exposure || {}
        const sectors = Array.isArray(sec.sectors) ? sec.sectors : []
        const corr = risk.correlation || {}
        const limits = risk.limits || {}
        const breaches = Array.isArray(limits.breaches) ? limits.breaches : []
        const secLimit = limits.limits?.max_sector_pct ?? 0.25
        const cur = limits.current || {}
        return (
          <>
            <div className="ai-section">
              <SectionHead id="risk" icon={<Shield size={15} />} title={t('aiStudioRisk')} sub={risk.as_of ? `${t('aiStudioAsOf')} ${new Date(risk.as_of).toLocaleDateString('fr-FR')}` : ''} />
              <div className="ai-grid">
                <Stat label={t('aiStudioVolatility')} value={fmtPct(risk.volatility)} />
                <Stat label={t('aiStudioMaxDrawdown')} value={fmtPct(risk.max_drawdown)} accent={risk.max_drawdown != null && risk.max_drawdown < 0 ? 'neg' : ''} />
                <Stat label={t('aiStudioSharpe')} value={fmtNum(risk.sharpe_ratio)} />
                <Stat label="Sortino" value={fmtNum(risk.sortino_ratio)} />
                <Stat label="Beta" value={fmtNum(risk.beta)} />
                <Stat label="VaR 95" value={fmtPct(risk.var_95)} />
                <Stat label="CVaR 95" value={fmtPct(risk.cvar_95)} />
                <Stat label="Risk score" value={fmtNum(risk.risk_score)} />
              </div>
            </div>

            {stress.length > 0 && (
              <div className="ai-section">
                <SectionHead id="stress" icon={<AlertTriangle size={15} />} title={t('aiStudioStressTests')} sub={t('aiStudioStressSub')} />
                <div className="ai-stress-grid">
                  {stress.map((sc) => (
                    <div key={sc.code} className={`ai-stress-card ${stressTone(sc.severity)}`}>
                      <div className="ai-stress-code">{sc.code}</div>
                      <div className="ai-stress-name">{sc.name}</div>
                      <div className={`ai-stress-imp ${sc.impact_pct != null && sc.impact_pct < 0 ? (stressTone(sc.severity) || 'warning') : ''}`}>
                        {fmtPct(sc.impact_pct)}
                      </div>
                      <div className="ai-stress-meta">
                        {t('aiStudioScenarioVar')} {fmtPct(sc.var_95_scenario)} · {sc.impact_amount != null ? `${Math.abs(sc.impact_amount).toLocaleString('fr-FR')} FCFA` : ''}
                      </div>
                      <div className="ai-stress-desc">{sc.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sectors.length > 0 && (
              <div className="ai-section">
                <SectionHead id="sectors" icon={<Layers size={15} />} title={t('aiStudioSectorExposure')} sub={`HHI ${fmtNum(sec.hhi)} · ${sec.n_positions ?? ''} ${t('aiStudioPositions')}`} />
                <div className="ai-sec-card">
                  {sectors.map((s) => {
                    const over = s.weight != null && secLimit && s.weight > secLimit
                    return (
                      <div key={s.sector} className="ai-sec-row">
                        <span className="ai-sec-name">{s.sector}</span>
                        <div className="ai-sec-track">
                          <div className={`ai-sec-fill ${over ? 'over' : ''}`} style={{ width: `${Math.min(100, (s.weight / Math.max(secLimit * 2, 0.5)) * 100)}%` }} />
                        </div>
                        <span className="ai-sec-pct">{(s.weight * 100).toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="ai-section">
              <SectionHead id="limits" icon={<Gauge size={15} />} title={t('aiStudioLimits')} sub={limits.as_of ? `${t('aiStudioAsOf')} ${limits.as_of}` : ''} />
              <div className="ai-sec-card">
                <div style={{ marginBottom: 8 }}>
                  <span className={`ai-limit-status ${(limits.status || 'OK').toLowerCase()}`}>
                    <span className="ai-dot" /> {limits.status || 'OK'}
                  </span>
                </div>
                {breaches.length > 0 ? (
                  <>
                    <div className="ai-contr-title">{t('aiStudioBreaches')}</div>
                    {breaches.map((b) => (
                      <div key={b.dimension} className="ai-breach-row">
                        <div className="ai-breach-main">
                          <b>{DIM_LABELS[b.dimension] || b.dimension}</b>
                          <span>{(b.current * 100).toFixed(1)}% / {(b.limit * 100).toFixed(1)}%</span>
                        </div>
                        <div className="ai-breach-right">
                          <b>x{b.ratio}</b>
                          <span className={`ai-breach-tag ${b.severity.toLowerCase()}`}>{b.severity}</span>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="ai-dec-empty"><AlertTriangle size={15} /><span>{t('aiStudioNoBreach')}</span></div>
                )}
                {Object.keys(limits.limits || {}).length > 0 && (
                  <div className="ai-limits-mini">
                    {Object.entries(limits.limits).map(([k, v]) => {
                      const c = cur[k]
                      const over = c != null && c > v
                      return <span key={k} className={`ai-limit-chip ${over ? 'over' : ''}`}>{DIM_LABELS[k] || k} {(v * 100).toFixed(0)}%</span>
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="ai-section">
              <SectionHead id="corr" icon={<Link2 size={15} />} title={t('aiStudioCorrelation')} sub={`${corr.n_series ?? 0} ${t('aiStudioSeries')} · ${corr.observations ?? 0}j`} />
              <div className="ai-grid">
                <Stat label={t('aiStudioCorrAvg')} value={fmtNum(corr.avg_correlation)} />
                <Stat label={t('aiStudioCorrMax')} value={corr.max_pair ? `${corr.max_pair.pair} · ${fmtNum(corr.max_pair.correlation)}` : NA} />
              </div>
            </div>
          </>
        )
      }}
    </AiShell>
  )
}
