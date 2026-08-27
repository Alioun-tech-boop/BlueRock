export default function Sparkline({ data, w = 96, h = 28, stroke = '#fff' }) {
  if (!data || data.length < 2) {
    return <svg width={w} height={h} aria-hidden="true" />
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const px = i => (i / (data.length - 1)) * (w - 2) + 1
  const py = v => h - 2 - ((v - min) / range) * (h - 4)
  const line = data.map((v, i) => `${px(i).toFixed(2)},${py(v).toFixed(2)}`).join(' ')
  const area = `${line} ${w.toFixed(2)},${h} 1,${h}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <polygon points={area} fill={`${stroke}22`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}