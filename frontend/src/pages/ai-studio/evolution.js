import { GitBranch, Database } from 'lucide-react'
import AiShell from '../../components/AiShell'
import { SectionHead, fmtDate, fmtTime } from '../../components/AiBits'
import { t } from '../../lib/i18n'

export default function AiEvolution() {
  return (
    <AiShell section="evo">
      {({ versions, events }) => (
        <>
          <div className="ai-section">
            <SectionHead id="evo" icon={<GitBranch size={15} />} title={t('aiStudioEvolution')} />
            {versions.length ? (
              <div className="ai-timeline">
                {versions.map((v, i) => (
                  <div key={v.version} className={`ai-tl-item ${i === versions.length - 1 ? 'last' : ''}`}>
                    <div className="ai-tl-dot" />
                    <div className="ai-tl-body">
                      <span className="ai-tl-version">{v.version}</span>
                      <span className={`ai-tl-status ${(v.status || '').toLowerCase()}`}>{v.status}</span>
                      <span className="ai-tl-date">{fmtDate(v.promoted_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ai-card-dec"><div className="ai-dec-empty"><Database size={16} /><span>—</span></div></div>
            )}
          </div>

          <div className="ai-section">
            <SectionHead id="events" icon={<GitBranch size={15} />} title={t('aiStudioEvents')} />
            {events.length ? (
              <div className="ai-events">
                {events.map((e, i) => (
                  <div key={i} className="ai-event-row">
                    <span className="ai-event-type">{e.event_type.replace(/_/g, ' ').toLowerCase()}</span>
                    <span className="ai-event-detail">{e.detail || '—'}</span>
                    <span className="ai-event-date">{fmtTime(e.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ai-card-dec"><div className="ai-dec-empty"><GitBranch size={16} /><span>—</span></div></div>
            )}
          </div>
        </>
      )}
    </AiShell>
  )
}
