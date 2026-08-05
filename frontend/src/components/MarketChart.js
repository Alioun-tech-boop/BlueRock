import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  ColorType, CrosshairMode, LineStyle, createSeriesMarkers,
} from 'lightweight-charts'
import { fmtPrice, fmtCompact } from '../lib/i18n'

const C = {
  bg: '#0B0F19',
  major: 'rgba(255,255,255,0.07)',
  minor: 'rgba(255,255,255,0.025)',
  upBody: 'rgba(34,197,94,0.97)',
  upBorder: 'rgba(22,163,74,0.97)',
  downBody: 'rgba(239,68,68,0.97)',
  downBorder: 'rgba(220,38,38,0.97)',
  text: '#8B93A7',
  axis: '#5B6472',
  crosshair: 'rgba(255,255,255,0.18)',
  labelBg: '#1E293B',
  ema: { 20: '#3B82F6', 50: '#FACC15', 200: '#A855F7' },
  tipBg: '#141A26',
  tipBorder: '#2A3448',
  boll: '#8B5CF6',
  vwap: '#14B8A6',
  rsi: '#A78BFA',
  macdLine: '#2196F3',
  macdSignal: '#FF9800',
}

const EMAS = [20, 50, 200]

const BAR_SPAN = { '1m': 22, '3m': 65, '6m': 128, '1a': 252, '3a': 756, '5a': 0 }

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

