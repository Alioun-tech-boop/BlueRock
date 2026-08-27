import { PieChart } from 'lucide-react'
import AiShell from '../../components/AiShell'
import { Stat, SectionHead, fmtMoney, fmtPct, NA } from '../../components/AiBits'
import { t } from '../../lib/i18n'

export default function AiPortfolio() {
  return (
    <AiShell section="port">
      {({ s, port, positions }) => (
        <>
          <div className="ai-section">
            <SectionHead id="port" icon={<PieChart size={15} />} title={t('aiStudioPortfolio')} sub={port.name || ''} />
            <div className="ai-grid">
              <Stat label="Valeur" value={fmtMoney(port.value, s.environment)} />
              <Stat label={t('aiStudioPositions')} value={port.positions_count != null ? String(port.positions_count) : NA} />
              <Stat label={t('aiStudioCash')} value={fmtMoney(port.cash, s.environment)} />
              <Stat label={t('aiStudioExposure')} value={fmtPct(port.exposure)} />
            </div>
          </div>

          <div className="ai-section">
            <SectionHead id="list" icon={<PieChart size={15} />} title={t('aiStudioPositionsList')} sub={`${positions.length}`} />
            {positions.length > 0 ? (
              <div className="ai-pos-list">
                <div className="ai-pos-head">
                  <span>{t('aiStudioAsset')}</span>
                  <span>{t('aiStudioAllocation')}</span>
                </div>
                {positions.map((p) => (
                  <div key={p.symbol} className="ai-pos-row">
                    <div className="ai-pos-main">
                      <b>{p.symbol}</b>
                      {p.sector && <span className="ai-pos-sector">{p.sector}</span>}
                      <span className="ai-pos-name">{p.company_name || ''}</span>
                      <span className="ai-pos-nums">
                        {t('aiStudioQuantity')} {p.quantity != null ? Number(p.quantity).toLocaleString('fr-FR') : NA}
                        {p.current_price != null && <i> · {t('aiStudioPrice')} {Number(p.current_price).toLocaleString('fr-FR')}</i>}
                      </span>
                    </div>
                    <div className="ai-pos-right">
                      <b>{(p.allocation_pct != null ? p.allocation_pct * 100 : 0).toFixed(1)}%</b>
                      <div className="ai-pos-bar">
                        <div className="ai-pos-fill" style={{ width: `${Math.max(0, Math.min(100, (p.allocation_pct || 0) * 100))}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ai-card-dec">
                <div className="ai-dec-empty"><PieChart size={16} /><span>{t('aiStudioEmptyPositions')}</span></div>
              </div>
            )}
          </div>
        </>
      )}
    </AiShell>
  )
}
