import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  ColorType, CrosshairMode, LineStyle, createSeriesMarkers,
} from 'lightweight-charts'
import { fmtPrice, fmtPriceCur, fmtCompact } from '../lib/i18n'
import {
  MousePointer2, TrendingUp, Minus, GitBranch, Square, Type, Eraser,
  Plus, RotateCcw, Scan, Hand, Maximize, Minimize, SlidersHorizontal,
} from 'lucide-react'

const C = {
  bg: '#000000',
  upBody: '#35D07F',
  upBorder: '#35D07F',
  downBody: '#F6465D',
  downBorder: '#F6465D',
  text: '#9AA5B8',
  axis: '#7B8798',
  ema: { 20: '#3B82F6', 50: '#FACC15', 200: '#A855F7' },
  tipBg: '#0F0F0F',
  tipBorder: '#2A3A5C',
  boll: '#8B5CF6',
  vwap: '#14B8A6',
  rsi: '#A78BFA',
  macdLine: '#2196F3',
  macdSignal: '#FF9800',
  draw: '#4EA8FF',
  drawDraft: 'rgba(78,168,255,0.6)',
  fibo: ['#EF4444', '#F97316', '#FACC15', '#84CC16', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6'],
}

const EMAS = [20, 50, 200]

const BAR_SPAN = {
  '1h': 0, '1d': 0, '1w': 0, '1m': 0, '3m': 0, '1y': 0,
  '1j': 0, '5j': 0, '6m': 0, '1a': 0, '3a': 0, '5a': 0, 'max': 0, 'all': 0,
}

const FIBO_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

const DRAW_TOOLS = [
  { id: 'cursor', icon: MousePointer2, title: 'Cursor' },
  { id: 'trend', icon: TrendingUp, title: 'Trendline' },
  { id: 'hline', icon: Minus, title: 'Support / Resistance' },
  { id: 'fibo', icon: GitBranch, title: 'Fibonacci' },
  { id: 'rect', icon: Square, title: 'Rectangle' },
  { id: 'text', icon: Type, title: 'Label' },
  { id: 'erase', icon: Eraser, title: 'Erase' },
]

const TT = (lang, k) => ({
  candle: lang === 'en' ? 'Candlesticks' : 'Bougies',
  line: lang === 'en' ? 'Line' : 'Ligne',
  zoomIn: lang === 'en' ? 'Zoom in' : 'Zoom avant',
  zoomOut: lang === 'en' ? 'Zoom out' : 'Zoom arrière',
  reset: lang === 'en' ? 'Reset view' : 'Réinitialiser',
  full: lang === 'en' ? 'Fullscreen' : 'Plein écran',
  exitFull: lang === 'en' ? 'Exit fullscreen' : 'Quitter le plein écran',
  tools: lang === 'en' ? 'Tools' : 'Outils',
  eraseHint: lang === 'en' ? 'Click a drawing to delete' : 'Cliquez sur un tracé pour le supprimer',
  drawHint: lang === 'en' ? 'Drag on chart to draw' : 'Faites glisser sur le graphique pour dessiner',
}[k])

const CandleSvg = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M3.2 2.5v3.1M3.2 10.4v3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <rect x="1.8" y="5.6" width="2.8" height="4.8" rx="0.7" fill="currentColor" />
    <path d="M8 2v2.1M8 11.9V14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <rect x="6.6" y="4.1" width="2.8" height="7.8" rx="0.7" fill="currentColor" />
    <path d="M12.8 3.5v1.1M12.8 11.4v1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <rect x="11.4" y="4.6" width="2.8" height="6.8" rx="0.7" fill="currentColor" />
  </svg>
)

const LineSvg = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M2 12.5 6 8l2.4 2.2L14 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="14" cy="4" r="1.4" fill="currentColor" />
  </svg>
)

function ema(values, period) {
  const out = new Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let sum = 0
  let seed = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) continue
    sum += v
    if (i >= period) sum -= values[i - period] || 0
    if (seed == null) {
      if (i < period - 1) continue
      seed = sum / period
    } else {
      seed = v * k + seed * (1 - k)
    }
    out[i] = seed
  }
  return out
}

function sma(values, n) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= n) sum -= values[i - n]
    if (i >= n - 1) out[i] = sum / n
  }
  return out
}

function computeBollinger(values, n, mult) {
  const mid = sma(values, n)
  const up = new Array(values.length).fill(null)
  const lo = new Array(values.length).fill(null)
  for (let i = n - 1; i < values.length; i++) {
    const m = mid[i]
    let acc = 0
    for (let j = i - n + 1; j <= i; j++) acc += (values[j] - m) * (values[j] - m)
    const sd = Math.sqrt(acc / n)
    up[i] = m + mult * sd
    lo[i] = m - mult * sd
  }
  return { mid, up, lo }
}

function computeVWAP(rows) {
  const out = new Array(rows.length).fill(null)
  let cv = 0, cs = 0
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i]
    const vol = d.volume || 0
    const tp = (d.high ?? d.close) + (d.low ?? d.close) + d.close
    cv += (tp / 3) * vol
    cs += vol
    out[i] = cs > 0 ? cv / cs : null
  }
  return out
}

function computeRSI(values, n) {
  const out = new Array(values.length).fill(null)
  if (values.length <= n) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d; else loss -= d
  }
  let avgG = gain / n, avgL = loss / n
  out[n] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL)
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    avgG = (avgG * (n - 1) + Math.max(d, 0)) / n
    avgL = (avgL * (n - 1) + Math.max(-d, 0)) / n
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL)
  }
  return out
}

function computeMACD(values) {
  const e = (n) => {
    const out = new Array(values.length).fill(null)
    const k = 2 / (n + 1)
    let prev = null, seedSum = 0
    for (let i = 0; i < values.length; i++) {
      if (i < n) { seedSum += values[i]; continue }
      if (i === n) { prev = seedSum / n; out[i] = prev; continue }
      prev = values[i] * k + prev * (1 - k)
      out[i] = prev
    }
    return out
  }
  const e12 = e(12), e26 = e(26)
  const line = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    if (e12[i] != null && e26[i] != null) line[i] = e12[i] - e26[i]
  }
  const signal = new Array(values.length).fill(null)
  const k = 2 / 10
  let prev = null, cnt = 0, seed = 0
  for (let i = 0; i < values.length; i++) {
    if (line[i] == null) continue
    cnt++
    if (cnt <= 9) { seed += line[i]; if (cnt === 9) prev = seed / 9 }
    else prev = line[i] * k + prev * (1 - k)
    if (cnt >= 9) signal[i] = prev
  }
  const hist = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    if (line[i] != null && signal[i] != null) hist[i] = line[i] - signal[i]
  }
  return { line, signal, hist }
}

