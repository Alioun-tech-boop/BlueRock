let cached = {}

export function onLogoError(e) {
  const img = e.currentTarget
  if (img.crossOrigin) {
    img.crossOrigin = null
    img.src = img.src
  } else {
    img.style.display = 'none'
  }
}

export function applyLogoBackground(container, img) {
  if (!container || !img) return
  if (!img.complete || !img.naturalWidth) return
  const url = img.src
  if (cached[url]) {
    if (cached[url] === 'none') img.style.display = 'none'
    else container.style.background = cached[url]
    return
  }
  try {
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 32
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, 32, 32)
    const d = ctx.getImageData(0, 0, 32, 32).data
    let opaque = 0
    let sumL = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue
      opaque++
      sumL += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    }
    if (opaque < 8) {
      cached[url] = 'none'
      img.style.display = 'none'
      return
    }
    const lum = sumL / opaque
    const ratio = opaque / (d.length / 4)
    let bg = '#ffffff'
    if (ratio < 0.9) {
      bg = lum > 170 ? '#121212' : '#ffffff'
    } else {
      const px = (x, y) => {
        const i = (y * 32 + x) * 4
        return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      }
      const cLum = (px(1, 1) + px(30, 1) + px(1, 30) + px(30, 30)) / 4
      if (cLum < 90) bg = '#121212'
      else if (cLum > 170) bg = '#ffffff'
      else bg = lum < 120 ? '#121212' : '#ffffff'
    }
    cached[url] = bg
    container.style.background = bg
  } catch (e) {
    container.style.background = '#ffffff'
  }
}
