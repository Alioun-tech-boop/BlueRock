import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getPremiumPlan, savePremiumPlan } from '../services/api'
import { useAuth } from '../lib/auth'
import { ChevronLeft, Crown, Sparkles, TrendingUp, ShieldCheck, Target, AlertTriangle, RefreshCw, Info } from 'lucide-react'
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
        setError(detail === 'no-valuations' ? t(lang, 'premiumNoValuation') : t(lang, 'premiumError'))
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  const riskLabel = (id) => t(lang, RISK_LEVELS.find(r => r.id === id)?.key || 'riskBalanced')

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="pg-header">
          <button className="back-btn" onClick={() => router.push('/menu')}>
            <ChevronLeft size={22} />
          </button>
          <div className="pg-title-wrap">
            <div className="pg-title"><Crown size={18} color="#D4A843" /> {t(lang, 'premiumTitle')}</div>
            <div className="pg-sub">{t(lang, 'premiumSub')}</div>
          </div>
        </header>

        <div className="hero-card">
          <Sparkles size={16} color="#D4A843" />
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
              <>{plan ? t(lang, 'premiumRegenerate') : t(lang, 'premiumGenerate')} <Sparkles size={16} /></>
            )}
          </button>
          {error && <div className="error-box">{error}</div>}
        </div>

        {!user && !loading && !plan && (
          <div className="login-note" onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}>
            {t(lang, 'premiumLogin')}
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
              <Target size={16} color="#D4A843" /> {t(lang, 'premiumAllocation')}
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
              </div>
            ))}

            {plan.advice && (
              <div className="card advice">
                <div className="card-title"><TrendingUp size={15} color="#00C853" /> {t(lang, 'premiumAdvice')}</div>
                <p>{plan.advice}</p>
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

            <div className="reinvest-note"><Sparkles size={14} color="#D4A843" /> {t(lang, 'premiumDividendsReinvest')}</div>
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
          background: linear-gradient(135deg, rgba(212,168,67,0.16), rgba(212,168,67,0.04));
          border: 1px solid rgba(212,168,67,0.35);
          border-radius: 16px; padding: 12px 14px; margin-bottom: 14px;
          font-size: 12px; line-height: 1.5; color: #e8d9b0;
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
        .f-input:focus { border-color: #D4A843; }
        .chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip {
          padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 600;
          background: #0d0d0d; color: #a3a3a3; border: 1px solid #262626; cursor: pointer;
        }
        .chip.active { background: rgba(212,168,67,0.15); color: #D4A843; border-color: #D4A843; }
        .gen-btn {
          width: 100%; margin-top: 16px; padding: 14px; border-radius: 14px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, #D4A843, #b98a2e); color: #000;
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
          border: 1px dashed #262626; color: #D4A843; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px; }
        .sum-hint { font-size: 10.5px; color: #666; text-align: center; margin: -6px 4px 14px; line-height: 1.5; }
        .stat {
          background: #141414; border-radius: 16px; padding: 12px 14px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .stat.gold { background: linear-gradient(135deg, rgba(212,168,67,0.22), rgba(212,168,67,0.06)); border: 1px solid rgba(212,168,67,0.4); }
        .stat-l { font-size: 11px; color: #a3a3a3; }
        .stat-v { font-size: 15px; font-weight: 800; }
        .stat.gold .stat-v { color: #D4A843; font-size: 16px; }
        .stat.up .stat-v { color: #00C853; }
        .bars { display: flex; align-items: flex-end; gap: 8px; height: 130px; padding-top: 16px; }
        .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
        .bar-val { font-size: 10px; color: #a3a3a3; }
        .bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; background: transparent; }
        .bar-fill {
          width: 100%; border-radius: 6px 6px 2px 2px;
          background: linear-gradient(180deg, #D4A843, #8a6a1f);
        }
        .bar-year { font-size: 10px; color: #666; }
        .alloc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .alloc-logo {
          width: 40px; height: 40px; border-radius: 12px; object-fit: cover; flex-shrink: 0;
          background: #0d0d0d;
        }
        .alloc-logo.placeholder {
          display: flex; align-items: center; justify-content: center;
          color: #D4A843; font-weight: 800; font-size: 13px; border: 1px solid #262626;
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
          font-size: 11px; font-weight: 600; color: #D4A843;
          background: rgba(212,168,67,0.1); border: 1px solid rgba(212,168,67,0.25);
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
        .advice p { font-size: 12.5px; line-height: 1.6; color: #d9d9d9; margin: 0; }
        .pos-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid #1f1f1f; font-size: 12px; }
        .pos-row:last-child { border-bottom: none; }
        .pos-sym { font-weight: 800; font-size: 13px; width: 60px; flex-shrink: 0; }
        .pos-why { color: #a3a3a3; flex: 1; }
        .trig-row { padding: 9px 0; border-bottom: 1px solid #1f1f1f; }
        .trig-row:last-child { border-bottom: none; }
        .trig-row b { display: block; font-size: 12.5px; color: #ffd166; margin-bottom: 3px; }
        .trig-row span { font-size: 12px; color: #a3a3a3; line-height: 1.5; }
        .reinvest-note {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; color: #e8d9b0; background: rgba(212,168,67,0.08);
          border: 1px dashed rgba(212,168,67,0.4); border-radius: 14px; padding: 11px 14px; margin-bottom: 12px;
        }
        .disclaimer { font-size: 10.5px; color: #666; line-height: 1.5; margin-bottom: 14px; }
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
