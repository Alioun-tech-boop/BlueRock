import { TrendingUp } from 'lucide-react'
import AiShell from '../../components/AiShell'
import PerformanceChart from '../../components/ai/PerformanceChart'
import { Stat, SectionHead, fmtPct, signAccent } from '../../components/AiBits'
import { t } from '../../lib/i18n'

export default function AiPerformance() {
  return (
    <AiShell section="perf">
      {({ perf }) => (
        <>
          <div className="ai-section">
            <SectionHead id="perf" icon={<TrendingUp size={15} />} title={t('aiStudioPerformance')} />
            <div className="ai-grid">
              <Stat label={t('aiStudioSinceLaunch')} value={fmtPct(perf.since_launch)} accent={signAccent(perf.since_launch)} />
              <Stat label="1D" value={fmtPct(perf.return_1d)} accent={signAccent(perf.return_1d)} />
              <Stat label="1W" value={fmtPct(perf.return_1w)} accent={signAccent(perf.return_1w)} />
              <Stat label="1M" value={fmtPct(perf.return_1m)} accent={signAccent(perf.return_1m)} />
              <Stat label="3M" value={fmtPct(perf.return_3m)} accent={signAccent(perf.return_3m)} />
              <Stat label="6M" value={fmtPct(perf.return_6m)} accent={signAccent(perf.return_6m)} />
              <Stat label="YTD" value={fmtPct(perf.return_ytd)} accent={signAccent(perf.return_ytd)} />
              <Stat label="1Y" value={fmtPct(perf.return_1y)} accent={signAccent(perf.return_1y)} />
              <Stat label={t('aiStudioAnnualized')} value={fmtPct(perf.return_annualized)} accent={signAccent(perf.return_annualized)} />
            </div>
            <PerformanceChart points={perf.points} />
          </div>
        </>
      )}
    </AiShell>
  )
}
