import { Activity } from 'lucide-react'
import AiShell from '../../components/AiShell'
import { SectionHead, fmtTime, ActivityIcon } from '../../components/AiBits'
import { t } from '../../lib/i18n'

export default function AiActivity() {
  return (
    <AiShell section="act">
      {({ activity }) => (
        <>
          <div className="ai-section">
            <SectionHead id="act" icon={<Activity size={15} />} title={t('aiStudioActivity')} sub={`${activity.length}`} />
            {activity.length ? (
              <div className="ai-activity">
                {activity.map((a, i) => (
                  <div key={i} className="ai-act-row">
                    <ActivityIcon kind={a.kind} />
                    <div className="ai-act-body">
                      <span className="ai-act-label">{a.label}</span>
                      <span className="ai-act-detail">{a.detail}</span>
                    </div>
                    <div className="ai-act-right">
                      <span className={`ai-act-status ${(a.status || '').toLowerCase()}`}>{a.status || '—'}</span>
                      <span className="ai-act-time">{fmtTime(a.ts)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ai-card-dec">
                <div className="ai-dec-empty">
                  <Activity size={17} />
                  <span>{t('aiStudioEmptyActivity')}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </AiShell>
  )
}
