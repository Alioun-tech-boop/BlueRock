import { Brain, Send, CheckCircle2, BarChart3, GitBranch, Camera, ClipboardCheck, Activity, ChevronDown } from 'lucide-react'
import { t } from '../lib/i18n'

export const NA = 'N/A'

export function fmtDate(iso) {
  if (!iso) return NA
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch (e) { return NA }
}

export function fmtTime(iso) {
  if (!iso) return NA
  try {
    const d = new Date(iso)
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  } catch (e) { return NA }
}

export function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return NA
  return `${(Number(v) >= 0 ? '+' : '')}${(Number(v) * 100).toFixed(2)}%`
}

export function fmtNum(v) {
  if (v == null || Number.isNaN(Number(v))) return NA
  return Number(v).toFixed(2)
}

export function fmtMoney(v, env) {
  if (v == null || Number.isNaN(Number(v))) return NA
  return `${env === 'SIMULATION' ? '~' : ''}${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`
}

export function signAccent(v) {
  if (v == null || Number.isNaN(Number(v)) || v === 0) return ''
  return v > 0 ? 'pos' : 'neg'
}

export const FACTOR_LABELS = {
  fundamental: 'Fond.',
  quality: 'Qualité',
  momentum: 'Momentum',
  valuation: 'Valor.',
  risk: 'Risque',
}

export const ACTIVITY_ICONS = {
  decision: <Brain size={15} />,
  order: <Send size={15} />,
  execution: <CheckCircle2 size={15} />,
  backtest: <BarChart3 size={15} />,
  version: <GitBranch size={15} />,
  snapshot: <Camera size={15} />,
  audit: <ClipboardCheck size={15} />,
}

export const DIM_LABELS = {
  max_position_pct: 'Position max',
  max_sector_pct: 'Secteur max',
  max_volatility: 'Volatilité',
  max_var_95: 'VaR 95',
  max_cvar_95: 'CVaR 95',
  max_drawdown: 'Drawdown',
  max_beta: 'Bêta',
  max_concentration_hhi: 'Concentration',
  max_correlation: 'Corrélation',
}

export function downloadBlob(res, fallbackName) {
  try {
    const h = res && res.headers ? res.headers : {}
    const raw = typeof h.get === 'function' ? h.get('content-disposition') : h['content-disposition'] || h['Content-Disposition']
    const disp = typeof raw === 'string' ? raw : String(raw || '')
    const m = disp.match(/filename=([^;]+)/)
    const name = m ? m[1].replace(/"/g, '') : fallbackName
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 400)
  } catch (e) { /* noop */ }
}

export function Stat({ label, value, sub, accent }) {
  return (
    <div className="ai-tile">
      <div className="ai-tile-label">{label}</div>
      <div className={`ai-tile-value ${accent || ''}`}>{value != null && value !== '' ? value : NA}</div>
      {sub && <div className="ai-tile-sub">{sub}</div>}
    </div>
  )
}

export function SectionHead({ id, icon, title, sub }) {
  return (
    <div id={id} className="ai-section-head">
      {icon}
      <span>{title}</span>
      {sub && <span className="ai-section-sub">{sub}</span>}
    </div>
  )
}

export function HealthBar({ label, value }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  const tone = value == null ? 'none' : pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'bad'
  return (
    <div className="ai-health-row">
      <span className="ai-health-label">{label}</span>
      <div className="ai-health-track">
        <div className={`ai-health-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="ai-health-val">{value == null ? NA : `${Math.round(value)}/100`}</span>
    </div>
  )
}

export function DecisionCard({ d, open, onToggle }) {
  const type = (d.decision_type || '').toLowerCase()
  const st = (d.status || '').toLowerCase()
  const typeLabel = { buy: t('aiStudioBuy'), sell: t('aiStudioSell'), hold: t('aiStudioHold') }[type] || d.decision_type
  const stLabel = { executed: t('aiStudioExecuted'), pending: t('aiStudioPending'), rejected: t('aiStudioRejected') }[st] || d.status
  const conf = d.confidence != null ? d.confidence * 100 : null
  const composite = d.factors && d.factors.length
    ? d.factors.reduce((s, f) => s + (f.score != null ? f.score * (f.weight || 0) : 0), 0) / d.factors.reduce((s, f) => s + (f.weight || 0), 0)
    : null
  const hasContrib = d.factors && d.factors.some((f) => f.contribution != null)
  return (
    <div className={`ai-dec ${type} ${open ? 'open' : ''}`}>
      <div className="ai-dec-top">
        <span className={`ai-dec-type ${type}`}>{typeLabel}</span>
        <span className={`ai-dec-status ${st}`}>{stLabel}</span>
      </div>
      <div className="ai-dec-symbol">{d.symbol || '?'}</div>
      {d.company_name && <div className="ai-dec-name">{d.company_name}</div>}
      <div className="ai-dec-price">
        {d.price_at_decision != null ? `@ ${Number(d.price_at_decision).toLocaleString('fr-FR')} XOF` : ''}
        {d.created_at ? ` · ${fmtTime(d.created_at)}` : ''}
      </div>
      <div className="ai-dec-meta">
        {conf != null && <span>{t('aiStudioConfidence')} <b>{Math.round(conf)}%</b></span>}
        {composite != null && <span>{t('aiStudioScore')} <b>{Math.round(composite)}/100</b></span>}
        {d.regime && <span>{t('aiStudioRegime')} <b>{d.regime}</b></span>}
        {d.risk_level && <span>{t('aiStudioRisk')} <b>{d.risk_level}</b></span>}
        {d.horizon && <span>{t('aiStudioHorizon')} <b>{d.horizon}</b></span>}
        {d.allocation_target != null && <span>{t('aiStudioTarget')} <b>{(d.allocation_target * 100).toFixed(1)}%</b></span>}
      </div>
      {conf != null && (
        <div className="ai-conf-track">
          <div className="ai-conf-fill" style={{ width: `${Math.max(0, Math.min(100, conf))}%` }} />
        </div>
      )}
      {d.factors && d.factors.length > 0 && (
        <div className="ai-dec-factors">
          <span className="ai-dec-factors-title">{t('aiStudioFactors')}</span>
          <div className="ai-factors-row">
            {d.factors.map((f) => (
              <span key={f.factor} className={`ai-factor ${(f.direction || 'positive') === 'negative' ? 'neg' : 'pos'}`}>
                {FACTOR_LABELS[f.factor] || f.factor} {(f.score != null ? Math.round(f.score) : '—')}
                <i>{(f.direction || 'positive') === 'negative' ? '−' : '+'}</i>
                {hasContrib && f.share_pct != null && <i className="ai-factor-share">{Math.round(f.share_pct)}%</i>}
              </span>
            ))}
          </div>
        </div>
      )}
      {d.summary && <div className="ai-dec-summary">{d.summary}</div>}
      {onToggle && (
        <button className="ai-dec-expand" onClick={onToggle}>
          {t(open ? 'aiStudioDecHide' : 'aiStudioDecExplain')}
          <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    </div>
  )
}

export function ActivityIcon({ kind }) {
  return <span className={`ai-act-icon ${kind || ''}`}>{ACTIVITY_ICONS[kind] || <Activity size={15} />}</span>
}
