import React from 'react'

function buildPath(values, w, h, pad) {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const step = (w - pad * 2) / Math.max(1, values.length - 1)
  return values.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function Sparkline({ values = [], color = '#6E8BFF', w = 84, h = 30 }) {
  if (!values.length) return null
  const d = buildPath(values, w, h, 2)
  const id = 'sl' + Math.random().toString(36).slice(2, 7)
  const area = `${d} L${(w - 2).toFixed(1)},${(h - 2).toFixed(1)} L2,${(h - 2).toFixed(1)} Z`
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AreaChart({ series = [], days = 30, height = 240 }) {
  const w = 760
  const h = height
  const pad = 34
  const palette = { users: '#6E8BFF', posts: '#1FD996', kyc: '#FFB23E', groups: '#38D6E8' }
  const labels = series.map(s => s.date)
  const maxAll = Math.max(1, ...series.flatMap(s => Object.values(s).filter(v => typeof v === 'number' && v !== s.date)))
  const xFor = (i) => pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2)
  const yFor = (v) => h - pad - (v / maxAll) * (h - pad * 2)
  return (
    <div className="adm-chart">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={pad} x2={w - pad} y1={h - pad - t * (h - pad * 2)} y2={h - pad - t * (h - pad * 2)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {series.length > 1 && (
          <text x={pad} y={18} fill="rgba(160,175,200,0.6)" fontSize="11" fontWeight="700">
            pic {Math.round(maxAll).toLocaleString('fr-FR')}
          </text>
        )}
        {Object.keys(palette).map(key => {
          const vals = series.map(s => s[key] || 0)
          if (vals.every(v => v === 0)) return null
          const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')
          const area = `${d} L${xFor(vals.length - 1).toFixed(1)},${h - pad} L${xFor(0).toFixed(1)},${h - pad} Z`
          const gid = 'g' + key
          return (
            <g key={key}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette[key]} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={palette[key]} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gid})`} />
              <path d={d} fill="none" stroke={palette[key]} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
        {labels.length > 0 && (
          <text x={pad} y={h - 10} fill="rgba(160,175,200,0.55)" fontSize="10" fontWeight="700">{labels[0]}</text>
        )}
        {labels.length > 0 && (
          <text x={w - pad} y={h - 10} textAnchor="end" fill="rgba(160,175,200,0.55)" fontSize="10" fontWeight="700">{labels[labels.length - 1]}</text>
        )}
      </svg>
      <div className="adm-legend">
        {Object.entries(palette).map(([k, c]) => (
          <div className="it" key={k}><span className="sw" style={{ background: c }} />{k === 'users' ? 'Utilisateurs' : k === 'posts' ? 'Publications' : k === 'kyc' ? 'KYC vérifiés' : 'Groupes'}</div>
        ))}
      </div>
    </div>
  )
}
