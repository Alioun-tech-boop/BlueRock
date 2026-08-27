import { useRouter } from 'next/router'
import {
  TrendingUp, Shield, PieChart, Brain, BarChart3, Gauge, GitBranch,
  Activity, ChevronRight, Sparkles, Zap, ArrowRight, Bell, AlertTriangle,
} from 'lucide-react'
import AiShell from '../components/AiShell'
import { Stat, fmtPct, fmtMoney, fmtTime, fmtDate, signAccent, ActivityIcon } from '../components/AiBits'
import { t } from '../lib/i18n'

const CARDS = [
  { id: 'perf', key: 'aiStudioPerformance', icon: TrendingUp, tone: '', path: '/ai-studio/performance' },
  { id: 'risk', key: 'aiStudioRisk', icon: Shield, tone: 'cyan', path: '/ai-studio/risk' },
  { id: 'port', key: 'aiStudioPortfolio', icon: PieChart, tone: 'green', path: '/ai-studio/portfolio' },
  { id: 'dec', key: 'aiStudioDecisions', icon: Brain, tone: 'violet', path: '/ai-studio/decisions' },
  { id: 'bt', key: 'aiStudioBacktest', icon: BarChart3, tone: 'pink', path: '/ai-studio/backtest' },
  { id: 'health', key: 'aiStudioHealth', icon: Gauge, tone: 'amber', path: '/ai-studio/health' },
  { id: 'evo', key: 'aiStudioEvolution', icon: GitBranch, tone: 'cyan', path: '/ai-studio/evolution' },
  { id: 'act', key: 'aiStudioActivity', icon: Activity, tone: '', path: '/ai-studio/activity' },
]

