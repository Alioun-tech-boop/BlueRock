export default function RatioGauge({ label, value, suffix = '' }) {
  const getColor = (val) => {
    if (val === null || val === undefined) return 'var(--text-muted)'
    if (typeof val === 'number') {
      if (val > 0) return 'var(--accent-green)'
      if (val < 0) return 'var(--accent-red)'
    }
    return 'var(--text-primary)'
  }

  const formatValue = (val) => {
    if (val === null || val === undefined) return '-'
    if (typeof val === 'number') {
      if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(1) + ' Md'
      if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + ' M'
      return val.toFixed(2)
    }
    return val
  }

  return (
    <div className="stat-card" style={{ padding: '0.75rem' }}>
      <div className="label text-xs">{label}</div>
      <div className="font-bold" style={{ color: getColor(value), fontSize: '1.1rem' }}>
        {formatValue(value)}{suffix}
      </div>
    </div>
  )
}
