import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollPhysics, clamp, interpolate } from '../lib/physicsEngine'

// Params ajustés par plateforme (spec §34)
function platformParams() {
  if (typeof window === 'undefined' || !window.matchMedia) return {}
  return window.matchMedia('(pointer: coarse)').matches
    ? { friction: 0.94, velocityMultiplier: 1.1, snapVelocityThreshold: 0.35 }
    : { friction: 0.9, velocityMultiplier: 0.92, snapVelocityThreshold: 0.45 }
}

const TUNING = {
  centerScale: 1.0,
  edgeScale: 0.92,
  centerOpacity: 1.0,
  edgeOpacity: 0.75,
  maxTranslateY: 8,
  maxRotation: 6,
  maxBlur: 2,
  maxParallax: 12,
  perspective: 1000,
  shadowMax: 0.35,
}

const WINDOW_MARGIN = 2

export default function PhysicsCarousel({
  data = [],
  renderItem,
  itemWidth = 156,
  gap = 10,
  initialIndex = 0,
  onIndexChange,
  params,
  className = '',
  ariaLabel = 'Carousel',
}) {
  const viewportRef = useRef(null)
  const trackRef = useRef(null)
  const cardEls = useRef(new Map())
  const ppEls = useRef(new Map())
  const phRef = useRef(null)
  if (!phRef.current) phRef.current = new ScrollPhysics({ ...platformParams(), ...params })
  const ph = phRef.current

  const [reduced, setReduced] = useState(false)
  const reducedRef = useRef(false)
  reducedRef.current = reduced

  const layout = useRef({ viewW: 0, inited: false })
  const spacing = itemWidth + gap
  const count = data.length

  const dragging = useRef(false)
  const suppressClick = useRef(false)
  const pointer = useRef({ id: null, lastX: 0, lastY: 0, moved: 0 })
  const rafId = useRef(0)
  const wheelActive = useRef(false)
  const frameFn = useRef(() => {})
  const [win, setWin] = useState({ lo: 0, hi: Math.max(0, count - 1) })

  // ---- Boucle continue pilotée par l'état physique (spec §36)
  const requestFrame = () => {
    if (rafId.current) return
    rafId.current = requestAnimationFrame(() => frameFn.current())
  }
  const stop = () => {
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = 0
  }

  const measure = () => {
    const el = viewportRef.current
    if (!el) return
    // offsetWidth = px de layout (insensible au zoom css d'html sur mobile)
    const w = el.offsetWidth || 300
    layout.current.viewW = w
    ph.setBounds(-(w - itemWidth) / 2, Math.max(0, (count - 1) * spacing) + (w - itemWidth) / 2)
    ph.setSnapSpacing(spacing)
    ph.setMaxIndex(Math.max(0, count - 1))
    const first = cardEls.current.get(0)
    if (first && trackRef.current) {
      trackRef.current.style.height = `${first.offsetHeight}px`
    }
    if (!layout.current.inited) {
      layout.current.inited = true
      ph.position = -(w - itemWidth) / 2 + initialIndex * spacing
      ph.settleNow()
      requestFrame()
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !viewportRef.current) return
    measure()
    const ro = new ResizeObserver(() => { measure(); requestFrame() })
    ro.observe(viewportRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemWidth, gap, count])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = e => {
      setReduced(e.matches)
      ph.settleNow()
      requestFrame()
    }
    setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Transform dérivée de l'état physique (spec §10–15, §18, §24)
  const applyTransform = (el, i) => {
    const { viewW } = layout.current
    const cardCenter = ph.position + i * spacing + itemWidth / 2
    const d = clamp((cardCenter - viewW / 2) / viewW * 2, -1, 1)
    const ad = Math.abs(d)
    const scale = interpolate(ad, [0, 1], [TUNING.centerScale, TUNING.edgeScale])
    const opacity = interpolate(ad, [0, 1], [TUNING.centerOpacity, TUNING.edgeOpacity])
    const ty = interpolate(ad, [0, 1], [0, TUNING.maxTranslateY])
    const ry = d * TUNING.maxRotation
    const blur = ad > 0.08 ? interpolate(ad, [0, 1], [0, TUNING.maxBlur]) : 0
    const z = 10 - Math.round(ad * 9)
    el.style.transform = `translate3d(${(i * spacing - ph.position).toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(3)}) rotateY(${ry.toFixed(2)}deg)`
    el.style.opacity = opacity.toFixed(3)
    el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : ''
    el.style.zIndex = String(z)
    el.style.setProperty('--depth', (1 - ad).toFixed(3))
  }

  const applyParallax = i => {
    const els = ppEls.current.get(i)
    if (!els) return
    const scrollPos = ph.position - ph._min
    for (const el of els) {
      const f = parseFloat(el.dataset.pp) || 0.85
      const px = clamp(scrollPos * (1 - f), -TUNING.maxParallax, TUNING.maxParallax)
      el.style.transform = `translate3d(${px.toFixed(2)}px, 0, 0)`
    }
  }

  const frame = () => {
    const settled = ph.step(performance.now())
    if (layout.current.viewW > 0 && count > 0) {
      for (let i = 0; i < count; i++) {
        const el = cardEls.current.get(i)
        if (!el) continue
        if (reducedRef.current) {
          el.style.transform = `translate3d(${(i * spacing - ph.position).toFixed(2)}px, 0, 0)`
          el.style.opacity = '1'
          el.style.filter = ''
          el.style.zIndex = '10'
          el.style.setProperty('--depth', '0')
        } else {
          applyTransform(el, i)
          applyParallax(i)
        }
      }
      // fenêtre de virtualisation (spec §30)
      const lo = Math.max(0, Math.floor((ph.position - ph._min) / spacing) - WINDOW_MARGIN)
      const hi = Math.min(count - 1, Math.ceil((ph.position - ph._min + layout.current.viewW) / spacing) + WINDOW_MARGIN)
      setWin(prev => (prev.lo === lo && prev.hi === hi) ? prev : { lo, hi })
    }
    if (settled) {
      stop()
      if (onIndexChange && layout.current.viewW > 0 && count > 0) {
        const idx = clamp(Math.round((ph.position - ph._min) / spacing), 0, count - 1)
        onIndexChange(idx)
      }
    } else {
      rafId.current = requestAnimationFrame(() => frameFn.current())
    }
  }
  frameFn.current = frame

  // ---- Gestes (spec §3, §4, §28, §29)
  const onPointerDown = e => {
    if (count === 0) return
    pointer.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: 0 }
    suppressClick.current = false
    dragging.current = true
    ph.startDrag(performance.now())
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) {}
    requestFrame()
  }

  const onPointerMove = e => {
    if (!dragging.current || e.pointerId !== pointer.current.id) return
    const dx = e.clientX - pointer.current.lastX
    const dy = e.clientY - pointer.current.lastY
    pointer.current.lastX = e.clientX
    pointer.current.lastY = e.clientY
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    if (Math.abs(dx) < Math.abs(dy)) return // geste vertical → page
    pointer.current.moved += Math.abs(dx)
    if (pointer.current.moved > 6) suppressClick.current = true
    ph.dragMove(-dx, performance.now())
    if (e.cancelable) e.preventDefault()
  }

  const endDrag = e => {
    if (!dragging.current) return
    dragging.current = false
    if (reducedRef.current) {
      ph.position = clamp(ph.position, ph._min, ph._max)
      ph.settleNow()
    } else {
      ph.endDrag(performance.now())
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) {}
    if (pointer.current.moved > 6) {
      suppressClick.current = true
    } else {
      setTimeout(() => { suppressClick.current = false }, 10)
    }
    requestFrame()
  }

  // ---- Wheel / trackpad inertiel (spec §34)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = e => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey
      if (!horizontal) return
      e.preventDefault()
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
      if (reducedRef.current) {
        ph.position = clamp(ph.position - delta * factor, ph._min, ph._max)
        ph.settleNow()
        requestFrame()
        return
      }
      wheelActive.current = true
      ph.dragMove(-delta * factor, performance.now())
      requestFrame()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!wheelActive.current) return
    const t = setTimeout(() => {
      wheelActive.current = false
      if (!dragging.current && !reducedRef.current) {
        ph.endDrag(performance.now())
        requestFrame()
      }
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const onKeyDown = e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      const idx = clamp(Math.round((ph.position - ph._min) / spacing) + dir, 0, Math.max(0, count - 1))
      ph.snapTo(idx, performance.now())
      requestFrame()
    }
  }

  const visible = useMemo(() => {
    const list = []
    for (let i = win.lo; i <= win.hi; i++) list.push(i)
    return list
  }, [win.lo, win.hi])

  return (
    <div
      ref={viewportRef}
      className={`pc-viewport ${className}`}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={e => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault() } }}
    >
      <div ref={trackRef} className="pc-track">
        {visible.map(i => (
          <div
            key={i}
            ref={el => {
              if (el) {
                cardEls.current.set(i, el)
                ppEls.current.set(i, Array.from(el.querySelectorAll('[data-pp]')))
              } else {
                cardEls.current.delete(i)
                ppEls.current.delete(i)
              }
            }}
            className="pc-card"
            style={{ width: itemWidth }}
            data-index={i}
          >
            <div className="pc-shade" />
            <div className="pc-inner">{renderItem(data[i], i)}</div>
          </div>
        ))}
      </div>
      <style jsx>{`
        .pc-viewport {
          position: relative; overflow: hidden;
          touch-action: pan-y; cursor: grab;
          -webkit-user-select: none; user-select: none;
          outline: none;
        }
        .pc-viewport:active { cursor: grabbing; }
        .pc-track { position: relative; perspective: ${TUNING.perspective}px; }
        .pc-card {
          position: absolute; top: 0; left: 0;
          transform-origin: center center;
          will-change: transform, opacity;
          backface-visibility: hidden;
          -webkit-tap-highlight-color: transparent;
        }
        .pc-shade {
          position: absolute; inset: 0; border-radius: 16px;
          pointer-events: none;
          box-shadow: 0 18px 40px -12px rgba(0,0,0,0.55);
          opacity: calc(${TUNING.shadowMax} * var(--depth, 0));
        }
        .pc-inner { position: relative; }
      `}</style>
    </div>
  )
}