export default function AiStudio() {
  const router = useRouter()

  return (
    <AiShell section="hub" back="/explorer">
      {({ s, perf, risk, port, h, bt, decisions, activity, versions, alerts }) => {
        const preview = (card) => {
          switch (card.id) {
            case 'perf':
              return <><b>{fmtPct(perf.since_launch)}</b> · {t('aiStudioSinceLaunch')}</>
            case 'risk':
              return risk.risk_score != null ? <><b>{risk.risk_score}</b>/100 · {t('aiStudioRisk')}</> : <span>{t('aiStudioNA')}</span>
            case 'port':
              return <><b>{fmtMoney(port.value, s.environment)}</b> · {port.positions_count != null ? `${port.positions_count} ${t('aiStudioPositions')}` : ''}</>
            case 'dec':
              return <><b>{decisions.length}</b> · {t('aiStudioDecisionCount')}</>
            case 'bt':
              return bt && bt.metrics ? <><b>{fmtPct(bt.metrics.total_return)}</b> · {t('aiStudioTotalReturn')}</> : <span>{t('aiStudioNA')}</span>
            case 'health':
              return <><b>{h.global_status || 'OPERATIONAL'}</b> · {t('aiStudioDimensions')}</>
            case 'evo':
              return <><b>{versions.length}</b> · {t('aiStudioVersion')}s</>
            case 'act':
              return <><b>{activity.length}</b> · {t('aiStudioActivity')}</>
            default:
              return null
          }
        }

        return (
          <>
            <div className="ai-hero">
              <div className="ai-hero-orb" />
              <div className="ai-hero-top">
                <div className="ai-hero-logo"><Brain size={22} /></div>
                <div className="ai-hero-id">
                  <span className="ai-hero-name">{t('aiStudioTitle')}</span>
                  <span className="ai-hero-sub">BlueRock {t('aiStudioNav')} · Core</span>
                </div>
                <div className="ai-hero-badges">
                  <span className="ai-badge active"><span className="ai-dot" /> {t('aiStudioActive')}</span>
                </div>
              </div>
              <div className="ai-hero-version">
                <span className="ai-hero-version-tag">{s.version || 'N/A'}</span>
                <span className="ai-hero-version-label">{t('aiStudioVersion')}</span>
              </div>
              <div className="ai-hero-grid">
                <div><span>{t('aiStudioMarket')}</span><b>{s.market || 'BRVM'}</b></div>
                <div><span>{t('aiStudioStrategy')}</span><b>{s.strategy || 'N/A'}</b></div>
                <div><span>{t('aiStudioBenchmark')}</span><b>{s.benchmark?.name || 'N/A'}</b></div>
                <div><span>{t('aiStudioLaunch')}</span><b>{fmtDate(s.launch_date)}</b></div>
                <div><span>{t('aiStudioUpdated')}</span><b>{fmtTime(s.last_update)}</b></div>
              </div>
            </div>

            <div className="ai-observer">
              <span className="info-badge"><Sparkles size={14} /></span>
              <span>{t('aiStudioObserver')}</span>
            </div>

            <div className="ai-section">
              <div className="ai-section-head">
                <BarChart3 size={15} />
                <span>{t('aiStudioOverview')}</span>
              </div>
              <div className="ai-overview-grid">
                <Stat label={t('aiStudioPortfolio')} value={fmtMoney(port.value, s.environment)} sub={`${port.positions_count != null ? port.positions_count : '0'} ${t('aiStudioPositions')}`} />
                <Stat label={t('aiStudioSinceLaunch')} value={fmtPct(perf.since_launch)} accent={signAccent(perf.since_launch)} />
                <Stat label={t('aiStudioDecisions')} value={decisions.length} />
                <Stat label={t('aiStudioHealth')} value={h.global_status || 'OPERATIONAL'} accent={h.global_status === 'OPERATIONAL' ? 'pos' : ''} />
                {bt && bt.metrics ? (
                  <>
                    <Stat label={t('aiStudioBacktest')} value={fmtPct(bt.metrics.total_return)} accent={signAccent(bt.metrics.total_return)} sub={`${t('aiStudioAlpha')} ${fmtPct(bt.metrics.alpha)}`} />
                    <Stat label={t('aiStudioSharpe')} value={bt.metrics.sharpe_ratio != null ? bt.metrics.sharpe_ratio.toFixed(2) : 'N/A'} sub={`${t('aiStudioWinRate')} ${fmtPct(bt.metrics.win_rate)}`} />
                  </>
                ) : null}
              </div>
            </div>

            {alerts.length > 0 && (
              <div className="ai-section">
                <div className="ai-section-head">
                  <Bell size={15} />
                  <span>{t('aiStudioAlerts')}</span>
                  <span className="ai-section-sub">{alerts.length}</span>
                </div>
                <div className="ai-alert-list">
                  {alerts.slice(0, 3).map((a) => (
                    <div key={a.id} className={`ai-alert-row ${(a.severity || 'info').toLowerCase()}`}>
                      <span className="ai-alert-ico"><AlertTriangle size={14} /></span>
                      <div className="ai-alert-body">
                        <span className="ai-alert-title">{a.title}</span>
                        <span className="ai-alert-detail">{a.body}</span>
                      </div>
                      <div className="ai-alert-time">
                        <span className={`ai-alert-sev ${(a.severity || 'info').toLowerCase()}`}>{a.severity || 'INFO'}</span>
                        <div style={{ marginTop: 3 }}>{fmtTime(a.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ai-section">
              <div className="ai-section-head">
                <Zap size={15} />
                <span>{t('aiStudioSections')}</span>
              </div>              <div className="ai-cards-grid">
                {CARDS.map((card) => {
                  const Icon = card.icon
                  return (
                    <button key={card.id} className="ai-card" onClick={() => router.push(card.path)}>
                      <span className={`ai-card-ico ${card.tone}`}><Icon size={17} /></span>
                      <span className="ai-card-name">{t(card.key)}</span>
                      <span className="ai-card-preview">{preview(card)}</span>
                      <ChevronRight size={14} className="ai-card-arrow" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="ai-section">
              <div className="ai-section-head">
                <Activity size={15} />
                <span>{t('aiStudioRecent')}</span>
              </div>
              {activity.length ? (
                <>
                  <div className="ai-activity">
                    {activity.slice(0, 5).map((a, i) => (
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
                  <button className="ai-see-all" onClick={() => router.push('/ai-studio/activity')}>
                    {t('aiStudioSeeAll')} <ArrowRight size={13} />
                  </button>
                </>
              ) : (
                <div className="ai-card-dec">
                  <div className="ai-dec-empty">
                    <Activity size={17} />
                    <span>{t('aiStudioEmptyActivity')}</span>
                  </div>
                </div>
              )}
            </div>

            <style jsx>{`
              .info-badge {
                flex: 0 0 auto; width: 26px; height: 26px; border-radius: 9px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(76,141,255,0.15); color: #4C8DFF;
              }
              .ai-card-arrow { position: absolute; top: 12px; right: 10px; color: var(--tv-text-muted); }
              .ai-card { position: relative; }
            `}</style>
          </>
        )
      }}
    </AiShell>
  )
}
