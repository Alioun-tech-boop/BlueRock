export function aggregateOhlc(series, kind) {
  const valid = series.filter(d => d && d.date && d.close != null && !Number.isNaN(+d.close))
  if (!valid.length) return []
  if (kind === '1j' || kind === 'max') return valid

  const keyOf = (date) => {
    const [y, m] = String(date).slice(0, 7).split('-')
    const month = parseInt(m, 10)
    if (kind === '5j') {
      const d = new Date(String(date).slice(0, 10) + 'T00:00:00Z')
      const start = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86400000)
      return Math.floor(start / 5)
    }
    if (kind === '1m') return `${y}-${m}`
    if (kind === '3m') return `${y}-Q${Math.floor((month - 1) / 3) + 1}`
    if (kind === '6m') return `${y}-S${month <= 6 ? 1 : 2}`
    if (kind === '1a') return y
    if (kind === '3a') return `${Math.floor(parseInt(y, 10) / 3) * 3}`
    if (kind === '5a') return `${Math.floor(parseInt(y, 10) / 5) * 5}`
    return `${y}-${m}`
  }

  const groups = new Map()
  for (const d of valid) {
    const k = keyOf(d.date)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(d)
  }

  return [...groups.entries()]
    .sort((a, b) => {
      // Tri numérique si possible (pour 5j qui est un entier), sinon lexical
      const na = Number(a[0]), nb = Number(b[0])
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return a[0] < b[0] ? -1 : 1
    })
    .map(([, pts]) => {
      const first = pts[0]
      const last = pts[pts.length - 1]
      let high = -Infinity, low = Infinity
      for (const p of pts) {
        const h = p.high ?? Math.max(p.open ?? p.close, p.close)
        const l = p.low ?? Math.min(p.open ?? p.close, p.close)
        if (h > high) high = h
        if (l < low) low = l
      }
      return {
        date: first.date,
        open: first.open ?? first.close,
        high,
        low,
        close: last.close,
        volume: pts.reduce((s, p) => s + (p.volume || 0), 0),
      }
    })
}
