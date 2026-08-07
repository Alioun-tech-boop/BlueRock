import { useState } from 'react'
import { RefreshCw, Sparkles, XCircle } from 'lucide-react'
import { savePremiumPlan, cancelPremiumPlan } from '../services/api'
import { t } from '../lib/i18n'
import { fmtInput, parseFCFA, PLAN_TYPE_DEFAULTS } from '../lib/plan'

const RISK_LEVELS = [
  { id: 'conservative', key: 'riskConservative' },
  { id: 'balanced', key: 'riskBalanced' },
  { id: 'growth', key: 'riskGrowth' },
]

export default function PlanForm({ lang, type, plan, onDone, onCancel }) {
  const d = PLAN_TYPE_DEFAULTS[type] || PLAN_TYPE_DEFAULTS.epargne
  const [amount, setAmount] = useState(plan && plan.amount ? String(Math.round(plan.amount)) : '1000000')
  const [monthly, setMonthly] = useState(plan && plan.monthly ? String(Math.round(plan.monthly)) : '50000')
  const [horizon, setHorizon] = useState(plan ? plan.horizon_years : d.horizon)
  const [risk, setRisk] = useState(plan ? plan.risk_level : d.risk)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const active = plan && plan.status === 'active'

  const generate = async () => {
    if (active && !window.confirm(t(lang, 'planReplaceConfirm'))) return
    const amt = parseFCFA(amount)
    if (Number.isNaN(amt) || amt <= 0) {
      setError(t(lang, 'premiumAmountInvalid'))
      return
    }
    const mo = parseFCFA(monthly)
    setLoading(true)
    setError('')
    try {
      const res = await savePremiumPlan({
        amount: amt,
        monthly: Number.isNaN(mo) ? 0 : mo,
        horizon_years: horizon,
        risk_level: risk,
        plan_type: type,
      })
      const p = res.data.plan
      setAmount(p.amount ? String(Math.round(p.amount)) : amount)
      setMonthly(p.monthly ? String(Math.round(p.monthly)) : monthly)
      setHorizon(p.horizon_years)
      setRisk(p.risk_level)
      if (onDone) onDone()
    } catch (e) {
      const detail = e.response && e.response.data && e.response.data.detail
      setError(detail === 'no-valuations' ? t(lang, 'premiumNoValuation') : (detail || t(lang, 'premiumError')))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!plan || !window.confirm(t(lang, 'planCancelConfirm'))) return
    setCancelling(true)
    try {
      await cancelPremiumPlan(plan.id)
      if (onCancel) onCancel()
    } catch (e) {
      setError(t(lang, 'premiumError'))
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="card">
      <label className="f-label">{t(lang, 'premiumAmount')}</label>
      <input
        className="f-input"
        type="text"
        inputMode="numeric"
        value={amount}
        onChange={e => setAmount(fmtInput(e.target.value))}
        placeholder="1 000 000"
      />
      <label className="f-label">{t(lang, 'premiumMonthly')} <span className="f-opt">({t(lang, 'premiumMonthlyOpt')})</span></label>
      <input
        className="f-input"
        type="text"
        inputMode="numeric"
        value={monthly}
        onChange={e => setMonthly(fmtInput(e.target.value))}
        placeholder="50 000"
      />
      <label className="f-label">{t(lang, 'premiumHorizon')}</label>
      <div className="chips">
        {[3, 5, 10, 15, 20].map(y => (
          <button
            key={y}
            className={`chip ${horizon === y ? 'active' : ''}`}
            onClick={() => setHorizon(y)}
          >
            {y} {t(lang, 'years')}
          </button>
        ))}
      </div>
      <label className="f-label">{t(lang, 'premiumRisk')}</label>
      <div className="chips">
        {RISK_LEVELS.map(r => (
          <button
            key={r.id}
            className={`chip ${risk === r.id ? 'active' : ''}`}
            onClick={() => setRisk(r.id)}
          >
            {t(lang, r.key)}
          </button>
        ))}
      </div>
      <button className="gen-btn" onClick={generate} disabled={loading || cancelling}>
        {loading ? (
          <><RefreshCw size={16} className="spin" /> {t(lang, 'premiumLoading')}</>
        ) : (
          <>{active ? t(lang, 'planReplaceBtn') : (plan ? t(lang, 'planNewEmit') : t(lang, 'premiumGenerate'))} <Sparkles size={16} /></>
        )}
      </button>
      {active && (
        <button className="cancel-btn" onClick={handleCancel} disabled={cancelling}>
          <XCircle size={14} /> {t(lang, 'planCancelBtn')}
        </button>
      )}
      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
