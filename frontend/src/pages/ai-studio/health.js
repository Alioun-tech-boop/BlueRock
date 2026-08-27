import { Gauge, Database, Layers } from 'lucide-react'
import AiShell from '../../components/AiShell'
import { SectionHead, HealthBar, fmtPct, fmtDate, NA, FACTOR_LABELS } from '../../components/AiBits'
import { t } from '../../lib/i18n'

export default function AiHealth() {
  return (
    <AiShell section="health">
      {({ h, dims, dq, features, models }) => {
        const status = h.global_status || 'OPERATIONAL'
        return (
          <>
            <div className="ai-section">
              <SectionHead id="health" icon={<Gauge size={15} />} title={t('aiStudioHealth')} sub={h.checked_at ? fmtDate(h.checked_at) : ''} />
              <div className={`ai-health-card ${status.toLowerCase()}`}>
                <div className="ai-health-status">
                  <span className={`ai-badge hlth ${status.toLowerCase()}`}>
                    <span className="ai-dot" /> {status}
                  </span>
                </div>
                <div className="ai-health-dims">
                  <HealthBar label={t('aiStudioQualityData')} value={dims.data} />
                  <HealthBar label={t('aiStudioModelName')} value={dims.model} />
                  <HealthBar label={t('aiStudioRisk')} value={dims.risk} />
                  <HealthBar label="Execution" value={dims.execution} />
                  <HealthBar label="System" value={dims.system} />
                </div>
              </div>
            </div>

            {dq.length > 0 && (
              <div className="ai-section">
                <SectionHead id="dq" icon={<Database size={15} />} title={t('aiStudioQualityData')} />
                <div className="ai-dq-list">
                  {dq.map((q) => (
                    <div key={q.source} className="ai-dq-row">
                      <div className="ai-dq-main">
                        <b>{q.source}</b>
                        <span>{q.check_date ? fmtDate(q.check_date) : NA}</span>
                      </div>
                      <div className="ai-dq-nums">
                        <span>{t('aiStudioFreshness')} <b>{fmtPct(q.freshness)}</b></span>
                        <span>{t('aiStudioCompleteness')} <b>{fmtPct(q.completeness)}</b></span>
                        <span className={`ai-dq-status ${(q.status || '').toLowerCase()}`}>{q.status || NA}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {features.length > 0 && (
              <div className="ai-section">
                <SectionHead id="feat" icon={<Layers size={15} />} title={t('aiStudioFeature')}s />
                <div className="ai-feat-card">
                  <div className="ai-dq-title"><Layers size={13} /> {t('aiStudioFeature')}s</div>
                  <div className="ai-feat-row">
                    {features.map((f) => (
                      <span key={f.code} className="ai-feat-chip">
                        {FACTOR_LABELS[f.code] || f.name}
                        <i>{f.default_weight != null ? `${Math.round(f.default_weight * 100)}%` : ''}</i>
                      </span>
                    ))}
                  </div>
                  {models.length > 0 && models[0].versions && models[0].versions.length > 0 && (
                    <div className="ai-model-info">
                      <span>{t('aiStudioModelName')}: <b>{models[0].name}</b> · {t('aiStudioVersion')} <b>{models[0].versions[models[0].versions.length - 1].version}</b></span>
                      <span>{t('aiStudioAlgorithm')}: <b>{(models[0].versions[models[0].versions.length - 1].algorithms || []).join(', ') || NA}</b></span>
                      <span>{t('aiStudioDataset')}: <b>{models[0].versions[models[0].versions.length - 1].dataset || NA}</b></span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )
      }}
    </AiShell>
  )
}
