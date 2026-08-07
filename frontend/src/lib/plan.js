import { PiggyBank, Umbrella, GraduationCap, Landmark } from 'lucide-react'

export const PLAN_TYPES = [
  { id: 'epargne', icon: 'PiggyBank', key: 'patTypeEpargne', desc: 'patTypeEpargneDesc' },
  { id: 'retraite', icon: 'Umbrella', key: 'patTypeRetraite', desc: 'patTypeRetraiteDesc' },
  { id: 'etudes', icon: 'GraduationCap', key: 'patTypeEtudes', desc: 'patTypeEtudesDesc' },
  { id: 'succession', icon: 'Landmark', key: 'patTypeSuccession', desc: 'patTypeSuccessionDesc' },
]

export const PLAN_ICONS = { PiggyBank, Umbrella, GraduationCap, Landmark }

export const PLAN_TYPE_DEFAULTS = {
  epargne: { horizon: 5, risk: 'balanced' },
  retraite: { horizon: 15, risk: 'conservative' },
  etudes: { horizon: 10, risk: 'growth' },
  succession: { horizon: 20, risk: 'conservative' },
}

export function planTypeMeta(id) {
  return PLAN_TYPES.find(x => x.id === id) || PLAN_TYPES[0]
}

export function fmtFCFA(n) {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('fr-FR') + ' F'
}

export function fmtPct(n, digits = 1) {
  if (n == null) return '—'
  return n.toLocaleString('fr-FR', { maximumFractionDigits: digits }) + '%'
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'))
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtCompactShort(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' Md'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + ' K'
  return String(Math.round(n))
}

export function fmtInput(v) {
  const s = String(v).replace(/[^\d]/g, '')
  if (!s) return ''
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export function parseFCFA(v) {
  const s = String(v).trim()
  if (!s) return NaN
  let t = s.replace(/\s/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  t = t.replace(',', '.')
  return Number(t)
}

export function progressPctOf(plan) {
  if (!plan || !plan.issued_at || !plan.matured_at) return 0
  const a = new Date(plan.issued_at.includes('T') ? plan.issued_at : plan.issued_at.replace(' ', 'T'))
  const b = new Date(plan.matured_at.includes('T') ? plan.matured_at : plan.matured_at.replace(' ', 'T'))
  if (isNaN(a) || isNaN(b) || b <= a) return 0
  const pct = ((Date.now() - a.getTime()) / (b.getTime() - a.getTime())) * 100
  return Math.max(0, Math.min(100, pct))
}

export function curveOf(plan) {
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
}
