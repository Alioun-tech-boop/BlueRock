import { useState } from 'react'
import { Brain, Zap, Loader2 } from 'lucide-react'
import AiShell from '../../components/AiShell'
import { SectionHead, DecisionCard, FACTOR_LABELS, DIM_LABELS, fmtPct } from '../../components/AiBits'
import { getAiDecisionDetail } from '../../services/api'
import { t } from '../../lib/i18n'

function rawEntries(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).filter(([, v]) => v !== null && v !== undefined)
}

function DetailPanel({ detail }) {
  if (!detail) return null
  const maxAbs = detail.factors && detail.factors.length
    ? Math.max(...detail.factors.map((f) => Math.abs(f.contribution || 0)), 1)
    : 1
  const raws = rawEntries(detail.raw_inputs).slice(0, 12)
  return (
    <div className="ai-dec-detail">
      {detail.narrative && <div className="ai-dec-detail-narr">{detail.narrative}</div>}
      {detail.factors && detail.factors.length > 0 && (
        <>
          <div className="ai-contr-title">{t('aiStudioContribution')}</div>
          {detail.factors.map((f) => (
            <div key={f.factor} className="ai-contr-row">
              <span className="ai-contr-label">{FACTOR_LABELS[f.factor] || f.factor}</span>
              <div className="ai-contr-track">
                <div className={`ai-contr-bar ${(f.contribution || 0) >= 0 ? 'pos' : 'neg'}`}
                  style={{ width: `${Math.min(50, (Math.abs(f.contribution || 0) / maxAbs) * 50)}%` }} />
              </div>
              <span className={`ai-contr-val ${(f.contribution || 0) >= 0 ? 'pos' : 'neg'}`}>
                {f.contribution != null ? `${f.contribution >= 0 ? '+' : ''}${f.contribution.toFixed(1)}` : '—'}
                {f.share_pct != null ? ` · ${Math.round(f.share_pct)}%` : ''}
              </span>
            </div>
          ))}
        </>
      )}
      {raws.length > 0 && (
        <>
          <div className="ai-contr-title">{t('aiStudioRawInputs')}</div>
          <div className="ai-raw-grid">
            {raws.map(([k, v]) => (
              <div key={k} className="ai-raw-item">
                <span>{k}</span>
                <b>{typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : String(v)}</b>
              </div>
            ))}
          </div>
        </>
      )}
      {detail.thresholds && (
        <div className="ai-dec-thr">
          <span>Buy ≥ <b>{Math.round(detail.thresholds.buy * 100)}</b></span>
          <span>Sell ≤ <b>{Math.round(detail.thresholds.sell * 100)}</b></span>
          {detail.composite_score != null && <span>{t('aiStudioScore')} <b>{detail.composite_score > 0 ? '+' : ''}{detail.composite_score.toFixed(1)}/100</b></span>}
        </div>
      )}
    </div>
  )
}

export default function AiDecisions() {
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const toggle = async (d) => {
    if (openId === d.id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(d.id)
    setLoading(true)
    setFailed(false)
    try {
      const res = await getAiDecisionDetail(d.id)
      setDetail(res.data)
    } catch (e) {
      setFailed(true)
      setDetail(null)
    }
    setLoading(false)
  }

  return (
    <AiShell section="dec">
      {({ decisions }) => (
        <>
          <div className="ai-section">
            <SectionHead id="dec" icon={<Brain size={15} />} title={t('aiStudioDecisions')} sub={`${decisions.length} ${t('aiStudioDecisionCount')} · ${t('aiStudioTapForDetail')}`} />
            {decisions.length ? (
              <div className="ai-dec-list">
                {decisions.map((d) => (
                  <div key={d.id} className="ai-dec-wrap">
                    <div className={`ai-dec-click ${openId === d.id ? 'open' : ''}`}>
                      <DecisionCard d={d} open={openId === d.id} onToggle={() => toggle(d)} />
                    </div>
                    {openId === d.id && (
                      loading ? (
                        <div className="ai-dec-detail" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tv-text-muted)' }}>
                          <Loader2 size={15} className="ai-spin" /> {t('aiStudioLoadingDetail')}
                        </div>
                      ) : failed ? (
                        <div className="ai-dec-detail" style={{ color: '#F04438', fontSize: 12 }}>{t('chatError')}</div>
                      ) : (
                        <DetailPanel detail={detail} />
                      )
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="ai-card-dec">
                <div className="ai-dec-empty">
                  <Zap size={18} />
                  <span>{t('aiStudioEmptyDecisions')}</span>
                </div>
              </div>
            )}
          </div>
          <style jsx>{`
            .ai-spin { animation: spin 1s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </>
      )}
    </AiShell>
  )
}
