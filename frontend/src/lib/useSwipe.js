import { useEffect, useRef } from 'react'

export function useDragScroll(ref, { onSwipe = null, threshold = 60 } = {}) {
  const cbRef = useRef({ onSwipe })
  cbRef.current = { onSwipe }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let down = false
    let moved = false
    let suppressClick = false
    let startX = 0
    let startY = 0
    let endX = 0
    let endY = 0
    let startScroll = 0

    const pd = (e) => {
      down = true
      moved = false
      suppressClick = false
      startX = endX = e.clientX
      startY = endY = e.clientY
      startScroll = el.scrollLeft
    }
    const pm = (e) => {
      if (!down) return
      endX = e.clientX
      endY = e.clientY
      if (Math.abs(endX - startX) > 4) moved = true
      if (e.pointerType !== 'touch') el.scrollLeft = startScroll - (endX - startX)
    }
    const pu = () => {
      if (!down) return
      down = false
      const dx = endX - startX
      const dy = endY - startY
      const scrolled = Math.abs(el.scrollLeft - startScroll) > 2
      if (
        !scrolled &&
        moved &&
        cbRef.current.onSwipe &&
        Math.abs(dx) >= threshold &&
        Math.abs(dy) < Math.abs(dx) * 0.6
      ) {
        cbRef.current.onSwipe(dx < 0 ? 'next' : 'prev')
        suppressClick = true
        return
      }
      if (moved) suppressClick = true
    }
    const pc = () => {
      down = false
    }
    const clickCap = (e) => {
      if (suppressClick) {
        e.preventDefault()
        e.stopPropagation()
        suppressClick = false
      }
    }
    const wheel = (e) => {
      if (el.scrollWidth <= el.clientWidth + 1) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      } else {
        el.scrollLeft += e.deltaX
      }
    }
    el.addEventListener('pointerdown', pd)
    el.addEventListener('pointermove', pm)
    el.addEventListener('pointerup', pu)
    el.addEventListener('pointercancel', pc)
    el.addEventListener('click', clickCap, true)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', pd)
      el.removeEventListener('pointermove', pm)
      el.removeEventListener('pointerup', pu)
      el.removeEventListener('pointercancel', pc)
      el.removeEventListener('click', clickCap, true)
      el.removeEventListener('wheel', wheel)
    }
  }, [ref, threshold])
}

export function useSwipeNav(ref, { onPrev = null, onNext = null, threshold = 60, onlyTouch = false, enabled = true } = {}) {
  const cbRef = useRef({ onPrev, onNext })
  cbRef.current = { onPrev, onNext }
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let down = false
    let suppressClick = false
    let sx = 0
    let sy = 0
    let mx = 0
    let my = 0

    const pd = (e) => {
      if (onlyTouch && e.pointerType !== 'touch') return
      if (e.target && e.target.closest && e.target.closest('[data-ai-scroll]')) return
      down = true
      suppressClick = false
      sx = mx = e.clientX
      sy = my = e.clientY
      try {
        el.setPointerCapture(e.pointerId)
      } catch (err) {}
    }
    const pm = (e) => {
      if (!down) return
      mx = e.clientX
      my = e.clientY
    }
    const pu = () => {
      if (!down) return
      down = false
      const dx = mx - sx
      const dy = my - sy
      if (Math.abs(dx) >= threshold && Math.abs(dy) < Math.abs(dx) * 0.6) {
        if (dx < 0) cbRef.current.onNext && cbRef.current.onNext()
        else cbRef.current.onPrev && cbRef.current.onPrev()
        suppressClick = true
      }
    }
    const pc = () => {
      down = false
    }
    const clickCap = (e) => {
      if (suppressClick) {
        e.preventDefault()
        e.stopPropagation()
        suppressClick = false
      }
    }
    el.addEventListener('pointerdown', pd)
    el.addEventListener('pointermove', pm)
    el.addEventListener('pointerup', pu)
    el.addEventListener('pointercancel', pc)
    el.addEventListener('click', clickCap, true)
    return () => {
      el.removeEventListener('pointerdown', pd)
      el.removeEventListener('pointermove', pm)
      el.removeEventListener('pointerup', pu)
      el.removeEventListener('pointercancel', pc)
      el.removeEventListener('click', clickCap, true)
    }
  }, [ref, onlyTouch, enabled, threshold])
}
