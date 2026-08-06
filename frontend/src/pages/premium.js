import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getPremiumPlan, savePremiumPlan, cancelPremiumPlan } from '../services/api'
import { useAuth } from '../lib/auth'
import { ChevronLeft, Compass, Sparkles, TrendingUp, ShieldCheck, Target, AlertTriangle, RefreshCw, Info, Activity, Wallet, Bell, XCircle, CheckCircle2 } from 'lucide-react'
import { detectLang, t, fmtPrice } from '../lib/i18n'

const RISK_LEVELS = [
  { id: 'conservative', key: 'riskConservative' },
  { id: 'balanced', key: 'riskBalanced' },
  { id: 'growth', key: 'riskGrowth' },
]

function fmtFCFA(n) {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('fr-FR') + ' F'
}

function fmtPct(n, digits = 1) {
  if (n == null) return '—'
  return n.toLocaleString('fr-FR', { maximumFractionDigits: digits }) + '%'
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'))
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtInput(v) {
  const s = String(v).replace(/[^\d]/g, '')
  if (!s) return ''
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function parseFCFA(v) {
  const s = String(v).trim()
  if (!s) return NaN
  let t = s.replace(/\s/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  t = t.replace(',', '.')
  return Number(t)
}

export default function Premium() {
  const router = useRouter()
  const { user } = useAuth()
  const [lang, setLang] = useState('fr')
  const [amount, setAmount] = useState('1000000')
  const [monthly, setMonthly] = useState('50000')
  const [horizon, setHorizon] = useState(5)
  const [risk, setRisk] = useState('balanced')
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    if (user) {
      getPremiumPlan()
        .then(r => {
          if (!mounted.current) return
          const p = r.data && r.data.plan
          if (p && p.allocation) {
            setPlan(p)
            setAmount(fmtInput(p.amount || 1000000))
            setMonthly(fmtInput(p.monthly || 0))
            setHorizon(p.horizon_years || 5)
            setRisk(p.risk_level || 'balanced')
          }
        })
        .catch(() => {})
    }
    return () => { mounted.current = false }
  }, [user])

  const generate = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    if (plan && plan.status === 'active' && !window.confirm(t(lang, 'planReplaceConfirm'))) {
      return
    }
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
      })
      if (mounted.current) {
        setPlan(res.data.plan)
        setAmount(fmtInput(res.data.plan.amount))
        setMonthly(fmtInput(res.data.plan.monthly || 0))
        setHorizon(res.data.plan.horizon_years)
        setRisk(res.data.plan.risk_level)
      }
    } catch (e) {
      const detail = e.response && e.response.data && e.response.data.detail
      if (mounted.current) {
        setError(detail === 'no-valuations' ? t(lang, 'premiumNoValuation') : (detail || t(lang, 'premiumError')))
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm(t(lang, 'planCancelConfirm'))) return
    try {
      const res = await cancelPremiumPlan(plan.id)
      if (mounted.current) setPlan(res.data.plan)
    } catch (e) {
      if (mounted.current) setError(t(lang, 'premiumError'))
    }
  }

  const riskLabel = (id) => t(lang, RISK_LEVELS.find(r => r.id === id)?.key || 'riskBalanced')

  const active = plan && plan.status === 'active'
  const issued = plan && (plan.issued_at || plan.cancelled_at || plan.completed_at)

  const progressPct = (() => {
    if (!plan || !plan.issued_at || !plan.matured_at) return 0
    const a = new Date(plan.issued_at.includes('T') ? plan.issued_at : plan.issued_at.replace(' ', 'T'))
    const b = new Date(plan.matured_at.includes('T') ? plan.matured_at : plan.matured_at.replace(' ', 'T'))
    if (isNaN(a) || isNaN(b) || b <= a) return 0
    const pct = ((Date.now() - a.getTime()) / (b.getTime() - a.getTime())) * 100
    return Math.max(0, Math.min(100, pct))
  })()

  const curve = (() => {
    if (!plan || !plan.snapshots || plan.snapshots.length < 2) return null
    const vals = plan.snapshots.map(s => s.value)
    const vmin = Math.min(...vals, plan.start_value || 0)
    const vmax = Math.max(...vals, plan.start_value || 0)
    const range = (vmax - vmin) || 1
    const pt = (i, v) => {
      const x = (i / (vals.length - 1)) * 300
      const y = 86 - ((v - vmin) / range) * 74
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }
    const points = vals.map((v, i) => pt(i, v)).join(' ')
    const startY = pt(0, plan.start_value || vmin).split(',')[1]
    return { points, startY, vmin, vmax, last: vals[vals.length - 1], first: plan.snapshots[0].date, lastDate: plan.snapshots[plan.snapshots.length - 1].date }
  })()

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="pg-header">
          <button className="back-btn" onClick={() => router.push('/menu')}>
            <ChevronLeft size={22} />
          </button>
          <div className="pg-title-wrap">
            <div className="pg-title"><Compass size={18} color="#00C853" /> {t(lang, 'premiumTitle')}</div>
            <div className="pg-sub">{t(lang, 'premiumSub')}</div>
          </div>
        </header>

        <div className="hero-card">
          <Sparkles size={16} color="#00C853" />
          <span>{t(lang, 'premiumHero')}</span>
        </div>

        <div className="card form-card">
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
          <button className="gen-btn" onClick={generate} disabled={loading}>
            {loading ? (
              <><RefreshCw size={16} className="spin" /> {t(lang, 'premiumLoading')}</>
            ) : (
              <>{plan && plan.status === 'active' ? t(lang, 'planReplaceBtn') : (plan ? t(lang, 'planNewEmit') : t(lang, 'premiumGenerate'))} <Sparkles size={16} /></>
            )}
          </button>
          {error && <div className="error-box">{error}</div>}
        </div>

        {!user && !loading && !plan && (
          <div className="login-note" onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}>
            {t(lang, 'premiumLogin')}
          </div>
        )}

        {issued && (
          <div className={`status-card ${plan.status}`}>
            <div className="status-head">
              {plan.status === 'active' && <div className="status-badge active"><Activity size={12} /> {t(lang, 'planStatusActive')}</div>}
              {plan.status === 'completed' && <div className="status-badge completed"><CheckCircle2 size={12} /> {t(lang, 'planStatusCompleted')}</div>}
              {plan.status === 'cancelled' && <div className="status-badge cancelled"><XCircle size={12} /> {t(lang, 'planStatusCancelled')}</div>}
              <span className="status-id">#{plan.id}</span>
            </div>
            <div className="status-dates">
              {plan.issued_at && <div><span className="stat-l">{t(lang, 'planIssued')}</span><b>{fmtDate(plan.issued_at)}</b></div>}
              {plan.matured_at && plan.status !== 'cancelled' && <div><span className="stat-l">{t(lang, 'planMaturity')}</span><b>{fmtDate(plan.matured_at)}</b></div>}
              {(plan.cancelled_at || plan.completed_at) && <div><span className="stat-l">{t(lang, 'planMaturity')}</span><b>{fmtDate(plan.cancelled_at || plan.completed_at)}</b></div>}
              {active && <div><span className="stat-l">{t(lang, 'planLiveValue')}</span><b className="green">{fmtFCFA(plan.last_value)}</b></div>}
              {active && <div><span className="stat-l">{t(lang, 'planLivePnl')}</span><b className={(plan.last_pnl_pct || 0) >= 0 ? 'green' : 'red'}>{fmtPct(plan.last_pnl_pct)}</b></div>}
            </div>
            {active && (
              <div className="progress-row">
                <span className="stat-l">{t(lang, 'planElapsed')}</span>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPct}%` }} /></div>
                <span className="progress-txt">{progressPct.toFixed(0)}%</span>
              </div>
            )}
            {plan.status === 'cancelled' && <div className="status-note">{t(lang, 'planCancelledNote').replace('{d}', fmtDate(plan.cancelled_at))}</div>}
            {plan.status === 'completed' && <div className="status-note">{t(lang, 'planCompletedNote').replace('{d}', fmtDate(plan.completed_at)).replace('{p}', fmtPct(plan.last_pnl_pct))}</div>}
            {active && <div className="emitted-note"><Sparkles size={12} color="#00C853" /> {t(lang, 'planEmittedBanner')}</div>}
            {active && (
              <button className="cancel-btn" onClick={handleCancel}>
                <XCircle size={14} /> {t(lang, 'planCancelBtn')}
              </button>
            )}
          </div>
        )}

        {active && curve && (
          <div className="card">
            <div className="card-title"><Activity size={15} color="#00C853" /> {t(lang, 'planCurve')}</div>
            <svg className="curve" viewBox="0 0 300 90" preserveAspectRatio="none">
              <line x1="0" y1={curve.startY} x2="300" y2={curve.startY} className="curve-base" />
              <polyline points={curve.points} className="curve-line" fill="none" />
              <polyline points={`0,90 ${curve.points} 300,90`} className="curve-fill" />
            </svg>
            <div className="curve-axis">
              <span>{fmtDate(curve.first)}</span>
              <span>{fmtDate(curve.lastDate)} · {fmtFCFA(curve.last)}</span>
            </div>
            <div className="curve-hint">{t(lang, 'planCurveHint')}</div>
          </div>
        )}

        {active && plan.coverage && (
          <div className="card">
            <div className="card-title"><Wallet size={15} color="#4ea8ff" /> {t(lang, 'planCoverage')}</div>
            <div className="coverage-bar"><div className="coverage-fill" style={{ width: `${Math.min(100, plan.coverage.coverage_pct)}%` }} /></div>
            <div className="coverage-val">
              <b className={plan.coverage.coverage_pct >= 60 ? 'green' : 'red'}>{fmtPct(plan.coverage.coverage_pct, 0)}</b>
              <span className="coverage-hint">{t(lang, 'planCoverageHint')}</span>
            </div>
          </div>
        )}

        {active && (
          <div className="card">
            <div className="card-title"><Bell size={15} color="#ffd166" /> {t(lang, 'planAlerts')}</div>
            {plan.alerts && plan.alerts.length > 0 ? (
              plan.alerts.slice(0, 6).map((a, i) => (
                <div key={i} className="alert-row">
                  <div className="alert-title">{a.title}</div>
                  {a.body && <div className="alert-body">{a.body}</div>}
                  <div className="alert-date">{a.created_at}</div>
                </div>
              ))
            ) : (
              <div className="plan-no-alerts">{t(lang, 'planNoAlerts')}</div>
            )}
          </div>
        )}

        {plan && plan.allocation && (
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

            {plan.schedule && plan.schedule.length > 0 && (
              <div className="card">
                <div className="card-title">{t(lang, 'premiumSchedule')}</div>
                <div className="bars">
                  {plan.schedule.map(s => {
                    const max = Math.max(...plan.schedule.map(x => x.value))
                    return (
                      <div key={s.year} className="bar-col">
                        <span className="bar-val">{fmtCompactShort(s.value)}</span>
                        <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(8, (s.value / max) * 100)}%` }} /></div>
                        <span className="bar-year">Y{s.year}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="card-title-inline">
              <Target size={16} color="#00C853" /> {t(lang, 'premiumAllocation')}
              <span className="uni-badge">{plan.allocation.length} {t(lang, 'premiumUniverse')}</span>
            </div>

            {plan.allocation.map(a => (
              <div key={a.symbol} className="card alloc-card">
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
                {active && plan.coverage && plan.coverage.lines && plan.coverage.lines.find(l => l.symbol === a.symbol) && (
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
                  <div className="ai-note"><Sparkles size={12} color="#00C853" /> <span>{a.ai_note}</span></div>
                )}
              </div>
            ))}

            {plan.advice && (
              <div className="card advice">
                <div className="card-title">
                  <TrendingUp size={15} color="#00C853" /> {t(lang, 'premiumAdvice')}
                  {plan.ai_used && <span className="ai-badge">IA</span>}
                </div>
                <p>{plan.advice}</p>
                {plan.highlights && plan.highlights.length > 0 && (
                  <div className="ai-highlights">
                    {plan.highlights.map((h, i) => (
                      <div key={i} className="ai-hl"><Sparkles size={12} color="#00C853" /> {h}</div>
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
                <div className="card-title"><AlertTriangle size={15} color="#ffd166" /> {t(lang, 'premiumSellTriggers')}</div>
                {plan.sell_triggers.map((s, i) => (
                  <div key={i} className="trig-row">
                    <b>{s.trigger}</b>
                    <span>{s.detail}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="reinvest-note"><Sparkles size={14} color="#00C853" /> {t(lang, 'premiumDividendsReinvest')}</div>
            <div className="disclaimer">{t(lang, 'premiumDisclaimer')}</div>
          </>
        )}

        <div className="footer-note">BlueRock © 2026</div>
      </div>

      <BottomNav active="menu" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .pg-header { display: flex; align-items: center; gap: 10px; height: 64px; flex-shrink: 0; }
        .back-btn {
          width: 36px; height: 36px; border-radius: 12px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          background: #141414; color: #fff;
        }
        .pg-title-wrap { display: flex; flex-direction: column; gap: 1px; }
        .pg-title { display: flex; align-items: center; gap: 6px; font-size: 18px; font-weight: 800; }
        .pg-sub { font-size: 11px; color: #a3a3a3; }
        .hero-card {
          display: flex; gap: 8px; align-items: flex-start;
          background: linear-gradient(135deg, rgba(0,200,83,0.15), rgba(139,92,246,0.08));
          border: 1px solid rgba(0,200,83,0.35);
          border-radius: 16px; padding: 12px 14px; margin-bottom: 14px;
          font-size: 12px; line-height: 1.5; color: #d9f7e3;
        }
        .card {
          background: #141414; border-radius: 18px;
          padding: 14px 16px; margin-bottom: 14px;
        }
        .card-title {
          display: flex; align-items: center; gap: 6px;
          font-size: 14px; font-weight: 700; margin-bottom: 10px;
        }
        .card-title-inline {
          display: flex; align-items: center; gap: 8px;
          font-size: 15px; font-weight: 700; margin: 18px 0 10px;
        }
        .uni-badge { margin-left: auto; font-size: 11px; color: #a3a3a3; font-weight: 500; }
        .f-label { display: block; font-size: 12px; color: #a3a3a3; margin: 12px 0 6px; font-weight: 600; }
        .f-opt { color: #666; font-weight: 400; }
        .f-input {
          width: 100%; box-sizing: border-box;
          background: #0d0d0d; border: 1px solid #262626; border-radius: 12px;
          color: #fff; font-size: 15px; font-weight: 600; padding: 12px 14px; outline: none;
        }
        .f-input:focus { border-color: #00C853; }
        .chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip {
          padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 600;
          background: #0d0d0d; color: #a3a3a3; border: 1px solid #262626; cursor: pointer;
        }
        .chip.active { background: rgba(0,200,83,0.14); color: #00C853; border-color: #00C853; }
        .gen-btn {
          width: 100%; margin-top: 16px; padding: 14px; border-radius: 14px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, #00C853, #8b5cf6); color: #000;
          font-size: 15px; font-weight: 800;
        }
        .gen-btn:disabled { opacity: 0.6; cursor: default; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .error-box {
          margin-top: 12px; padding: 10px 12px; border-radius: 12px; font-size: 12px;
          background: rgba(255,77,79,0.1); color: #FF6B6B; border: 1px solid rgba(255,77,79,0.3);
        }
        .login-note {
          text-align: center; padding: 16px; border-radius: 16px;
          border: 1px dashed #00C85355; color: #00C853; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px; }
        .sum-hint { font-size: 10.5px; color: #666; text-align: center; margin: -6px 4px 14px; line-height: 1.5; }
        .stat {
          background: #141414; border-radius: 16px; padding: 12px 14px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .stat.gold { background: linear-gradient(135deg, rgba(0,200,83,0.2), rgba(139,92,246,0.08)); border: 1px solid rgba(0,200,83,0.4); }
        .stat-l { font-size: 11px; color: #a3a3a3; }
        .stat-v { font-size: 15px; font-weight: 800; }
        .stat.gold .stat-v { color: #00C853; font-size: 16px; }
        .stat.up .stat-v { color: #00C853; }
        .bars { display: flex; align-items: flex-end; gap: 8px; height: 130px; padding-top: 16px; }
        .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
        .bar-val { font-size: 10px; color: #a3a3a3; }
        .bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; background: transparent; }
        .bar-fill {
          width: 100%; border-radius: 6px 6px 2px 2px;
          background: linear-gradient(180deg, #00C853, #1d8f48);
        }
        .bar-year { font-size: 10px; color: #666; }
        .alloc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .alloc-logo {
          width: 40px; height: 40px; border-radius: 12px; object-fit: cover; flex-shrink: 0;
          background: #0d0d0d;
        }
        .alloc-logo.placeholder {
          display: flex; align-items: center; justify-content: center;
          color: #00C853; font-weight: 800; font-size: 13px; border: 1px solid #262626;
        }
        .alloc-info { flex: 1; min-width: 0; }
        .alloc-name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .alloc-meta { font-size: 11px; color: #a3a3a3; }
        .action-badge {
          font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 8px; flex-shrink: 0;
        }
        .action-badge.buy { color: #00C853; background: rgba(0,200,83,0.12); }
        .action-badge.add { color: #4ea8ff; background: rgba(78,168,255,0.12); }
        .action-badge.hold { color: #a3a3a3; background: rgba(163,163,163,0.12); }
        .action-badge.sell { color: #FF6B6B; background: rgba(255,77,79,0.12); }
        .action-badge.reduce { color: #ffd166; background: rgba(255,209,102,0.12); }
        .action-badge.watch { color: #4ea8ff; background: rgba(78,168,255,0.12); }
        .kv-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 14px; margin-bottom: 12px; }
        .kv { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
        .kv span { color: #a3a3a3; }
        .kv b { font-weight: 700; text-align: right; }
        .green { color: #00C853 !important; }
        .red { color: #FF6B6B !important; }
        .tranche-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
        .tranche-label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #a3a3a3; width: 100%; margin-bottom: 2px; }
        .tranche-chip {
          font-size: 11px; font-weight: 600; color: #00C853;
          background: rgba(0,200,83,0.1); border: 1px solid rgba(0,200,83,0.25);
          padding: 4px 10px; border-radius: 999px;
        }
        .level-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
        .lvl {
          background: #0d0d0d; border: 1px solid #1f1f1f; border-radius: 12px;
          padding: 8px 10px; display: flex; flex-direction: column; gap: 3px;
        }
        .lvl-l { font-size: 10px; color: #a3a3a3; }
        .lvl b { font-size: 12px; font-weight: 700; }
        .rationale { font-size: 11.5px; line-height: 1.55; color: #c9c9c9; background: #0d0d0d; border-radius: 12px; padding: 10px 12px; }
        .ai-note {
          display: flex; gap: 6px; align-items: flex-start;
          font-size: 11.5px; line-height: 1.55; color: #d9f7e3;
          background: rgba(0,200,83,0.07); border: 1px solid rgba(0,200,83,0.18);
          border-radius: 12px; padding: 10px 12px; margin-top: 8px;
        }
        .ai-badge {
          margin-left: auto; font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
          color: #00C853; background: rgba(0,200,83,0.12);
          border: 1px solid rgba(0,200,83,0.35); border-radius: 8px; padding: 2px 8px;
        }
        .ai-highlights { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .ai-hl {
          display: flex; gap: 6px; align-items: flex-start;
          font-size: 11.5px; line-height: 1.5; color: #c9c9c9;
        }
        .ai-hl svg { flex-shrink: 0; margin-top: 1px; }
        .advice p { font-size: 12.5px; line-height: 1.6; color: #d9d9d9; margin: 0; }
        .pos-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid #1f1f1f; font-size: 12px; }
        .pos-row:last-child { border-bottom: none; }
        .pos-sym { font-weight: 800; font-size: 13px; width: 60px; flex-shrink: 0; }
        .pos-why { color: #a3a3a3; flex: 1; }
        .trig-row { padding: 9px 0; border-bottom: 1px solid #1f1f1f; }
        .trig-row:last-child { border-bottom: none; }
        .trig-row b { display: block; font-size: 12.5px; color: #00C853; margin-bottom: 3px; }
        .trig-row span { font-size: 12px; color: #a3a3a3; line-height: 1.5; }
        .reinvest-note {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; color: #d9f7e3; background: rgba(0,200,83,0.08);
          border: 1px dashed rgba(0,200,83,0.4); border-radius: 14px; padding: 11px 14px; margin-bottom: 12px;
        }
        .disclaimer { font-size: 10.5px; color: #666; line-height: 1.5; margin-bottom: 14px; }
        .status-card {
          background: linear-gradient(135deg, rgba(0,200,83,0.14), rgba(139,92,246,0.06));
          border: 1px solid rgba(0,200,83,0.35); border-radius: 18px;
          padding: 14px 16px; margin-bottom: 14px;
        }
        .status-card.cancelled { background: rgba(255,77,79,0.07); border-color: rgba(255,77,79,0.35); }
        .status-card.completed { background: rgba(255,209,102,0.06); border-color: rgba(255,209,102,0.3); }
        .status-head { display: flex; align-items: center; margin-bottom: 12px; }
        .status-badge {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px;
        }
        .status-badge.active { color: #00C853; background: rgba(0,200,83,0.14); }
        .status-badge.completed { color: #ffd166; background: rgba(255,209,102,0.12); }
        .status-badge.cancelled { color: #FF6B6B; background: rgba(255,77,79,0.12); }
        .status-id { margin-left: auto; font-size: 10px; color: #666; font-weight: 700; }
        .status-dates { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 14px; }
        .status-dates > div { display: flex; flex-direction: column; gap: 2px; }
        .status-dates b { font-size: 12.5px; }
        .status-note { font-size: 12px; color: #c9c9c9; line-height: 1.55; margin-top: 10px; }
        .emitted-note {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: #d9f7e3; margin-top: 10px; line-height: 1.5;
        }
        .progress-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
        .progress-row .stat-l { flex-shrink: 0; }
        .progress-track { flex: 1; height: 8px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #00C853, #8b5cf6); border-radius: 999px; transition: width .4s; }
        .progress-txt { font-size: 11px; font-weight: 800; color: #00C853; width: 38px; text-align: right; }
        .cancel-btn {
          width: 100%; margin-top: 12px; padding: 11px; border-radius: 12px;
          border: 1px solid rgba(255,77,79,0.4); background: rgba(255,77,79,0.08);
          color: #FF6B6B; font-size: 13px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 7px;
        }
        .curve { width: 100%; height: 90px; display: block; }
        .curve-line { stroke: #00C853; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
        .curve-fill { fill: rgba(0,200,83,0.12); }
        .curve-base { stroke: rgba(255,255,255,0.15); stroke-width: 1; stroke-dasharray: 4 4; }
        .curve-axis { display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 6px; }
        .curve-hint { font-size: 10.5px; color: #666; line-height: 1.5; margin-top: 6px; }
        .coverage-bar { height: 10px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
        .coverage-fill { height: 100%; background: linear-gradient(90deg, #4ea8ff, #00C853); border-radius: 999px; }
        .coverage-val { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
        .coverage-hint { color: #a3a3a3; font-size: 10.5px; line-height: 1.4; }
        .alert-row { padding: 10px 0; border-bottom: 1px solid #1f1f1f; }
        .alert-row:last-child { border-bottom: none; }
        .alert-title { font-size: 12.5px; font-weight: 700; color: #ffd166; }
        .alert-body { font-size: 11.5px; color: #c9c9c9; line-height: 1.55; margin-top: 3px; }
        .alert-date { font-size: 10px; color: #666; margin-top: 4px; }
        .plan-no-alerts { font-size: 12px; color: #a3a3a3; text-align: center; padding: 8px 0; }
        .align-row {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          font-size: 11.5px; color: #a3a3a3;
          background: rgba(78,168,255,0.07); border: 1px solid rgba(78,168,255,0.18);
          border-radius: 10px; padding: 7px 10px; margin-bottom: 12px;
        }
        .align-row span { display: flex; align-items: center; gap: 5px; }
        .align-row b { font-weight: 800; }
        .footer-note { text-align: center; font-size: 11px; color: #555; padding: 12px 0; }
      `}</style>
    </div>
  )
}

function fmtCompactShort(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' Md'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + ' K'
  return String(Math.round(n))
}