export default function MarketChart({ data = [], period = '1a', lang = 'fr', statusText = '', markers = [] }) {
  const rootRef = useRef(null)
  const gridRef = useRef(null)
  const chartElRef = useRef(null)
  const lineRef = useRef(null)
  const tagRef = useRef(null)
  const tipRef = useRef(null)
  const stateRef = useRef(null)
  const [emasOn, setEmasOn] = useState({ 20: true, 50: true, 200: true })
  const [inds, setInds] = useState({ boll: false, vwap: false, rsi: false, macd: false })
  const [hovering, setHovering] = useState(false)

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
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.06, bottom: 0.22 },
        textColor: C.axis,
      },
      timeScale: {
        borderVisible: false,
        barSpacing: 13,
        minBarSpacing: 2.5,
        maxBarSpacing: 40,
        rightOffset: 1,
        textColor: C.axis,
        timeVisible: false,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, width: 1, style: LineStyle.Solid, labelBackgroundColor: C.labelBg },
        horzLine: { color: C.crosshair, width: 1, style: LineStyle.Solid, labelBackgroundColor: C.labelBg },
      },
      localization: {
        priceFormatter: v => fmtPrice(lang, v, 0),
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
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false })

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

    const st = { chart, candle, vol, emas, markersPlugin: createSeriesMarkers(candle) }
    stateRef.current = st

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
      color: r.close >= r.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
    })))
    for (const p of EMAS) {
      const closes = rows.map(r => r.close)
      st.emas[p].setData(rows.map((r, i) => ({ time: r.time, value: ema(closes, p)[i] })).filter(pt => pt.value != null))
    }

    const paintGrid = () => {
      const cv = gridRef.current
      if (!cv) return
      const rect = cv.parentElement.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(rect.width * dpr)
      cv.height = Math.round(rect.height * dpr)
      const ctx = cv.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.fillStyle = C.bg
      ctx.fillRect(0, 0, rect.width, rect.height)
      const paint = (spacing, color, w) => {
        ctx.strokeStyle = color
        ctx.lineWidth = w
        ctx.beginPath()
        for (let x = spacing; x < rect.width; x += spacing) {
          ctx.moveTo(x + 0.5, 0)
          ctx.lineTo(x + 0.5, rect.height)
        }
        for (let y = spacing; y < rect.height; y += spacing) {
          ctx.moveTo(0, y + 0.5)
          ctx.lineTo(rect.width, y + 0.5)
        }
        ctx.stroke()
      }
      paint(24, C.minor, 1)
      paint(96, C.major, 1)
    }

    const updatePriceLine = () => {
      const last = rows[rows.length - 1]
      const line = lineRef.current
      const tag = tagRef.current
      if (!line || !tag) return
      if (!last || hovering) {
        line.style.opacity = '0'
        tag.style.opacity = '0'
        return
      }
      const y = st.candle.priceToCoordinate(last.close)
      if (y == null) {
        line.style.opacity = '0'
        tag.style.opacity = '0'
        return
      }
      const color = last.close >= last.open ? '#22C55E' : '#EF4444'
      line.style.opacity = '1'
      line.style.top = `${y}px`
      line.style.background = color + '66'
      tag.style.opacity = '1'
      tag.style.top = `${y}px`
      tag.style.background = color
      tag.textContent = fmtPrice(lang, last.close, 0)
    }

    const onCrosshair = param => {
      const tip = tipRef.current
      const seriesData = param.seriesData
      const d = seriesData.get(st.candle)
      if (!d || !param.point) {
        if (tip) tip.style.opacity = '0'
        setHovering(false)
        return
      }
      setHovering(true)
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
      const prevIdx = param.logical != null ? Math.max(0, param.logical - 1) : null
      const prevClose = prevIdx != null && rows[prevIdx] ? rows[prevIdx].close : null
      const chg = prevClose ? ((d.close - prevClose) / prevClose) * 100 : null
      const up = d.close >= d.open
      const dateStr = (() => {
        const [y, m, dd] = d.time.split('-')
        return lang === 'en' ? `${m}/${dd}/${y}` : `${dd}/${m}/${y}`
      })()
      tip.innerHTML = `
        <div class="mc-tip-title" style="color:${up ? '#22C55E' : '#EF4444'}">${fmtPrice(lang, d.close, 0)}</div>
        <div class="mc-tip-date">${dateStr}</div>
        <div class="mc-tip-row"><span>O</span><b>${fmtPrice(lang, d.open, 0)}</b></div>
        <div class="mc-tip-row"><span>H</span><b style="color:#22C55E">${fmtPrice(lang, d.high, 0)}</b></div>
        <div class="mc-tip-row"><span>L</span><b style="color:#EF4444">${fmtPrice(lang, d.low, 0)}</b></div>
        <div class="mc-tip-row"><span>C</span><b>${fmtPrice(lang, d.close, 0)}</b></div>
        <div class="mc-tip-row"><span>V</span><b>${fmtCompact(lang, d.volume)}</b></div>
        <div class="mc-tip-row"><span>%</span><b style="color:${chg != null && chg >= 0 ? '#22C55E' : '#EF4444'}">${chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '—'}</b></div>
      `
      tip.style.opacity = '1'
      tip.style.left = `${tx}px`
      tip.style.top = `${ty}px`
    }

    st.chart.subscribeCrosshairMove(onCrosshair)

    const ro = new ResizeObserver(() => {
      const r = chartEl.parentElement.getBoundingClientRect()
      if (r.width && r.height) {
        st.chart.resize(r.width, r.height)
        paintGrid()
        updatePriceLine()
      }
    })
    ro.observe(chartEl)

    fit()
    paintGrid()
    updatePriceLine()
    requestAnimationFrame(updatePriceLine)

    return () => {
      ro.disconnect()
      st.chart.unsubscribeCrosshairMove(onCrosshair)
      st.markersPlugin.detach()
      st.chart.remove()
      stateRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    st.candle.setData(rows)
    st.vol.setData(rows.map(r => ({
      time: r.time,
      value: r.volume,
      color: r.close >= r.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
    })))
    for (const p of EMAS) {
      const closes = rows.map(r => r.close)
      st.emas[p].setData(rows.map((r, i) => ({ time: r.time, value: ema(closes, p)[i] })).filter(pt => pt.value != null))
    }
  }, [rows])

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const closes = rows.map(r => r.close)
    const boll = computeBollinger(closes, 20, 2)
    const vwapArr = computeVWAP(rows)
    const rsiArr = computeRSI(closes, 14)
    const macdArr = computeMACD(closes)

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
        color: macdArr.hist[i] >= 0 ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)',
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
    st.markersPlugin.setMarkers(markers || [])
  }, [markers])

  const toggleEma = p => setEmasOn(prev => ({ ...prev, [p]: !prev[p] }))
  const toggleInd = k => setInds(prev => ({ ...prev, [k]: !prev[k] }))

  const onWheel = (e) => {
    const st = stateRef.current
    if (!st || !e.ctrlKey && !e.metaKey) return
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

  const CHIPS = [
    { k: 20, label: 'EMA20', color: C.ema[20] },
    { k: 50, label: 'EMA50', color: C.ema[50] },
    { k: 200, label: 'EMA200', color: C.ema[200] },
    { k: 'boll', label: 'BOLL', color: C.boll },
    { k: 'vwap', label: 'VWAP', color: C.vwap },
    { k: 'rsi', label: 'RSI', color: C.rsi },
    { k: 'macd', label: 'MACD', color: C.macdLine },
  ]

  return (
    <div className="mc-root" ref={rootRef}>
      <div className="mc-toolbar">
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
      <div className="mc-wrap" onWheel={onWheel}>
        <canvas ref={gridRef} className="mc-grid" />
        <div ref={chartElRef} className="mc-chart" />
        <div ref={lineRef} className="mc-pline" />
        <div ref={tagRef} className="mc-ptag" />
        <div ref={tipRef} className="mc-tip" />
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
        .mc-toolbar {
          display: flex; align-items: center; gap: 6px; padding: 0 8px 6px;
          flex-wrap: wrap;
        }
        .mc-chip {
          font-size: 10px; font-weight: 600; padding: 3px 9px; border-radius: 9px;
          background: #1B1B1B; color: #666; cursor: pointer; user-select: none;
          transition: background 120ms ease-out, color 120ms ease-out;
        }
        .mc-status { margin-left: auto; font-size: 10px; color: #666; white-space: nowrap; }
        .mc-wrap {
          flex: 1; min-height: 0; position: relative;
          border-radius: 6px; overflow: hidden;
        }
        .mc-grid { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
        .mc-chart { position: absolute; inset: 0; z-index: 2; }
        .mc-pline {
          position: absolute; left: 0; right: 0; height: 1px; z-index: 3;
          transition: top 150ms ease-out, opacity 120ms ease-out;
          pointer-events: none;
        }
        .mc-ptag {
          position: absolute; right: 0; z-index: 3;
          transform: translateY(-50%);
          color: #fff; font-family: Inter, sans-serif;
          font-weight: 600; font-size: 12px;
          padding: 5px 8px; border-radius: 5px;
          transition: top 150ms ease-out, opacity 120ms ease-out;
          pointer-events: none;
        }
        .mc-tip {
          position: absolute; z-index: 4; width: 150px;
          background: ${C.tipBg}; border: 1px solid ${C.tipBorder};
          border-radius: 8px; padding: 8px 10px;
          opacity: 0; transition: opacity 100ms ease-out;
          pointer-events: none;
        }
        .mc-tip-title { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
        .mc-tip-date { color: #6B7280; font-size: 10px; margin: 1px 0 6px; }
        .mc-tip-row {
          display: flex; justify-content: space-between;
          font-size: 11px; line-height: 1.65; color: #8B93A7;
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
}
