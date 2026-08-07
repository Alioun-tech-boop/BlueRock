import PatrimoineShell from '../../components/PatrimoineShell'
import PatrimoineSectionStyles from '../../components/PatrimoineSectionStyles'
import PatrimoineEmpty from '../../components/PatrimoineEmpty'
import { fmtFCFA, fmtPct } from '../../lib/plan'
import { t } from '../../lib/i18n'
import { fmtPrice } from '../../lib/i18n'
import { Target, Wallet, Info, Sparkles, TrendingUp, ShieldCheck, AlertTriangle } from 'lucide-react'

export default function Allocation() {
  return (
    <PatrimoineShell section="allocation">
      {({ plan, type, lang }) => (
        <>
          <PatrimoineSectionStyles />
          {!plan ? (
            <PatrimoineEmpty type={type} lang={lang} />
          ) : !plan.allocation || !plan.allocation.length ? (
            <div className="empty-box">
              <div className="empty-ring"><Target size={28} /></div>
              <div className="empty-title">{t(lang, 'patNoAlloc')}</div>
            </div>
          ) : (
            <>
              <div className="summary-grid">
                <div className="stat gold"><span className="stat-l">{t(lang, 'premiumProjected')}</span><span className="stat-v">{fmtFCFA(plan.projected_final)}</span></div>
                <div className="stat"><span className="stat-l">{t(lang, 'premiumInvested')}</span><span className="stat-v">{fmtFCFA(plan.invested)}</span></div>
                <div className="stat"><span className="stat-l">{t(lang, 'premiumCashBuffer')}</span><span className="stat-v">{fmtFCFA(plan.cash_buffer)}</span></div>
                <div className="stat"><span className="stat-l">{t(lang, 'premiumExpectedReturn')}</span><span className="stat-v">{fmtPct(plan.expected_return * 100, 1)}</span></div>
                <div className="stat"><span className="stat-l">{t(lang, 'premiumContributions')}</span><span className="stat-v">{fmtFCFA(plan.total_contributions)}</span></div>
                <div className="stat up"><span className="stat-l">{t(lang, 'premiumGain')}</span><span className="stat-v">+{fmtFCFA(plan.gain)}</span></div>
              </div>
              <div className="sum-hint">{t(lang, 'premiumCashHint')}</div>

              <div className="card-title-inline">
                <Target size={16} color="#2ACB8A" /> {t(lang, 'premiumAllocation')}
                <span className="uni-badge">{plan.allocation.length} {t(lang, 'premiumUniverse')}</span>
              </div>

              {plan.allocation.map(a => (
                <div key={a.symbol} className="card">
                  <div className="alloc-head">
                    {a.logo_url ? (
                      <img className="alloc-logo" src={a.logo_url} alt={a.symbol} />
                    ) : (
                      <div className="alloc-logo placeholder">{a.symbol.slice(0, 2)}</div>
                    )}
                    <div className="alloc-info">
                      <div className="alloc-name">{a.symbol} · {a.name}</div>
                      <div className="alloc-meta">{a.sector}</div>
                    </div>
                    <span className={`action-badge ${a.action.toLowerCase()}`}>{a.action}</span>
                  </div>
                  <div className="kv-grid">
                    <div className="kv"><span>{t(lang, 'premiumWeight')}</span><b>{fmtPct(a.weight_percent)}</b></div>
                    <div className="kv"><span>{t(lang, 'premiumAllocated')}</span><b>{fmtFCFA(a.allocated_amount)}</b></div>
                    <div className="kv"><span>{t(lang, 'price')}</span><b>{fmtPrice(lang, a.current_price, 0)}</b></div>
                    <div className="kv"><span>{t(lang, 'premiumFairValue')}</span><b>{fmtPrice(lang, a.fair_value, 0)}</b></div>
                    <div className="kv"><span>{t(lang, 'premiumDiscountLbl')}</span><b className="green">{fmtPct(a.discount_percent)}</b></div>
                    <div className="kv"><span>{t(lang, 'divYield')}</span><b>{fmtPct(a.dividend_yield, 2)}</b></div>
                    <div className="kv"><span>{t(lang, 'premiumQuality')}</span><b>{a.rating ? `${a.rating} · ${fmtPrice(lang, a.score, 1)}/10` : `${fmtPrice(lang, a.score, 1)}/10`}</b></div>
                    <div className="kv"><span>{t(lang, 'premiumExpectedReturn')}</span><b className="green">{fmtPct(a.expected_return * 100)}</b></div>
                    <div className="kv"><span>{t(lang, 'premiumShares')}</span><b>{a.shares}</b></div>
                    <div className="kv"><span>{t(lang, 'premiumProjectedValue')}</span><b>{fmtFCFA(a.projected_value)}</b></div>
                  </div>
                  {plan.status === 'active' && plan.coverage && plan.coverage.lines && plan.coverage.lines.find(l => l.symbol === a.symbol) && (
                    (() => {
                      const line = plan.coverage.lines.find(l => l.symbol === a.symbol)
                      return (
                        <div className="align-row">
                          <span><Wallet size={12} /> {t(lang, 'planCoverage')} · {line.held_qty || 0}/{line.target_shares || 0} {t(lang, 'premiumShares')}</span>
                          <b className={line.aligned_pct >= 60 ? 'green' : 'red'}>{fmtPct(line.aligned_pct, 0)}</b>
                        </div>
                      )
                    })()
                  )}
                  <div className="tranche-row">
                    <span className="tranche-label"><Info size={13} /> {t(lang, 'premiumTranches')}</span>
                    {a.tranches ? a.tranches.map((tr, i) => (
                      <span key={i} className="tranche-chip">{tr.pct}% · {t(lang, i === 0 ? 'premiumNow' : i === 1 ? 'premium3m' : 'premium6m')}</span>
                    )) : (
                      <span className="tranche-chip">{t(lang, 'premiumNow')}</span>
                    )}
                  </div>
                  <div className="level-grid">
                    <div className="lvl"><span className="lvl-l">{t(lang, 'premiumEntryLimit')}</span><b>{fmtPrice(lang, a.entry_limit, 0)}</b></div>
                    <div className="lvl"><span className="lvl-l">{t(lang, 'premiumTakeProfit')}</span><b className="green">{fmtPrice(lang, a.take_profit, 0)}</b></div>
                    <div className="lvl"><span className="lvl-l">{t(lang, 'premiumStopLoss')}</span><b className="red">{fmtPrice(lang, a.stop_loss, 0)}</b></div>
                  </div>
                  <div className="rationale">{a.rationale}</div>
                  {a.ai_note && (
                    <div className="ai-note"><Sparkles size={12} color="#2ACB8A" /> <span>{a.ai_note}</span></div>
                  )}
                </div>
              ))}

              {plan.advice && (
                <div className="card advice">
                  <div className="card-title">
                    <TrendingUp size={15} color="#2ACB8A" /> {t(lang, 'premiumAdvice')}
                    {plan.ai_used && <span className="ai-badge">IA</span>}
                  </div>
                  <p>{plan.advice}</p>
                  {plan.highlights && plan.highlights.length > 0 && (
                    <div className="ai-highlights">
                      {plan.highlights.map((h, i) => (
                        <div key={i} className="ai-hl"><Sparkles size={12} color="#2ACB8A" /> {h}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {plan.positions && plan.positions.length > 0 && (
                <div className="card">
                  <div className="card-title"><ShieldCheck size={15} color="#4ea8ff" /> {t(lang, 'premiumPositions')}</div>
                  {plan.positions.map((p, i) => (
                    <div key={i} className="pos-row">
                      <span className="pos-sym">{p.symbol}</span>
                      <span className={`action-badge ${p.action.toLowerCase()}`}>{p.action}</span>
                      <span className="pos-why">{p.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {plan.sell_triggers && plan.sell_triggers.length > 0 && (
                <div className="card">
                  <div className="card-title"><AlertTriangle size={15} color="#F04438" /> {t(lang, 'premiumSellTriggers')}</div>
                  {plan.sell_triggers.map((s, i) => (
                    <div key={i} className="trig-row">
                      <b>{s.trigger}</b>
                      <span>{s.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="reinvest-note"><Sparkles size={14} color="#2ACB8A" /> {t(lang, 'premiumDividendsReinvest')}</div>
              <div className="disclaimer">{t(lang, 'premiumDisclaimer')}</div>
            </>
          )}
          <div className="footer-note">BlueRock © 2026</div>
        </>
      )}
    </PatrimoineShell>
  )
}
