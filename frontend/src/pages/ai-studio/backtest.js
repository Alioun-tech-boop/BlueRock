import { useState } from 'react'
import { BarChart3, FileDown, FileText, Download, ClipboardCheck, Check } from 'lucide-react'
import AiShell from '../../components/AiShell'
import { Stat, SectionHead, fmtPct, fmtNum, NA, fmtTime, downloadBlob } from '../../components/AiBits'
import { exportAiDecisions, exportAiAudit, exportAiReport } from '../../services/api'
import { t } from '../../lib/i18n'

function ExportButton({ label, icon: Icon, run, done }) {
  return (
    <button className={`ai-exp-btn ${done ? 'done' : ''}`} onClick={run}>
      {done ? <Check size={14} /> : <Icon size={14} />}
      {label}
    </button>
  )
}

export default function AiBacktest() {
  const [dl, setDl] = useState({})
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const go = async (key, fn) => {
    try {
      const res = await fn()
      downloadBlob(res, key)
      setDl((p) => ({ ...p, [key]: true }))
      setTimeout(() => setDl((p) => ({ ...p, [key]: false })), 2500)
    } catch (e) { /* noop */ }
  }

  return (
    <AiShell section="bt">
      {({ bt }) => {
        const m = bt && bt.metrics ? bt.metrics : null
        const attr = m && m.attribution ? m.attribution : null
        const maxAbs = attr && attr.sectors && attr.sectors.length
          ? Math.max(...attr.sectors.map((s) => Math.abs(s.contribution || 0)), 1)
          : 1
        return (
          <>
            <div className="ai-section">
              <SectionHead id="bt" icon={<BarChart3 size={15} />} title={t('aiStudioBacktest')} sub={bt && bt.completed_at ? fmtTime(bt.completed_at) : ''} />
              {m ? (
                <>
                  <div className="ai-bt-note">
                    <BarChart3 size={13} />
                    <span>
                      {t('aiStudioBacktestNote')} · {m.period_start} → {m.period_end} · Top {m.top_k}/{m.universe_size} · rebalance {m.rebalance_days}j · {m.rebalances} {t('aiStudioRebalances').toLowerCase()}
                    </span>
                  </div>
                  <div className="ai-grid">
                    <Stat label={t('aiStudioTotalReturn')} value={fmtPct(m.total_return)} accent={m.total_return != null && m.total_return > 0 ? 'pos' : m.total_return != null && m.total_return < 0 ? 'neg' : ''} />
                    <Stat label={t('aiStudioBenchmarkReturn')} value={fmtPct(m.benchmark_total_return)} accent={m.benchmark_total_return != null && m.benchmark_total_return > 0 ? 'pos' : m.benchmark_total_return != null && m.benchmark_total_return < 0 ? 'neg' : ''} />
                    <Stat label={t('aiStudioAlpha')} value={fmtPct(m.alpha)} accent={m.alpha != null && m.alpha > 0 ? 'pos' : m.alpha != null && m.alpha < 0 ? 'neg' : ''} />
                    <Stat label={t('aiStudioWinRate')} value={fmtPct(m.win_rate)} />
                    <Stat label={t('aiStudioCagr')} value={fmtPct(m.cagr)} accent={m.cagr != null && m.cagr > 0 ? 'pos' : m.cagr != null && m.cagr < 0 ? 'neg' : ''} />
                    <Stat label="CAGR bench." value={fmtPct(m.benchmark_cagr)} />
                    <Stat label={t('aiStudioSharpe')} value={fmtNum(m.sharpe_ratio)} />
                    <Stat label={t('aiStudioVolatility')} value={fmtPct(m.annualized_volatility)} />
                    <Stat label={t('aiStudioBenchmarkVol')} value={fmtPct(m.benchmark_volatility)} />
                    <Stat label={t('aiStudioMaxDrawdown')} value={fmtPct(m.max_drawdown)} accent="neg" />
                    <Stat label={t('aiStudioBenchmarkDd')} value={fmtPct(m.benchmark_max_drawdown)} accent="neg" />
                    <Stat label={t('aiStudioObservations')} value={m.observations != null ? String(m.observations) : NA} />
                    {m.fee_pct != null && <Stat label={t('aiStudioFees')} value={`${(m.fee_pct * 100).toFixed(2)}%`} />}
                    {m.slippage_pct != null && <Stat label={t('aiStudioSlippage')} value={`${(m.slippage_pct * 100).toFixed(2)}%`} />}
                    {m.transaction_costs_pct != null && <Stat label={t('aiStudioCosts')} value={fmtPct(m.transaction_costs_pct)} />}
                  </div>

                  {attr && (
                    <div className="ai-sec-card" style={{ marginTop: 12 }}>
                      <div className="ai-sec-title">{t('aiStudioAttribution')}</div>
                      <div className="ai-attr-row">
                        <span className="ai-attr-label">{t('aiStudioBetaContrib')}</span>
                        <div className="ai-attr-track">
                          <div className={`ai-attr-bar ${(attr.beta_contribution || 0) >= 0 ? 'pos' : 'neg'}`}
                            style={{ width: `${Math.min(50, (Math.abs(attr.beta_contribution || 0) / 1) * 50)}%` }} />
                        </div>
                        <span className="ai-attr-val">{fmtPct(attr.beta_contribution)}</span>
                      </div>
                      <div className="ai-attr-row">
                        <span className="ai-attr-label">{t('aiStudioAlphaContrib')}</span>
                        <div className="ai-attr-track">
                          <div className={`ai-attr-bar ${(attr.alpha_contribution || 0) >= 0 ? 'pos' : 'neg'}`}
                            style={{ width: `${Math.min(50, (Math.abs(attr.alpha_contribution || 0) / 1.5) * 50)}%` }} />
                        </div>
                        <span className="ai-attr-val">{fmtPct(attr.alpha_contribution)}</span>
                      </div>
                      {attr.sectors && attr.sectors.length > 0 && (
                        <>
                          <div className="ai-contr-title" style={{ marginTop: 12 }}>{t('aiStudioSectorAlloc')}</div>
                          {attr.sectors.map((s) => (
                            <div key={s.sector} className="ai-attr-row">
                              <span className="ai-attr-label">{s.sector} <i style={{ fontStyle: 'normal', color: 'var(--tv-text-muted)' }}>({(s.avg_weight * 100).toFixed(0)}%)</i></span>
                              <div className="ai-attr-track">
                                <div className={`ai-attr-bar ${(s.contribution || 0) >= 0 ? 'pos' : 'neg'}`}
                                  style={{ width: `${Math.min(50, (Math.abs(s.contribution || 0) / maxAbs) * 50)}%` }} />
                              </div>
                              <span className="ai-attr-val">{fmtPct(s.contribution)}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="ai-card-dec">
                  <div className="ai-dec-empty"><BarChart3 size={16} /><span>{NA}</span></div>
                </div>
              )}
            </div>

            <div className="ai-section">
              <SectionHead id="exports" icon={<Download size={15} />} title={t('aiStudioExports')} />
              <div className="ai-exp-row">
                <ExportButton label={t('aiStudioExportCsv')} icon={FileDown} done={dl.csv}
                  run={() => go('csv', () => exportAiDecisions('csv', 200))} />
                <ExportButton label={t('aiStudioExportPdf')} icon={FileText} done={dl.pdf}
                  run={() => go('pdf', () => exportAiDecisions('pdf', 100))} />
                <ExportButton label={t('aiStudioExportAudit')} icon={ClipboardCheck} done={dl.audit}
                  run={() => go('audit', () => exportAiAudit(200))} />
                <ExportButton label={`${t('aiStudioExportReport')} ${month}`} icon={FileText} done={dl.report}
                  run={() => go('report', () => exportAiReport(month))} />
              </div>
              <div className="ai-admin-note">
                {t('aiStudioExportNote')}
              </div>
            </div>
          </>
        )
      }}
    </AiShell>
  )
}
