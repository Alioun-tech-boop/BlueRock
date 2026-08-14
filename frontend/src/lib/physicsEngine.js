// Moteur de physique du scroll premium — purement fonctionnel, sans React.
// Unités : pixels et millisecondes. Vitesse en px/ms.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const lerp = (a, b, t) => a + (b - a) * t

export const easeOutCubic = t => 1 - Math.pow(1 - t, 3)
export const easeOutQuart = t => 1 - Math.pow(1 - t, 4)
export const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

export function interpolate(x, [x0, x1], [y0, y1]) {
  const t = clamp((x - x0) / (x1 - x0), 0, 1)
  return y0 + (y1 - y0) * t
}

export const DEFAULT_PARAMS = {
  friction: 0.92,           // décélération inertielle par frame (60fps)
  velocityMultiplier: 1.0,  // amplification de la vélocité au relâchement
  springMass: 1,
  springStiffness: 210,
  springDamping: 24,
  overscrollFactor: 0.35,   // résistance élastique hors bornes
  snapVelocityThreshold: 0.4, // px/ms en dessous → snap simple
  snapAnticipationMs: 420,  // anticipation inertielle du snap (plusieurs cartes)
  minVelocity: 0.03,        // px/ms → repos
  maxVelocity: 4,           // plafond anti-pics
}

export class ScrollPhysics {
  constructor(params = {}) {
    this.p = { ...DEFAULT_PARAMS, ...params }
    this.position = 0
    this.velocity = 0
    this.target = null
    this.dragging = false
    this.snapEnabled = true
    this.spacing = 1
    this._min = 0
    this._max = 0
    this._last = 0
  }

  setBounds(min, max) {
    this._min = min
    this._max = Math.max(min, max)
  }

  setSnapSpacing(px) { this.spacing = Math.max(1, px) }

  setSnap(enabled) { this.snapEnabled = enabled }

  setMaxIndex(n) { this._maxIndex = Math.max(0, n) }

  _clampIndex(i) { return clamp(Math.round(i), 0, this._maxIndex) }

  _overscroll() {
    if (this.position < this._min) return this.position - this._min
    if (this.position > this._max) return this.position - this._max
    return 0
  }

  // Résistance progressive hors bornes : plus on pousse loin, plus c'est dur.
  _resistance(delta) {
    const o = this._overscroll()
    if (o === 0) return delta
    const k = Math.pow(this.p.overscrollFactor, 1 + Math.abs(o) / 420)
    return delta * k
  }

  startDrag(t) {
    this.dragging = true
    this.target = null
    this._last = t
  }

  // delta = déplacement du CONTENU (px, signe inverse du geste)
  dragMove(delta, t) {
    const dt = Math.max(1, t - this._last)
    this._last = t
    this.position += this._resistance(delta)
    const inst = clamp(delta / dt, -this.p.maxVelocity, this.p.maxVelocity)
    this.velocity = this.velocity * 0.7 + inst * 0.3
  }

  _snapIndex() {
    const base = Math.round((this.position - this._min) / this.spacing)
    return this._clampIndex(base)
  }

  endDrag(t) {
    this.dragging = false
    this._last = t
    const o = this._overscroll()
    if (o !== 0) {
      this.target = this.position - o
      this.velocity *= 0.5
      return
    }
    if (!this.snapEnabled) return
    const v = this.velocity * this.p.velocityMultiplier
    if (Math.abs(v) < this.p.snapVelocityThreshold) {
      this.target = this._min + this._snapIndex() * this.spacing
      return
    }
    const idx = this._clampIndex(
      this._snapIndex() + Math.round((v * this.p.snapAnticipationMs) / this.spacing),
    )
    this.target = this._min + idx * this.spacing
  }

  snapTo(index, t) {
    this.dragging = false
    this.velocity *= 0.3
    this.target = this._min + this._clampIndex(index) * this.spacing
    this._last = t || performance.now()
  }

  settleNow() {
    this.target = null
    this.velocity = 0
  }

  // Avance d'une frame. Retourne true quand le système est au repos.
  step(now) {
    if (this.dragging) {
      this._last = now
      return false
    }
    const dt = clamp(now - this._last, 1, 33)
    this._last = now

    if (this.target !== null) {
      // Spring : a = -k(x - target)/m - c·v/m (semi-implicite Euler)
      const x = this.position - this.target
      const v = this.velocity * 1000
      const dtS = dt / 1000
      const a = -(this.p.springStiffness / this.p.springMass) * x
        - (this.p.springDamping / this.p.springMass) * v
      const v2 = v + a * dtS
      this.position += v2 * dtS
      this.velocity = v2 / 1000
      if (Math.abs(this.position - this.target) < 0.4 && Math.abs(v2) < 6) {
        this.position = this.target
        this.velocity = 0
        this.target = null
        return true
      }
      return false
    }

    if (Math.abs(this.velocity) < this.p.minVelocity) {
      this.velocity = 0
      return true
    }
    this.velocity *= Math.pow(this.p.friction, dt / 16.667)
    this.position += this.velocity * dt
    const o = this._overscroll()
    if (o !== 0 && this.velocity * Math.sign(o) > 0) {
      this.position -= o
      this.velocity *= 0.5
      this.target = this.position
    }
    return false
  }
}