function fmtShort(n) {
  if (n == null || Number.isNaN(n)) return '—'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return n.toFixed(0)
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const IND_ROWS = [
  { key: 'ema20', k: 20, label: 'EMA20', color: C.ema[20] },
  { key: 'ema50', k: 50, label: 'EMA50', color: C.ema[50] },
  { key: 'ema200', k: 200, label: 'EMA200', color: C.ema[200] },
  { key: 'boll', k: 'boll', label: 'BOLL', color: C.boll },
  { key: 'vwap', k: 'vwap', label: 'VWAP', color: C.vwap },
  { key: 'rsi', k: 'rsi', label: 'RSI', color: C.rsi },
  { key: 'macd', k: 'macd', label: 'MACD', color: C.macdLine },
]

export default forwardRef(function MarketChart({ data = [], period = '1a', lang = 'fr', statusText = '', markers = [], symbol = '', currency = 'XOF', toolsOpen = false, onToolsOpenChange, liveVolume = null }, ref) {
  const rootRef = useRef(null)
  const chartElRef = useRef(null)
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const lineRef = useRef(null)
  const tagRef = useRef(null)
  const tipRef = useRef(null)
  const stateRef = useRef(null)
  const redrawRef = useRef(() => {})
  const drawingsRef = useRef([])
  const draftRef = useRef(null)
  const dragRef = useRef(null)
  const legRefs = useRef({})
  const indRefs = useRef({})
  const [emasOn, setEmasOn] = useState({ 20: true, 50: true, 200: true })
  const [inds, setInds] = useState({ boll: false, vwap: false, rsi: false, macd: false })
  const hoveringRef = useRef(false)
  const [tool, setTool] = useState('cursor')
  const [full, setFull] = useState(false)
  const [chartType, setChartType] = useState('candle') // candle | line
  const typeRef = useRef('candle')
  const [localTools, setLocalTools] = useState(false)
  const [drawings, setDrawingsState] = useState([])
  const [textDraft, setTextDraft] = useState('')

  const toolsVisible = onToolsOpenChange ? !!toolsOpen : localTools

  const setDrawings = (next) => {
    drawingsRef.current = next
    setDrawingsState(next)
    try {
      localStorage.setItem(`bluerock_drawings_v1_${symbol || 'global'}`, JSON.stringify(next))
    } catch {}
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`bluerock_drawings_v1_${symbol || 'global'}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        drawingsRef.current = Array.isArray(parsed) ? parsed : []
        setDrawingsState(drawingsRef.current)
      }
    } catch {}
  }, [symbol])

  const rows = useMemo(() => {
    const seen = {}
    const out = []
    for (const d of data) {
      const time = String(d.date).slice(0, 10)
      if (seen[time]) continue
      seen[time] = true
      const open = d.open ?? d.open_price ?? d.close_price ?? d.close
      const close = d.close ?? d.close_price
      out.push({
        time,
        open,
        high: d.high ?? d.high_price ?? Math.max(open, close),
        low: d.low ?? d.low_price ?? Math.min(open, close),
        close,
        volume: d.volume || 0,
      })
    }
    return out
  }, [data])

  useEffect(() => {
    const root = rootRef.current
    const chartEl = chartElRef.current
    if (!root || !chartEl) return

    const chart = createChart(chartEl, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.10)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(148,163,184,0.10)', style: LineStyle.Solid },
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: 'rgba(148,163,184,0.14)',
        scaleMargins: { top: 0.08, bottom: 0.22 },
        textColor: C.axis,
      },
      timeScale: {
        borderVisible: true,
        borderColor: 'rgba(148,163,184,0.14)',
        barSpacing: 13,
        minBarSpacing: 2.5,
        maxBarSpacing: 40,
        rightOffset: 1,
        textColor: C.axis,
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: (time, type) => {
          const s = String(time)
          if (!s) return ''
          const y = s.slice(0, 4)
          const mi = parseInt(s.slice(5, 7), 10) - 1
          const d = s.slice(8, 10)
          const M = lang === 'en'
            ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            : ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc']
          if (type === 0) return y // changement d'année → année seule
          if (type === 1) return M[mi] || '' // changement de mois → mois court
          if (type === 2) return d // jour → numéro du jour
          return `${d}/${M[mi] || ''}`
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(148,163,184,0.30)', width: 1, style: LineStyle.Solid, labelBackgroundColor: '#262626', labelTextColor: '#E8EEF7' },
        horzLine: { color: 'rgba(148,163,184,0.30)', width: 1, style: LineStyle.Solid, labelBackgroundColor: '#262626', labelTextColor: '#E8EEF7' },
      },
      localization: {
        priceFormatter: v => fmtPrice(lang, v, 0),
        volumeFormatter: v => fmtCompact(lang, v),
        timeFormatter: t => {
          const s = String(t)
          const [y, m, d] = s.slice(0, 10).split('-')
          return lang === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`
        },
      },
      handleScroll: { vertTouchDrag: false, mouseWheel: false },
      trackingMode: { exitMode: 3 },
    })

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: C.upBody,
      downColor: C.downBody,
      borderUpColor: C.upBorder,
      borderDownColor: C.downBorder,
      wickUpColor: C.upBody,
      wickDownColor: C.downBody,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })

    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: true,
      ticksVisible: false,
      borderVisible: false,
      entireTextOnly: true,
    })

    const line = chart.addSeries(LineSeries, {
      color: '#2ACB8A',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#000000',
      crosshairMarkerBackgroundColor: '#2ACB8A',
      visible: false,
    })

    const emas = {}
    for (const p of EMAS) {
      emas[p] = chart.addSeries(LineSeries, {
        color: C.ema[p],
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: '',
        visible: emasOn[p],
      })
    }

    const st = { chart, candle, vol, line, emas, markersPlugin: createSeriesMarkers(candle) }
    stateRef.current = st

    const main = () => (typeRef.current === 'line' ? st.line : st.candle)

    const barAt = (i) => {
      const b = main().dataByIndex(i)
      if (!b) return null
      if (typeRef.current === 'line') {
        const vbar = st.vol.dataByIndex(i)
        return {
          time: b.time, open: b.value, high: b.value, low: b.value, close: b.value,
          volume: vbar && vbar.value != null ? vbar.value : 0,
        }
      }
      return b
    }
    st.barAt = barAt
    st.main = main

    const fit = () => {
      const len = rows.length
      if (!len) return
      const span = BAR_SPAN[period] || 0
      if (span && len > span) {
        st.chart.timeScale().setVisibleLogicalRange({ from: len - span, to: len - 1 })
      } else {
        st.chart.timeScale().fitContent()
      }
    }

    candle.setData(rows)
    vol.setData(rows.map(r => ({
      time: r.time,
      value: r.volume,
      color: r.close >= r.open ? 'rgba(53,208,127,0.45)' : 'rgba(246,70,93,0.45)',
    })))
    for (const p of EMAS) {
      const closes = rows.map(r => r.close)
      st.emas[p].setData(rows.map((r, i) => ({ time: r.time, value: ema(closes, p)[i] })).filter(pt => pt.value != null))
    }

    const updatePriceLine = () => {
      const lineEl = lineRef.current
      const tag = tagRef.current
      if (!lineEl || !tag) return
      const all = main().data()
      const last = all.length ? all[all.length - 1] : null
      if (!last || hoveringRef.current) {
        lineEl.style.opacity = '0'
        tag.style.opacity = '0'
        return
      }
      const lc = typeRef.current === 'line' ? last.value : last.close
      const lo = typeRef.current === 'line' ? last.value : last.open
      const y = main().priceToCoordinate(lc)
      if (y == null) {
        lineEl.style.opacity = '0'
        tag.style.opacity = '0'
        return
      }
      const color = lc >= lo ? C.upBody : C.downBody
      lineEl.style.opacity = '1'
      lineEl.style.top = `${y}px`
      lineEl.style.borderTopColor = color + '88'
      tag.style.opacity = '1'
      tag.style.top = `${y}px`
      tag.style.background = '#FFFFFF'
      tag.style.color = '#0D1426'
      tag.textContent = fmtPriceCur(lang, lc, currency, 0)
    }

    const LEG_KEYS = ['ema20', 'ema50', 'ema200', 'boll', 'vwap', 'rsi', 'macd']

    const setLeg = (i) => {
      const leg = legRefs.current
      const all = main().data()
      const len = all.length
      const last = len ? len - 1 : null
      const idx = i != null && i >= 0 && i < len ? i : last
      if (idx == null) {
        if (leg.price) leg.price.textContent = '—'
        if (leg.ohlc) leg.ohlc.textContent = ''
        if (leg.date) leg.date.textContent = ''
        if (leg.chg) { leg.chg.textContent = ''; leg.chg.style.background = 'transparent' }
        for (const k of LEG_KEYS) {
          const el = indRefs.current[k]
          if (el) el.textContent = '—'
        }
        return
      }
      const bar = barAt(idx)
      const prev = idx > 0 ? st.candle.dataByIndex(idx - 1) : null
      if (!bar) return
      const up = bar.close >= bar.open
      const col = up ? C.upBody : C.downBody
      if (leg.price) {
        leg.price.textContent = fmtPriceCur(lang, bar.close, currency, 0)
        leg.price.style.color = col
      }
      if (leg.chg) {
        const pct = prev && prev.close ? ((bar.close - prev.close) / prev.close) * 100 : null
        if (pct == null) {
          leg.chg.textContent = ''
          leg.chg.style.background = 'transparent'
        } else {
          const pos = pct >= 0
          leg.chg.textContent = `${pos ? '+' : ''}${pct.toFixed(2)}%`
          leg.chg.style.background = pos ? 'rgba(53,208,127,0.16)' : 'rgba(246,70,93,0.16)'
          leg.chg.style.color = pos ? C.upBody : C.downBody
        }
      }
      if (leg.ohlc) {
        const vbar = st.vol.dataByIndex(idx)
        const vol = vbar && vbar.value != null ? vbar.value : 0
        leg.ohlc.textContent =
          `O ${fmtPrice(lang, bar.open, 0)}  H ${fmtPrice(lang, bar.high, 0)}  ` +
          `L ${fmtPrice(lang, bar.low, 0)}  C ${fmtPrice(lang, bar.close, 0)}  ` +
          `Vol ${fmtCompact(lang, vol)}`
      }
      if (leg.date) {
        const [y, m, dd] = String(bar.time).slice(0, 10).split('-')
        leg.date.textContent = lang === 'en' ? `${m}/${dd}/${y}` : `${dd}/${m}/${y}`
      }
      const A = st.leg || {}
      for (const k of LEG_KEYS) {
        const el = indRefs.current[k]
        if (!el) continue
        const arr = A[k]
        const v = arr && arr[idx] != null ? arr[idx] : null
        el.textContent = v == null ? '—' : fmtPrice(lang, v, k === 'rsi' || k === 'macd' ? 2 : 0)
      }
    }

    st.setLeg = setLeg
    st.updatePriceLine = updatePriceLine

    const onCrosshair = param => {
      const tip = tipRef.current
      const seriesData = param.seriesData
      const active = typeRef.current === 'line' ? st.line : st.candle
      const raw = seriesData ? seriesData.get(active) : null
      const idx = param.logical != null && Number.isFinite(param.logical) ? Math.round(param.logical) : null
      if (!raw || !param.point || idx == null) {
        if (tip) tip.style.opacity = '0'
        st.setLeg(null)
        hoveringRef.current = false
        updatePriceLine()
        return
      }
      hoveringRef.current = true
      if (lineRef.current) lineRef.current.style.opacity = '0'
      if (tagRef.current) tagRef.current.style.opacity = '0'
      let d = raw
      if (typeRef.current === 'line') {
        const vbar = st.vol.dataByIndex(idx)
        d = {
          time: raw.time, open: raw.value, high: raw.value, low: raw.value, close: raw.value,
          volume: vbar && vbar.value != null ? vbar.value : 0,
        }
      }
      st.setLeg(idx)
      if (!tip) return
      const wrap = tip.parentElement.getBoundingClientRect()
      const px = param.point.x
      const py = param.point.y
      const w = 150
      const h = 116
      let tx = px + 14
      let ty = py - h - 14
      if (tx + w > wrap.width - 4) tx = px - w - 14
      if (tx < 4) tx = 4
      if (ty < 4) ty = py + 14
      if (ty + h > wrap.height - 4) ty = wrap.height - h - 4
      const prev = idx > 0 ? st.candle.dataByIndex(idx - 1) : null
      const prevClose = prev ? prev.close : null
      const chg = prevClose ? ((d.close - prevClose) / prevClose) * 100 : null
      const up = d.close >= d.open
      const dateStr = (() => {
        const [y, m, dd] = d.time.split('-')
        return lang === 'en' ? `${m}/${dd}/${y}` : `${dd}/${m}/${y}`
      })()
      tip.innerHTML = `
        <div class="mc-tip-title" style="color:${up ? C.upBody : C.downBody}">${fmtPriceCur(lang, d.close, currency, 0)}</div>
        <div class="mc-tip-date">${dateStr}</div>
        <div class="mc-tip-row"><span>O</span><b>${fmtPrice(lang, d.open, 0)}</b></div>
        <div class="mc-tip-row"><span>H</span><b style="color:${C.upBody}">${fmtPrice(lang, d.high, 0)}</b></div>
        <div class="mc-tip-row"><span>L</span><b style="color:${C.downBody}">${fmtPrice(lang, d.low, 0)}</b></div>
        <div class="mc-tip-row"><span>C</span><b>${fmtPrice(lang, d.close, 0)}</b></div>
        <div class="mc-tip-row"><span>V</span><b>${fmtCompact(lang, d.volume)}</b></div>
        <div class="mc-tip-row"><span>%</span><b style="color:${chg != null && chg >= 0 ? C.upBody : C.downBody}">${chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '—'}</b></div>
      `
      tip.style.opacity = '1'
      tip.style.left = `${tx}px`
      tip.style.top = `${ty}px`
    }

    st.chart.subscribeCrosshairMove(onCrosshair)
    const onRangeChange = () => redrawRef.current()
    st.chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange)
    st.chart.timeScale().subscribeVisibleTimeRangeChange(onRangeChange)

    const ro = new ResizeObserver(() => {
      const el = chartEl.parentElement
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w && h) {
        st.chart.resize(w, h)
        updatePriceLine()
        redrawRef.current()
      }
    })
    ro.observe(chartEl)

    fit()
    updatePriceLine()
    requestAnimationFrame(updatePriceLine)

    return () => {
      ro.disconnect()
      st.chart.unsubscribeCrosshairMove(onCrosshair)
      st.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange)
      st.chart.timeScale().unsubscribeVisibleTimeRangeChange(onRangeChange)
      st.markersPlugin.detach()
      st.chart.remove()
      stateRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    st.candle.setData(rows)
    st.line.setData(rows.map(r => ({ time: r.time, value: r.close })))
    st.vol.setData(rows.map(r => ({
      time: r.time,
      value: r.volume,
      color: r.close >= r.open ? 'rgba(53,208,127,0.45)' : 'rgba(246,70,93,0.45)',
    })))
    for (const p of EMAS) {
      const closes = rows.map(r => r.close)
      st.emas[p].setData(rows.map((r, i) => ({ time: r.time, value: ema(closes, p)[i] })).filter(pt => pt.value != null))
    }
    if (st.updatePriceLine) st.updatePriceLine()
  }, [rows])

  useEffect(() => {
    const st = stateRef.current
    if (!st || !liveVolume || !liveVolume.volume) return
    const last = rows[rows.length - 1]
    if (!last) return
    const t = liveVolume.date
    const flatColor = 'rgba(148,163,184,0.55)'
    if (t === last.time) {
      const color = last.close >= last.open
        ? 'rgba(53,208,127,0.45)' : 'rgba(246,70,93,0.45)'
      st.vol.update({ time: t, value: liveVolume.volume, color })
      return
    }
    if (t > last.time && liveVolume.estimated) {
      st.candle.update({ time: t, open: last.close, high: last.close, low: last.close, close: last.close })
      st.line.update({ time: t, value: last.close })
      st.vol.update({ time: t, value: liveVolume.volume, color: flatColor })
    }
  }, [liveVolume, rows])

  useEffect(() => {
    typeRef.current = chartType
    const st = stateRef.current
    if (!st) return
    st.candle.applyOptions({ visible: chartType === 'candle' })
    st.line.applyOptions({ visible: chartType === 'line' })
    if (st.main) st.main()
    if (st.updatePriceLine) st.updatePriceLine()
    redrawRef.current()
  }, [chartType])

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const closes = rows.map(r => r.close)
    const boll = computeBollinger(closes, 20, 2)
    const vwapArr = computeVWAP(rows)
    const rsiArr = computeRSI(closes, 14)
    const macdArr = computeMACD(closes)

    st.leg = {
      ema20: ema(closes, 20),
      ema50: ema(closes, 50),
      ema200: ema(closes, 200),
      boll: inds.boll ? boll.mid : null,
      vwap: inds.vwap ? vwapArr : null,
      rsi: inds.rsi ? rsiArr : null,
      macd: inds.macd ? macdArr.line : null,
    }
    if (st.setLeg) st.setLeg(null)

    for (const k of ['bollU', 'bollL', 'vwap', 'rsi', 'macdH', 'macdL', 'macdS']) {
      if (st[k]) { st.chart.removeSeries(st[k]); st[k] = null }
    }

    if (inds.boll) {
      const opts = {
        color: C.boll, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, priceScaleId: '',
      }
      st.bollU = st.chart.addSeries(LineSeries, opts)
      st.bollL = st.chart.addSeries(LineSeries, opts)
      st.bollU.setData(rows.map((r, i) => ({ time: r.time, value: boll.up[i] })).filter(pt => pt.value != null))
      st.bollL.setData(rows.map((r, i) => ({ time: r.time, value: boll.lo[i] })).filter(pt => pt.value != null))
    }
    if (inds.vwap) {
      st.vwap = st.chart.addSeries(LineSeries, {
        color: C.vwap, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, priceScaleId: '', lineStyle: LineStyle.Dashed,
      })
      st.vwap.setData(rows.map((r, i) => ({ time: r.time, value: vwapArr[i] })).filter(pt => pt.value != null))
    }

    let paneIdx = 1
    if (inds.rsi) {
      st.rsi = st.chart.addSeries(LineSeries, {
        color: C.rsi, lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false,
      }, paneIdx)
      st.chart.priceScale('right', paneIdx).applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } })
      st.rsi.setData(rows.map((r, i) => ({ time: r.time, value: rsiArr[i] })).filter(pt => pt.value != null))
      paneIdx++
    }
    if (inds.macd) {
      st.macdH = st.chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      }, paneIdx)
      st.macdL = st.chart.addSeries(LineSeries, {
        color: C.macdLine, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false,
      }, paneIdx)
      st.macdS = st.chart.addSeries(LineSeries, {
        color: C.macdSignal, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false,
      }, paneIdx)
      st.chart.priceScale('right', paneIdx).applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } })
      st.macdH.setData(rows.map((r, i) => ({
        time: r.time, value: macdArr.hist[i],
        color: macdArr.hist[i] >= 0 ? 'rgba(53,208,127,0.5)' : 'rgba(246,70,93,0.5)',
      })).filter(pt => pt.value != null))
      st.macdL.setData(rows.map((r, i) => ({ time: r.time, value: macdArr.line[i] })).filter(pt => pt.value != null))
      st.macdS.setData(rows.map((r, i) => ({ time: r.time, value: macdArr.signal[i] })).filter(pt => pt.value != null))
    }
  }, [inds, rows])

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const len = rows.length
    if (!len) return
    const span = BAR_SPAN[period] || 0
    if (span && len > span) {
      st.chart.timeScale().setVisibleLogicalRange({ from: len - span, to: len - 1 })
    } else {
      st.chart.timeScale().fitContent()
    }
  }, [period, rows])

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    for (const p of EMAS) {
      st.emas[p].applyOptions({ visible: emasOn[p] })
    }
  }, [emasOn])

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    st.markersPlugin.setMarkers(chartType === 'candle' ? (markers || []) : [])
  }, [markers, chartType])

  useEffect(() => { redraw() }, [drawings, tool, inds])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheel = (e) => {
      const st = stateRef.current
      if (!st) return
      e.preventDefault()
      const dir = -e.deltaY
      const range = st.chart.timeScale().getVisibleLogicalRange()
      if (!range) return
      const factor = 2 ** (dir / 480)
      const { from, to } = range
      const center = (from + to) / 2
      st.chart.timeScale().setVisibleLogicalRange({
        from: center + (from - center) * factor,
        to: center + (to - center) * factor,
      })
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [])

  const toggleEma = p => setEmasOn(prev => ({ ...prev, [p]: !prev[p] }))
  const toggleInd = k => setInds(prev => ({ ...prev, [k]: !prev[k] }))

  const zoomBy = (factor) => {
    const st = stateRef.current
    if (!st) return
    const range = st.chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const { from, to } = range
    const center = (from + to) / 2
    st.chart.timeScale().setVisibleLogicalRange({
      from: center + (from - center) * factor,
      to: center + (to - center) * factor,
    })
  }

  const zoomReset = () => {
    const st = stateRef.current
    if (!st) return
    const len = rows.length
    if (!len) return
    const span = BAR_SPAN[period] || 0
    if (span && len > span) {
      st.chart.timeScale().setVisibleLogicalRange({ from: len - span, to: len - 1 })
    } else {
      st.chart.timeScale().fitContent()
    }
  }

  const toggleFull = () => {
    const root = rootRef.current
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => setFull(false))
    } else if (root && root.requestFullscreen) {
      root.requestFullscreen()
        .then(() => setFull(true))
        .catch(() => setFull(v => !v))
    } else {
      setFull(v => !v)
    }
  }

  useImperativeHandle(ref, () => ({ toggleFull }))

  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    if (!full) return
    const onKey = (e) => {
      if (e.key === 'Escape') setFull(false)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  const getPoint = (e) => {
    const wrap = wrapRef.current
    if (!wrap) return { x: 0, y: 0 }
    const rect = wrap.getBoundingClientRect()
    const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }
  }

  const pointToData = (p) => {
    const st = stateRef.current
    if (!st) return { time: null, price: null }
    const time = st.chart.timeScale().coordinateToTime(p.x)
    const price = st.main().coordinateToPrice(p.y)
    return { time, price: price == null ? null : Math.round(price * 100) / 100 }
  }

  const pickDrawing = (p) => {
    const st = stateRef.current
    if (!st) return -1
    let bestI = -1
    let bestD = 12
    const main = st.main()
    drawingsRef.current.forEach((d, i) => {
      const x1 = d.t1 != null ? st.chart.timeScale().timeToCoordinate(d.t1) : null
      const y1 = d.p1 != null ? main.priceToCoordinate(d.p1) : null
      const x2 = d.t2 != null ? st.chart.timeScale().timeToCoordinate(d.t2) : null
      const y2 = d.p2 != null ? main.priceToCoordinate(d.p2) : null
      let dd = 999
      if (d.tool === 'hline') {
        if (y1 != null) dd = Math.abs(p.y - y1)
      } else if (d.tool === 'rect' && x1 != null && y1 != null && x2 != null && y2 != null) {
        const xl = Math.min(x1, x2), xr = Math.max(x1, x2)
        const yt = Math.min(y1, y2), yb = Math.max(y1, y2)
        if (p.x >= xl && p.x <= xr && p.y >= yt && p.y <= yb) dd = 0
        else dd = Math.min(
          Math.hypot(p.x - xl, p.y - yt), Math.hypot(p.x - xr, p.y - yt),
          Math.hypot(p.x - xl, p.y - yb), Math.hypot(p.x - xr, p.y - yb),
        )
      } else if (d.tool === 'text' && x1 != null && y1 != null) {
        dd = Math.hypot(p.x - x1, p.y - y1)
      } else if (d.tool === 'fibo' && x1 != null && x2 != null && y1 != null && y2 != null) {
        dd = distToSegment(p.x, p.y, x1, y1, x2, y2)
        for (const lv of FIBO_LEVELS) {
          const yl = y1 + (y2 - y1) * lv
          dd = Math.min(dd, Math.abs(p.y - yl))
        }
      } else if (x1 != null && y1 != null && x2 != null && y2 != null) {
        dd = distToSegment(p.x, p.y, x1, y1, x2, y2)
      }
      if (dd < bestD) { bestD = dd; bestI = i }
    })
    return bestI
  }

  const onSvgPointerDown = (e) => {
    const st = stateRef.current
    if (!st) return
    const p = getPoint(e)
    const main = st.main()
    if (tool === 'erase') {
      const i = pickDrawing(p)
      if (i >= 0) setDrawings(drawingsRef.current.filter((_, k) => k !== i))
      return
    }
    if (tool === 'cursor') {
      const i = pickDrawing(p)
      if (i >= 0) {
        const d = drawingsRef.current[i]
        const x1 = d.t1 != null ? st.chart.timeScale().timeToCoordinate(d.t1) : null
        const y1 = d.p1 != null ? main.priceToCoordinate(d.p1) : null
        const x2 = d.t2 != null ? st.chart.timeScale().timeToCoordinate(d.t2) : null
        const y2 = d.p2 != null ? main.priceToCoordinate(d.p2) : null
        const grips = []
        if (d.tool === 'hline' && y1 != null && d.t1 != null) grips.push({ key: 'p1', x: st.chart.timeScale().timeToCoordinate(d.t1), y: y1, dx: 0, dy: 0 })
        else if (d.tool === 'text' && x1 != null && y1 != null) grips.push({ key: 'p1', x: x1, y: y1, dx: 0, dy: 0 })
        else {
          if (x1 != null && y1 != null) grips.push({ key: 'p1', x: x1, y: y1, dx: 0, dy: 0 })
          if (x2 != null && y2 != null) grips.push({ key: 'p2', x: x2, y: y2, dx: 0, dy: 0 })
        }
        for (const g of grips) {
          if (Math.hypot(p.x - g.x, p.y - g.y) <= 14) {
            e.stopPropagation()
            const move = (ev) => {
              const pt = getPoint(ev)
              const nd = pointToData(pt)
              if (!nd.time && nd.price == null) return
              const next = drawingsRef.current.slice()
              const cur = { ...next[i] }
              if (g.key === 'p1') {
                if (cur.tool === 'hline') cur.p1 = pt.y == null ? cur.p1 : (main.coordinateToPrice(pt.y) ?? cur.p1)
                else { if (nd.time) cur.t1 = nd.time; if (nd.price != null) cur.p1 = nd.price }
              } else {
                if (nd.time) cur.t2 = nd.time
                if (nd.price != null) cur.p2 = nd.price
              }
              next[i] = cur
              drawingsRef.current = next
              setDrawingsState(next)
            }
            const up = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
              try {
                localStorage.setItem(`bluerock_drawings_v1_${symbol || 'global'}`, JSON.stringify(drawingsRef.current))
              } catch {}
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
            return
          }
        }
      }
      return
    }
    if (tool === 'scan') {
      e.stopPropagation()
      const start = { ...p }
      draftRef.current = { tool: 'scan', x1: p.x, y1: p.y, x2: p.x, y2: p.y }
      redraw()
      const move = (ev) => {
        const pt = getPoint(ev)
        draftRef.current = { ...draftRef.current, x2: pt.x, y2: pt.y }
        redraw()
      }
      const up = () => {
        const d = draftRef.current
        draftRef.current = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setTool('cursor')
        if (!d || Math.abs(d.x2 - d.x1) < 8 || Math.abs(d.y2 - d.y1) < 8) return
        const t1 = st.chart.timeScale().coordinateToTime(Math.min(d.x1, d.x2))
        const t2 = st.chart.timeScale().coordinateToTime(Math.max(d.x1, d.x2))
        if (t1 && t2 && t1 !== t2) {
          st.chart.timeScale().setVisibleRange({ from: t1, to: t2 })
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return
    }
    e.stopPropagation()
    const data = pointToData(p)
    if (data.price == null) return
    const d = { tool, t1: data.time, p1: data.price, t2: data.time, p2: data.price, text: '' }
    draftRef.current = d
    redraw()
    const move = (ev) => {
      const pt = getPoint(ev)
      const nd = pointToData(pt)
      const cur = draftRef.current
      if (!cur || !nd.time) return
      cur.t2 = nd.time
      if (nd.price != null) cur.p2 = nd.price
      redraw()
    }
    const up = (ev) => {
      const cur = draftRef.current
      draftRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      redraw()
      if (!cur) return
      if (cur.tool === 'text') {
        const txt = window.prompt('Label')
        if (!txt) return
        cur.text = txt.slice(0, 80)
      } else if (cur.t1 === cur.t2 || cur.p1 === cur.p2) {
        if (cur.tool === 'hline') {
          cur.t2 = null
          cur.p2 = null
        } else {
          return
        }
      }
      if (cur.tool === 'hline') {
        cur.t2 = null
        cur.p2 = null
        cur.t1 = st.chart.timeScale().coordinateToTime(st.chart.timeScale().getVisibleLogicalRange().from)
        cur.p1 = Math.round(cur.p1 * 100) / 100
      } else {
        cur.p1 = Math.round(cur.p1 * 100) / 100
        cur.p2 = Math.round(cur.p2 * 100) / 100
      }
      setDrawings([...drawingsRef.current, cur])
      setTool('cursor')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const redraw = () => {
    const st = stateRef.current
    const svg = svgRef.current
    if (!st || !svg) return
    const parts = []
    const gripR = 4
    const ns = 'http://www.w3.org/2000/svg'

    const tx = (t) => (t != null ? st.chart.timeScale().timeToCoordinate(t) : null)

    const toXY = (d) => {
      const main = st.main()
      return {
        x1: tx(d.t1),
        y1: d.p1 != null ? main.priceToCoordinate(d.p1) : null,
        x2: d.t2 != null ? tx(d.t2) : null,
        y2: d.p2 != null ? main.priceToCoordinate(d.p2) : null,
      }
    }

    const paint = (d, dashed) => {
      const { x1, y1, x2, y2 } = toXY(d)
      const color = dashed ? C.drawDraft : C.draw
      if (d.tool === 'hline') {
        if (y1 == null) return
        parts.push(
          <line key={d.id} x1="0" y1={y1} x2="100%" y2={y1} stroke={color} strokeWidth="1.2" strokeDasharray={dashed ? '6 4' : undefined} />
        )
        parts.push(
          <text key={`${d.id}l`} x={4} y={y1 - 5} fill="#9DB4D8" fontSize="10" fontWeight="600">{fmtShort(d.p1)}</text>
        )
      } else if (d.tool === 'fibo') {
        if (x1 == null || x2 == null || y1 == null || y2 == null) return
        parts.push(
          <line key={d.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" strokeDasharray={dashed ? '6 4' : '2 3'} />
        )
        FIBO_LEVELS.forEach((lv, i) => {
          const yl = y1 + (y2 - y1) * lv
          const xl = x1 + (x2 - x1) * lv
          parts.push(
            <line key={`${d.id}f${i}`} x1={x1} y1={yl} x2={x2} y2={yl} stroke={C.fibo[i % C.fibo.length]} strokeWidth="1" strokeDasharray={dashed ? '6 4' : '4 4'} opacity="0.85" />
          )
          parts.push(
            <text key={`${d.id}t${i}`} x={xl + 4} y={yl - 3} fill={C.fibo[i % C.fibo.length]} fontSize="9.5" fontWeight="600">
              {Math.round(lv * 1000) / 10}% · {fmtShort(d.p1 + (d.p2 - d.p1) * lv)}
            </text>
          )
        })
      } else if (d.tool === 'rect') {
        if (x1 == null || x2 == null || y1 == null || y2 == null) return
        const xl = Math.min(x1, x2), yt = Math.min(y1, y2)
        parts.push(
          <rect key={d.id} x={xl} y={yt} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
            fill={dashed ? 'rgba(78,168,255,0.08)' : 'rgba(78,168,255,0.1)'} stroke={color} strokeWidth="1.2" strokeDasharray={dashed ? '6 4' : undefined} />
        )
      } else if (d.tool === 'text') {
        if (x1 == null || y1 == null) return
        parts.push(
          <g key={d.id}>
            <rect x={x1 - 3} y={y1 - 14} width={Math.max(d.text ? d.text.length * 6.4 + 8 : 28, 28)} height="18" rx="4" fill="#111111" stroke={color} strokeWidth="1" />
            <text x={x1} y={y1 + 1} fill="#E2E8F0" fontSize="11" fontWeight="600">{d.text || '...'}</text>
          </g>
        )
      } else {
        if (x1 == null || y1 == null || x2 == null || y2 == null) return
        parts.push(
          <line key={d.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.4" strokeDasharray={dashed ? '6 4' : undefined} />
        )
      }
    }

    drawingsRef.current.forEach(d => paint(d, false))
    if (draftRef.current) paint({ ...draftRef.current, id: 'draft' }, true)

    const grips = []
    if (tool === 'cursor') {
      drawingsRef.current.forEach((d, i) => {
        const { x1, y1, x2, y2 } = toXY(d)
        if (d.tool === 'hline') {
          if (y1 != null) grips.push(<circle key={`g${i}`} data-idx={i} cx={x1} cy={y1} r={gripR + 1.5} fill="none" stroke={C.draw} strokeWidth="1.5" pointerEvents="auto" />)
        } else if (d.tool === 'text') {
          if (x1 != null && y1 != null) grips.push(<circle key={`g${i}`} data-idx={i} cx={x1} cy={y1} r={gripR + 1.5} fill="none" stroke={C.draw} strokeWidth="1.5" pointerEvents="auto" />)
        } else {
          if (x1 != null && y1 != null) grips.push(<circle key={`g${i}a`} data-idx={i} cx={x1} cy={y1} r={gripR + 1.5} fill="none" stroke={C.draw} strokeWidth="1.5" pointerEvents="auto" />)
          if (x2 != null && y2 != null) grips.push(<circle key={`g${i}b`} data-idx={i} cx={x2} cy={y2} r={gripR + 1.5} fill="none" stroke={C.draw} strokeWidth="1.5" pointerEvents="auto" />)
        }
      })
    }

    svg.innerHTML = ''
    const append = (node, parent) => {
      if (node == null) return
      if (Array.isArray(node)) { node.forEach(n => append(n, parent)); return }
      if (typeof node === 'string' || typeof node === 'number') {
        if (parent) parent.textContent = String(node)
        return
      }
      const el = document.createElementNS(ns, node.type)
      for (const [k, v] of Object.entries(node.props || {})) {
        if (k === 'children' || k === 'pointerEvents') continue
        el.setAttribute(k, String(v))
      }
      if (node.props && node.props.pointerEvents) el.style.pointerEvents = node.props.pointerEvents
      const kids = node.props && node.props.children
      if (Array.isArray(kids)) kids.forEach(k => append(k, el))
      else if (kids != null && typeof kids !== 'boolean') append(kids, el)
      ;(parent || svg).appendChild(el)
    }

    const timeLabels = []
    const svgRect = { width: svg.clientWidth, height: svg.clientHeight }
    const visRange = st.chart.timeScale().getVisibleLogicalRange()
    const barSpacing = st.chart.timeScale().options().barSpacing
    const daily = period === '1j' || period === '5j' || period === 'max' || period === 'all'
      || period === '1h' || period === '1d' || period === '1w' || period === '1m' || period === '3m' || period === '1y'
    const yearly = period === '1a' || period === '3a' || period === '5a'
    const steps = daily ? [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365]
      : yearly ? [1, 2, 5, 10]
      : [1, 2, 3, 4, 6, 12, 24]
    let step = steps[steps.length - 1]
    for (const s of steps) {
      if (barSpacing * s >= 64) { step = s; break }
    }
    if (visRange && rows.length) {
      const from = Math.max(0, Math.floor(visRange.from))
      const to = Math.min(rows.length - 1, Math.ceil(visRange.to))
      const yBottom = svgRect.height - 8
      const monthIntl = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { month: 'short', year: '2-digit' })
      for (let i = from; i <= to; i++) {
        if ((i - from) % step !== 0) continue
        const x = st.chart.timeScale().timeToCoordinate(rows[i].time)
        if (x == null || x < -16 || x > svgRect.width + 16) continue
        const [y, m, d] = rows[i].time.split('-').map(Number)
        const mm = m < 10 ? `0${m}` : `${m}`
        const dd = d < 10 ? `0${d}` : `${d}`
        let label
        if (daily) {
          label = step >= 90 || m === 1 ? `${dd}/${mm}/${String(y).slice(2)}` : `${dd}/${mm}`
        } else if (yearly) {
          label = String(y)
        } else {
          label = step >= 12 ? String(y) : monthIntl.format(new Date(y, m - 1, 1)).replace(/\./g, '')
        }
        timeLabels.push({
          type: 'text',
          props: { x: Math.round(x), y: yBottom, fill: C.axis, fontSize: 10, textAnchor: 'middle', children: label },
        })
      }
    }

    append(parts, svg)
    append(grips, svg)
    append(timeLabels, svg)
  }

  redrawRef.current = redraw

  const svgPointerEvents = tool === 'cursor' ? 'none' : 'auto'

  const CHIPS = IND_ROWS

  return (
    <div className={`mc-root${full ? ' fullscreen' : ''}`} ref={rootRef}>
      <div className="mc-wrap" ref={wrapRef}>
        {symbol && <div className="mc-watermark">{symbol}</div>}
        <div ref={chartElRef} className="mc-chart" />
        <svg
          ref={svgRef}
          className="mc-overlay"
          style={{ pointerEvents: svgPointerEvents }}
          onPointerDown={onSvgPointerDown}
        />
        <div className="mc-quick">
          <button className={`mc-qbtn ${chartType === 'candle' ? 'active' : ''}`} title={TT(lang, 'candle')} onClick={() => setChartType('candle')}><CandleSvg /></button>
          <button className={`mc-qbtn ${chartType === 'line' ? 'active' : ''}`} title={TT(lang, 'line')} onClick={() => setChartType('line')}><LineSvg /></button>
          <span className="mc-qsep" />
          <button className="mc-qbtn" title={TT(lang, 'zoomIn')} onClick={() => zoomBy(1 / 1.35)}><Plus size={15} /></button>
          <button className="mc-qbtn" title={TT(lang, 'zoomOut')} onClick={() => zoomBy(1.35)}><Minus size={15} /></button>
          <button className="mc-qbtn" title={TT(lang, 'reset')} onClick={zoomReset}><RotateCcw size={15} /></button>
          <button className={`mc-qbtn${full ? ' on' : ''}`} title={full ? TT(lang, 'exitFull') : TT(lang, 'full')} onClick={toggleFull}>
            {full ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
          <span className="mc-qsep" />
          <button className={`mc-qbtn${toolsVisible ? ' active' : ''}`} title={TT(lang, 'tools')} onClick={() => (onToolsOpenChange ? onToolsOpenChange(!toolsOpen) : setLocalTools(v => !v))}>
            <SlidersHorizontal size={15} />
          </button>
        </div>
        {toolsVisible && (
          <>
            <div className="mc-toolbar mc-float-ind">
              {CHIPS.map(c => {
                const on = typeof c.k === 'number' ? emasOn[c.k] : inds[c.k]
                return (
                  <span
                    key={String(c.k)}
                    className={`mc-chip ${on ? 'on' : ''}`}
                    style={on ? { color: c.color, background: c.color + '1F' } : {}}
                    onClick={() => typeof c.k === 'number' ? toggleEma(c.k) : toggleInd(c.k)}
                  >{c.label}</span>
                )
              })}
              {statusText && <span className="mc-status">{statusText}</span>}
            </div>
            <div className="mc-dtoolbar mc-float-draw">
              <span className="mc-dgroup">
                {DRAW_TOOLS.map(ct => {
                  const Icon = ct.icon
                  const active = tool === ct.id
                  return (
                    <button
                      key={ct.id}
                      className={`mc-dbtn ${active ? 'active' : ''}`}
                      title={ct.title}
                      onClick={() => setTool(active ? 'cursor' : ct.id)}
                    >
                      <Icon size={15} />
                    </button>
                  )
                })}
              </span>
              <span className="mc-dgroup right">
                <button className={`mc-dbtn ${tool === 'scan' ? 'active' : ''}`} title="Zoom box" onClick={() => setTool(tool === 'scan' ? 'cursor' : 'scan')}><Scan size={15} /></button>
              </span>
              {tool !== 'cursor' && (
                <span className="mc-dhint"><Hand size={11} /> {tool === 'erase' ? TT(lang, 'eraseHint') : TT(lang, 'drawHint')}</span>
              )}
            </div>
          </>
        )}
        <div className={`mc-legend${toolsVisible ? ' mc-legend-min' : ''}`}>
          <div className="mc-lg-row1">
            <span className="mc-lg-sym">{symbol || '—'}</span>
            <span ref={el => { legRefs.current.price = el }} className="mc-lg-price">—</span>
            <span ref={el => { legRefs.current.chg = el }} className="mc-lg-chg">—</span>
          </div>
          <div ref={el => { legRefs.current.ohlc = el }} className="mc-lg-ohlc" />
          <div ref={el => { legRefs.current.date = el }} className="mc-lg-date" />
          <div className="mc-lg-inds">
            {IND_ROWS.map(r => {
              const on = typeof r.k === 'number' ? emasOn[r.k] : inds[r.k]
              if (!on) return null
              return (
                <div className="mc-lg-ind" key={r.key}>
                  <i className="mc-lg-dot" style={{ background: r.color }} />
                  <span className="mc-lg-ind-name">{r.label}</span>
                  <b ref={el => { indRefs.current[r.key] = el }}>—</b>
                </div>
              )
            })}
          </div>
        </div>
        <div ref={lineRef} className="mc-pline" />
        <div ref={tagRef} className="mc-ptag" />
        <div ref={tipRef} className="mc-tip" />
        <div className="mc-tv" aria-hidden>
          <span>TradingView</span>
        </div>
        {!rows.length && (
          <div className="mc-empty">—</div>
        )}
      </div>
      <style jsx>{`
        .mc-root {
          display: flex; flex-direction: column; flex: 1; min-height: 0;
          background: ${C.bg}; color: ${C.text};
          font-family: Inter, -apple-system, sans-serif;
        }
        .mc-root.fullscreen {
          position: fixed; inset: 0; z-index: 1000; height: 100dvh;
          background: ${C.bg};
        }
        .mc-root.fullscreen .mc-wrap { border-radius: 0; }
        .mc-quick {
          position: absolute; top: 8px; right: 8px; z-index: 7;
          display: flex; align-items: center; gap: 2px;
          background: rgba(13,13,13,0.9); border: 1px solid #262626; border-radius: 10px;
          padding: 3px; box-shadow: 0 6px 18px rgba(0,0,0,0.4);
          backdrop-filter: blur(8px);
        }
        .mc-qbtn {
          width: 28px; height: 28px; border: none; border-radius: 8px;
          background: none; color: #8E95A3; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 0; transition: background 100ms ease-out, color 100ms ease-out;
        }
        .mc-qbtn:hover { background: #1A1A1A; color: #E2E8F0; }
        .mc-qbtn.active { background: rgba(42,203,138,0.16); color: #2ACB8A; }
        .mc-qbtn.on { background: rgba(42,203,138,0.16); color: #2ACB8A; }
        .mc-qsep { width: 1px; height: 16px; background: #262626; margin: 0 2px; }
        .mc-toolbar {
          display: flex; align-items: center; gap: 6px; padding: 0;
          flex-wrap: wrap;
        }
        .mc-toolbar.mc-float-ind {
          position: absolute; z-index: 7;
          top: 50px; right: 8px;
          flex-direction: column; align-items: stretch; gap: 5px;
          background: rgba(13,13,13,0.9); border: 1px solid #262626; border-radius: 10px;
          padding: 5px; box-shadow: 0 6px 18px rgba(0,0,0,0.4);
          backdrop-filter: blur(8px);
          max-width: 96px;
        }
        .mc-chip {
          display: flex; align-items: center; gap: 5px;
          font-size: 10px; font-weight: 600; padding: 4px 10px; border-radius: 8px;
          background: #0F0F0F; border: 1px solid #262626; color: #7B8798;
          cursor: pointer; user-select: none; white-space: nowrap;
          transition: background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out;
        }
        .mc-chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.4; }
        .mc-chip.on::before { opacity: 1; }
        .mc-status { margin-left: auto; font-size: 10px; color: #666; white-space: nowrap; }
        .mc-dtoolbar.mc-float-draw {
          position: absolute; z-index: 7;
          bottom: 8px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 8px;
          background: rgba(13,13,13,0.9); border: 1px solid #262626; border-radius: 10px;
          padding: 3px; box-shadow: 0 6px 18px rgba(0,0,0,0.4);
          backdrop-filter: blur(8px);
          max-width: calc(100% - 16px);
        }
        .mc-dgroup { display: flex; align-items: center; gap: 2px; background: #0F0F0F; border-radius: 9px; padding: 2px; }
        .mc-dgroup.right { margin-left: auto; }
        .mc-dbtn {
          width: 26px; height: 26px; border: none; border-radius: 7px;
          background: none; color: #8E95A3; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 0; transition: background 100ms ease-out, color 100ms ease-out;
        }
        .mc-dbtn:hover { background: #1A1A1A; color: #E2E8F0; }
        .mc-dbtn.active { background: rgba(53,208,127,0.18); color: #35D07F; }
        .mc-dhint {
          display: flex; align-items: center; gap: 4px;
          font-size: 10px; color: #5B6678; white-space: nowrap;
        }
        @media (min-width: 768px) {
          .mc-wrap { min-height: 420px; }
          .mc-toolbar.mc-float-ind {
            flex-direction: row; flex-wrap: wrap; justify-content: center;
            top: 8px; left: 50%; right: auto; transform: translateX(-50%);
            max-width: none;
          }
          .mc-root.fullscreen .mc-toolbar.mc-float-ind { left: 50%; top: 52px; }
        }
        @media (max-width: 767px) {
          .mc-legend {
            min-width: 0; max-width: calc(100% - 16px);
            padding: 6px 9px 7px; font-size: 10px; top: 8px; left: 8px;
          }
          .mc-legend.mc-legend-min { display: none; }
          .mc-lg-sym { font-size: 11px; }
          .mc-lg-ohlc { max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
          .mc-lg-inds { display: none; }
        }
        .mc-wrap {
          flex: 1; min-height: 0; position: relative;
          border-radius: 6px; overflow: hidden;
        }
        .mc-chart { position: absolute; inset: 0; z-index: 2; }
        .mc-watermark {
          position: absolute; inset: 0; z-index: 2;
          pointer-events: none; user-select: none;
          display: flex; align-items: center; justify-content: center;
          font-size: clamp(56px, 9vw, 110px); font-weight: 700; letter-spacing: -0.02em;
          color: rgba(255,255,255,0.028); font-variant-numeric: tabular-nums;
        }
        .mc-overlay { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 3; touch-action: none; }
        .mc-legend {
          position: absolute; top: 10px; left: 10px; z-index: 5;
          background: rgba(0,0,0,0.88); border: 1px solid #262626;
          border-radius: 10px; padding: 8px 12px 9px;
          font-size: 10.5px; pointer-events: none; user-select: none;
          min-width: 208px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        }
        .mc-lg-row1 { display: flex; align-items: center; gap: 8px; }
        .mc-lg-sym { font-weight: 700; color: #E8EEF7; font-size: 12px; }
        .mc-lg-price { font-weight: 700; font-variant-numeric: tabular-nums; transition: color 80ms ease-out; }
        .mc-lg-chg {
          font-weight: 700; font-size: 10px; padding: 2px 6px; border-radius: 5px;
          color: #8E95A3; font-variant-numeric: tabular-nums;
        }
        .mc-lg-ohlc { margin-top: 5px; color: #8E95A3; font-variant-numeric: tabular-nums; letter-spacing: 0; white-space: nowrap; }
        .mc-lg-date { color: #5B6678; margin-top: 2px; font-size: 9.5px; }
        .mc-lg-inds {
          margin-top: 6px; border-top: 1px solid rgba(148,163,184,0.12);
          padding-top: 5px; display: flex; flex-direction: column; gap: 3px;
        }
        .mc-lg-ind { display: flex; align-items: center; gap: 6px; color: #8E95A3; }
        .mc-lg-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
        .mc-lg-ind-name { font-size: 10px; }
        .mc-lg-ind b { margin-left: auto; font-weight: 600; color: #E8EEF7; font-variant-numeric: tabular-nums; }
        .mc-pline {
          position: absolute; left: 0; right: 0; height: 0; z-index: 4;
          border-top: 1px dashed rgba(233,240,250,0.45);
          transition: top 150ms ease-out, opacity 120ms ease-out;
          pointer-events: none;
        }
        .mc-ptag {
          position: absolute; right: 0; z-index: 4;
          transform: translateY(-50%);
          color: #0D1426; font-family: Inter, sans-serif;
          font-weight: 700; font-size: 12px;
          padding: 4px 8px; border-radius: 4px;
          background: #FFFFFF;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          transition: top 150ms ease-out, opacity 120ms ease-out;
          pointer-events: none;
        }
        .mc-tv {
          position: absolute; left: 8px; bottom: 8px; z-index: 5;
          width: 40px; height: 40px; border-radius: 50%;
          background: #000000;
          display: flex; align-items: center; justify-content: center;
          opacity: 0.6; pointer-events: none;
        }
        .mc-tv span {
          color: #fff; font-size: 8px; font-weight: 700;
          letter-spacing: 0; font-family: Inter, sans-serif;
          white-space: nowrap;
        }
        .mc-tip {
          position: absolute; z-index: 6; width: 150px;
          background: ${C.tipBg}; border: 1px solid ${C.tipBorder};
          border-radius: 8px; padding: 8px 10px;
          opacity: 0; transition: opacity 100ms ease-out;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
          pointer-events: none;
        }
        .mc-tip-title { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
        .mc-tip-date { color: #6B7280; font-size: 10px; margin: 1px 0 6px; }
        .mc-tip-row {
          display: flex; justify-content: space-between;
          font-size: 11px; line-height: 1.355; color: #8E95A3;
        }
        .mc-tip-row b { font-weight: 600; color: #E2E8F0; font-variant-numeric: tabular-nums; }
        .mc-empty {
          position: absolute; inset: 0; z-index: 2;
          display: flex; align-items: center; justify-content: center;
          color: #5B6472; font-size: 20px;
        }
      `}</style>
    </div>
  )
})
