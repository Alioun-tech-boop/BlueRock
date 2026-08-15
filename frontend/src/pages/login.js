import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { detectLang, t } from '../lib/i18n'
import TriLoader from '../components/TriLoader'
import { Eye, EyeOff, KeyRound, Check, ArrowLeft, Lock, Mail, UserRound, ChevronRight, AlertTriangle } from 'lucide-react'

const STEPS = {
  login: 'login',
  register: 'register',
  verifyEmail: 'verifyEmail',
  login2fa: 'login2fa',
  forgot: 'forgot',
  reset: 'reset',
}

function passwordScore(p) {
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return Math.min(5, s)
}

function CodeInput({ value, onChange, onComplete, length = 6, autoFocus }) {
  const refs = useRef([])
  const digits = Array.from({ length }, (_, i) => value[i] || '')
  const handle = (i, raw) => {
    const ch = raw.replace(/[^A-Za-z0-9]/g, '').slice(-1).toUpperCase()
    const next = value.slice(0, i) + ch + value.slice(i + 1)
    onChange(next.slice(0, length))
    if (ch && i < length - 1) refs.current[i + 1]?.focus()
  }
  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      onChange(value.slice(0, i - 1))
      refs.current[i - 1]?.focus()
    }
  }
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, length)
    if (text) {
      e.preventDefault()
      onChange(text)
      onComplete?.(text)
    }
  }
  useEffect(() => {
    if (value.length === length) onComplete?.(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length])
  return (
    <div className="code-row">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => refs.current[i] = el}
          className="code-cell"
          inputMode="numeric"
          maxLength={1}
          value={d}
          autoFocus={autoFocus && i === 0}
          onChange={e => handle(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
        />
      ))}
      <style jsx>{`
        .code-row { display: flex; gap: 10px; justify-content: center; width: 100%; margin: 6px 0; }
        .code-cell {
          width: 46px; height: 56px; border-radius: 14px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: #fff;
          text-align: center; font-size: 21px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .code-cell:focus {
          border-color: #18C27C;
          box-shadow: 0 0 0 4px rgba(24,194,124,0.13);
        }
      `}</style>
    </div>
  )
}

function Spinner() {
  return <TriLoader inline />
}

/* ============ Fond animé « marché boursier » ultra réaliste ============ */
const TICKERS = [
  ['STBC', 25000, 0.72], ['SNTS', 31500, -0.4], ['ETIT', 64, 1.1],
  ['BOAB', 1890, -0.25], ['SIVC', 12150, 0.35], ['PALC', 2840, -0.9],
  ['ORGT', 2680, 0.5], ['ONAT', 9700, -0.15], ['CFAC', 14200, 0.85],
  ['SUNU', 2490, -0.6], ['NTLC', 2425, 0.4], ['CABC', 5335, 0.2],
  ['SGBC', 20200, -0.55], ['BNBC', 6250, 0.9], ['TTLS', 820, 1.3],
  ['PRSC', 2750, 0.1], ['SWCR', 4510, -0.35], ['STAC', 1180, 0.6],
  ['ADVTA', 3400, -0.75], ['ABJC', 1960, 0.45],
]

function randn() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
}

function fmtPx(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StockMarketCanvas() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let W = 0, H = 0

    // Historique des cours (marche aléatoire réaliste)
    let price = 9000 + Math.random() * 3000
    const hist = []
    for (let i = 0; i < 240; i++) {
      price = Math.max(200, price * (1 + randn() * 0.006))
      hist.push(price)
    }
    let volPhase = 0

    // Carnet d'ordres (bid/ask)
    let book = []
    let bookFlash = []
    const buildBook = () => {
      book = []
      for (let i = 0; i < 6; i++) {
        book.push({ side: 'bid', px: price * (1 - (0.15 + i * 0.28) / 100), sz: Math.round(5 + Math.random() * 90) })
        book.push({ side: 'ask', px: price * (1 + (0.15 + i * 0.28) / 100), sz: Math.round(5 + Math.random() * 90) })
      }
      bookFlash = book.map(() => Math.random() * 1)
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const tickerX = { v: 0 }
    let lastBuild = 0

    const draw = () => {
      const now = performance.now()
      // Évolution des cours
      for (let i = 0; i < 2; i++) {
        const prev = hist[hist.length - 1]
        hist.push(Math.max(200, prev * (1 + randn() * 0.0035)))
      }
      hist.shift()
      hist.shift()
      price = hist[hist.length - 1]

      volPhase += 0.02
      if (now - lastBuild > 1800) {
        buildBook()
        lastBuild = now
        bookFlash = book.map(() => 1)
      }
      bookFlash = bookFlash.map(a => Math.max(0, a - 0.02))

      // Fond
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#06080f')
      bg.addColorStop(1, '#04060a')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Grille
      ctx.strokeStyle = 'rgba(255,255,255,0.028)'
      ctx.lineWidth = 1
      const gx = 46
      for (let x = 0; x < W; x += gx) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      const gy = 40
      for (let y = 0; y < H; y += gy) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // ---------- Bandeau de tickers défilant ----------
      ctx.font = '700 12.5px "Segoe UI", sans-serif'
      const itemW = (t) => 92 + ctx.measureText(t[0]).width + (t[2] >= 0 ? 58 : 52)
      tickerX.v -= 0.55
      const totalW = TICKERS.reduce((s, t) => s + itemW(t), 0)
      if (-tickerX.v > totalW) tickerX.v += totalW
      let tx = tickerX.v
      const bandH = 34
      ctx.fillStyle = 'rgba(8,11,18,0.55)'
      ctx.fillRect(0, 0, W, bandH)
      for (let pass = 0; pass < 2; pass++) {
        for (const [sym, px, chg] of TICKERS) {
          if (tx + itemW([sym, px, chg]) > 0 || tx < W) {
            const up = chg >= 0
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.fillText(sym, tx, 21)
            ctx.fillStyle = 'rgba(255,255,255,0.28)'
            ctx.font = '600 12.5px "Segoe UI", sans-serif'
            ctx.fillText(fmtPx(px), tx + 8 + ctx.measureText(sym).width, 21)
            ctx.fillStyle = up ? 'rgba(42,203,138,0.85)' : 'rgba(240,68,56,0.85)'
            ctx.fillText(`${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`, tx + 8 + ctx.measureText(sym).width + 8 + ctx.measureText(fmtPx(px)).width, 21)
            ctx.font = '700 12.5px "Segoe UI", sans-serif'
          }
          tx += itemW([sym, px, chg]) + 26
        }
      }

      // ---------- Carnet d'ordres (colonne gauche) ----------
      const bookX = 20
      const bookY = bandH + 16
      const rowH = 17
      ctx.font = '600 10.5px "Consolas", monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fillText('BID / ASK', bookX, bookY - 4)
      book.forEach((r, i) => {
        const y = bookY + 8 + i * rowH
        const flash = bookFlash[i] || 0
        const pxW = 64
        ctx.fillStyle = r.side === 'bid'
          ? `rgba(42,203,138,${0.16 + flash * 0.3})`
          : `rgba(240,68,56,${0.14 + flash * 0.28})`
        ctx.fillRect(bookX, y - 8, pxW, rowH - 2)
        ctx.fillStyle = r.side === 'bid' ? 'rgba(42,203,138,0.9)' : 'rgba(240,68,56,0.9)'
        ctx.fillText(fmtPx(r.px), bookX + 3, y)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fillText(String(r.sz).padStart(4, ' '), bookX + pxW + 6, y)
      })

      // ---------- Graphique en chandeliers ----------
      const chartX = 130
      const chartW = W - chartX - 30
      const chartTop = bandH + 28
      const chartH = Math.min(H * 0.44, 300)
      const chartBot = chartTop + chartH
      const nCandles = Math.max(20, Math.floor(chartW / 30))
      const step = chartW / nCandles
      const recent = hist.slice(-nCandles)
      const min = Math.min(...recent) * 0.995
      const max = Math.max(...recent) * 1.005
      const yOf = v => chartBot - ((v - min) / (max - min)) * chartH

      // Volume
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      recent.forEach((_, i) => {
        const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + volPhase * 0.3))
        const x = chartX + i * step + step * 0.22
        const h = 18 + v * 26
        const up = recent[i] >= (recent[i - 1] || recent[i])
        ctx.fillStyle = up ? 'rgba(42,203,138,0.14)' : 'rgba(240,68,56,0.14)'
        ctx.fillRect(x, chartBot + 4, step * 0.56, h)
      })

      // Ligne de fond
      ctx.strokeStyle = 'rgba(24,194,124,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      recent.forEach((v, i) => {
        const x = chartX + i * step + step / 2
        const y = yOf(v)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Chandeliers
      let lastClose = recent[recent.length - 1]
      recent.forEach((v, i) => {
        const prevV = recent[i - 1] || v
        const up = v >= prevV
        const o = Math.min(v, prevV)
        const c = Math.max(v, prevV)
        const wick = v * (0.001 + Math.abs(randn()) * 0.004)
        const hi = c + wick
        const lo = Math.max(min, o - wick)
        const x = chartX + i * step + step / 2
        ctx.strokeStyle = up ? 'rgba(42,203,138,0.9)' : 'rgba(240,68,56,0.9)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x, yOf(hi)); ctx.lineTo(x, yOf(lo)); ctx.stroke()
        ctx.fillStyle = up ? 'rgba(42,203,138,0.85)' : 'rgba(240,68,56,0.85)'
        ctx.fillRect(x - step * 0.22, yOf(c), step * 0.44, Math.max(1.5, yOf(o) - yOf(c)))
      })

      // Prix actuel + ligne pointillée
      const lastX = chartX + chartW - step / 2
      const lastY = yOf(lastClose)
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = 'rgba(24,194,124,0.35)'
      ctx.beginPath(); ctx.moveTo(chartX, lastY); ctx.lineTo(lastX, lastY); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(24,194,124,0.12)'
      ctx.beginPath(); ctx.arc(lastX, lastY, 3.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(42,203,138,0.95)'
      ctx.font = '700 11.5px "Consolas", monospace'
      ctx.fillText(fmtPx(lastClose), lastX - 66, lastY - 7)
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.font = '600 10.5px "Consolas", monospace'
      ctx.fillText('BRVM COMP', chartX, chartTop - 6)

      // ---------- Particules flottantes ----------
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      for (let i = 0; i < 26; i++) {
        const px = (Math.sin(i * 127.1 + volPhase) * 0.5 + 0.5) * W
        const py = ((Math.sin(i * 311.7 + volPhase * 2.1) * 0.5 + 0.5) * H)
        const up = Math.sin(i * 13.3 + volPhase * 3) > 0
        ctx.fillStyle = up ? 'rgba(42,203,138,0.05)' : 'rgba(240,68,56,0.05)'
        ctx.fillRect(px, py, 3, 3)
      }

      // Vignette basse pour la lisibilité
      const vg = ctx.createLinearGradient(0, 0, 0, H)
      vg.addColorStop(0, 'rgba(4,6,10,0.12)')
      vg.addColorStop(1, 'rgba(4,6,10,0.78)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, W, H)

      raf = requestAnimationFrame(draw)
    }

    resize()
    buildBook()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />
}

export default function AuthPage() {
  const router = useRouter()
  const { user, login, register, verifyMfa, sendResetCode, recovery, updatePassword, sendOtpEmail, verifyOtpEmail } = useAuth()
  const [lang, setLang] = useState('fr')
  const [step, setStep] = useState(STEPS.login)
  const [ready, setReady] = useState(false)
  const [verifyType, setVerifyType] = useState('email')

  // login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // register
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // codes
  const [code, setCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [factorId, setFactorId] = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNew, setConfirmNew] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  const rawNext = typeof router.query.next === 'string' ? router.query.next : '/'
  const next = (rawNext === '/' || rawNext === '/login' || rawNext.startsWith('/login?')) ? '/' : rawNext

  useEffect(() => {
    setLang(detectLang())
    const timer = setTimeout(() => setReady(true), 250)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (user && ready && !recovery) router.replace(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready, recovery])

  useEffect(() => {
    if (recovery) go(STEPS.reset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recovery])

  const go = (s) => { setStep(s); setError(null); setInfo(null); setCode('') }

  const submitLogin = async (e) => {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      const data = await login(email.trim(), password)
      if (data?.status === 'totp_required') {
        setFactorId(data.factorId)
        setChallengeId(data.challengeId)
        go(STEPS.login2fa)
      }
    } catch (err) {
      const msg = err?.message || err?.error_description || err?.code || err?.name || ''
      if (/otp|verif|confirm|unverified/i.test(msg)) {
        setVerifyType('email')
        setInfo(t(lang, 'authEmailSent'))
        setStep(STEPS.verifyEmail)
        // Compte non vérifié → envoie directement le code à 6 chiffres
        // (l'email Supabase de confirmation ne sert pas ici).
        sendOtpEmail(email.trim(), 'verify').catch((err) => setError(err?.message || err?.error_description || t(lang, 'authError')))
      } else {
        setError(msg || t(lang, 'authInvalid'))
      }
    } finally { setBusy(false) }
  }

  const submitRegister = async (e) => {
    e.preventDefault()
    setError(null); setInfo(null)
    if (password !== confirmPassword) {
      setError(t(lang, 'authPasswordsMismatch'))
      return
    }
    setBusy(true)
    try {
      const res = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        account_type: 'demo',
        broker_name: null,
        broker_account: null,
      })
      if (res?.status === 'ok') {
        router.replace(next)
        return
      }
      setVerifyType('signup')
      setInfo(t(lang, 'authEmailSent'))
      setStep(STEPS.verifyEmail)
      // Envoie immédiatement le code à 6 chiffres : le mail Supabase de
      // confirmation ne contient qu'un lien (sans code) — inutilisable ici.
      sendOtpEmail(email.trim(), 'verify').catch((err) => setError(err?.message || err?.error_description || t(lang, 'authError')))
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const resend = async () => {
    setBusy(true); setError(null); setInfo(null)
    try {
      await sendOtpEmail(email.trim(), verifyType)
      setCode('')
      setInfo(t(lang, 'authCodeSentAgain'))
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const submitOtp = async (value) => {
    const v = value || code
    if (v.length < 6) return
    setBusy(true); setError(null)
    try {
      await verifyOtpEmail(email.trim(), v)
      const data = await login(email.trim(), password)
      if (data?.status === 'totp_required') {
        setFactorId(data.factorId)
        setChallengeId(data.challengeId)
        go(STEPS.login2fa)
        return
      }
      router.replace(next)
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
      setCode('')
    } finally { setBusy(false) }
  }

  const submit2faLogin = async (value) => {
    const v = value || code
    if (v.length < 6 || !factorId || !challengeId) return
    setBusy(true); setError(null)
    try {
      await verifyMfa(factorId, challengeId, v)
      router.replace(next)
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
      setCode(''); setRecoveryInput('')
    } finally { setBusy(false) }
  }

  const submitRecoveryLogin = async (e) => {
    e.preventDefault()
    if (!recoveryInput.trim() || !factorId || !challengeId) return
    setBusy(true); setError(null)
    try {
      await verifyMfa(factorId, challengeId, recoveryInput.trim())
      router.replace(next)
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
      setRecoveryInput('')
    } finally { setBusy(false) }
  }

  const submitForgot = async (e) => {    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    try {
      await sendResetCode(email.trim())
      setInfo(t(lang, 'authResetSent'))
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const submitReset = async (e) => {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmNew) { setError(t(lang, 'authPasswordsMismatch')); return }
    setBusy(true)
    try {
      await updatePassword(newPassword)
      setInfo(t(lang, 'authResetSuccess'))
      setPassword(newPassword)
      setTimeout(() => {
        setNewPassword(''); setConfirmNew('')
        go(STEPS.login)
      }, 1600)
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const strength = passwordScore(password)
  const scoreTxt = t(lang, 'authPwdStrength')
  const strengthLabel = strength > 0 ? scoreTxt[strength - 1] : ''
  const scoreColor = ['#F04438', '#F04438', '#f59e0b', '#18C27C', '#18C27C', '#18C27C'][strength]

  const renderHeader = () => (
    <>
      <div className="auth-logo">
        <img src="/logo_blue.png" alt="Bluerock" className="auth-logo-img" />
      </div>
      <div className="auth-logo-name">BLUEROCK</div>
    </>
  )

  return (
    <div className="auth-shell">
      <StockMarketCanvas />
      <div className="bg-overlay" />

      <div className="auth-scroll">
        <div className="auth-card">
          {step !== STEPS.login && step !== STEPS.register && step !== STEPS.forgot && (
            <button className="back-btn" onClick={() => go(STEPS.login)}>
              <ArrowLeft size={16} /> {t(lang, 'authBackLogin')}
            </button>
          )}

          {renderHeader()}

          {/* ============ LOGIN ============ */}
          {step === STEPS.login && (
            <>
              <div className="mode-switch">
                <button className={`mode-btn ${'login' === 'login' ? 'active' : ''}`} onClick={() => go(STEPS.login)}>{t(lang, 'authLogin')}</button>
                <button className={`mode-btn ${false ? 'active' : ''}`} onClick={() => go(STEPS.register)}>{t(lang, 'authRegister')}</button>
              </div>
              <form onSubmit={submitLogin} className="auth-form">
                <div className="field">
                  <label className="field-label">{t(lang, 'authEmail')}</label>
                  <div className="input-wrap">
                    <Mail size={16} className="input-ico" />
                    <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoComplete="off" name="login-email" />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">{t(lang, 'authPassword')}</label>
                  <div className="input-wrap">
                    <Lock size={16} className="input-ico" />
                    <input className="auth-input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t(lang, 'authPassword')} required autoComplete="new-password" name="login-password" />
                    <button type="button" className="pwd-toggle" onClick={() => setShowPwd(v => !v)} aria-label="toggle">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="forgot-row">
                  <button type="button" className="forgot-link" onClick={() => go(STEPS.forgot)}>{t(lang, 'authForgot')}</button>
                </div>
                {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                <button className="auth-submit" disabled={busy}>
                  {busy ? <Spinner /> : <><span>{t(lang, 'authLogin')}</span><ChevronRight size={16} /></>}
                </button>
              </form>
            </>
          )}

          {/* ============ REGISTER ============ */}
          {step === STEPS.register && (
            <>
              <div className="mode-switch">
                <button className="mode-btn" onClick={() => go(STEPS.login)}>{t(lang, 'authLogin')}</button>
                <button className="mode-btn active" onClick={() => go(STEPS.register)}>{t(lang, 'authRegister')}</button>
              </div>
              <form onSubmit={submitRegister} className="auth-form">
                <div className="field">
                  <label className="field-label">{t(lang, 'authName')}</label>
                  <div className="input-wrap">
                    <UserRound size={16} className="input-ico" />
                    <input className="auth-input" value={name} onChange={e => setName(e.target.value)} placeholder={t(lang, 'authName')} required autoComplete="off" name="register-name" />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">{t(lang, 'authEmail')}</label>
                  <div className="input-wrap">
                    <Mail size={16} className="input-ico" />
                    <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoComplete="off" name="register-email" />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">{t(lang, 'authPassword')}</label>
                  <div className="input-wrap">
                    <Lock size={16} className="input-ico" />
                    <input className="auth-input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t(lang, 'authPassword')} required autoComplete="new-password" name="register-password" />
                    <button type="button" className="pwd-toggle" onClick={() => setShowPwd(v => !v)} aria-label="toggle">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {password && (
                  <div className="strength-box">
                    <div className="strength-bar"><div className="strength-fill" style={{ width: `${(strength / 5) * 100}%`, background: scoreColor }} /></div>
                    <div className="strength-label" style={{ color: scoreColor }}>{strengthLabel}</div>
                  </div>
                )}
                <div className="field">
                  <label className="field-label">{t(lang, 'authConfirmPassword')}</label>
                  <div className="input-wrap">
                    <Lock size={16} className="input-ico" />
                    <input className="auth-input" type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t(lang, 'authConfirmPassword')} required autoComplete="new-password" name="register-confirm" />
                    <button type="button" className="pwd-toggle" onClick={() => setShowConfirm(v => !v)} aria-label="toggle">
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {!password && <div className="pwd-policy">{t(lang, 'authPwdPolicy')}</div>}

                {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                <button className="auth-submit" disabled={busy}>
                  {busy ? <Spinner /> : <><span>{t(lang, 'authRegister')}</span><ChevronRight size={16} /></>}
                </button>
              </form>
              <div className="auth-note">{t(lang, 'authNote')}</div>
            </>
          )}

          {/* ============ VÉRIFICATION EMAIL / OTP ============ */}
          {step === STEPS.verifyEmail && (
            <div className="step-card">
              <div className="card-ico"><Mail size={22} color="#18C27C" /></div>
              <h2 className="card-title">{t(lang, 'authOtpTitle')}</h2>
              <p className="card-sub">{t(lang, 'authOtpSub')}</p>
              <div className="email-chip">{email}</div>
              <CodeInput value={code} onChange={setCode} onComplete={submitOtp} />
              {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
              {info && <div className="auth-info"><Check size={14} /> <span>{info}</span></div>}
              <button className="auth-submit" disabled={busy || code.length < 6} onClick={() => submitOtp()}>
                {busy ? <Spinner /> : <span>{t(lang, 'authOtpVerifyBtn')}</span>}
              </button>
              <button className="ghost-btn" disabled={busy} onClick={resend}>
                {busy ? <Spinner /> : <span>{t(lang, 'authResendCode')}</span>}
              </button>
              <p className="otp-hint">{t(lang, 'authOtpHint')}</p>
            </div>
          )}

          {/* ============ LOGIN 2FA ============ */}
          {step === STEPS.login2fa && (
            <div className="step-card">
              <div className="card-ico"><KeyRound size={22} color="#18C27C" /></div>
              <h2 className="card-title">{t(lang, 'auth2faTitle')}</h2>
              {!recoveryMode ? (
                <>
                  <p className="card-sub">{t(lang, 'auth2faLoginSub')}</p>
                  <CodeInput value={code} onChange={setCode} onComplete={submit2faLogin} />
                  {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                  <button className="auth-submit" disabled={busy || code.length < 6} onClick={() => submit2faLogin()}>
                    {busy ? <Spinner /> : <span>{t(lang, 'authLogin')}</span>}
                  </button>
                  <button className="ghost-btn" onClick={() => { setRecoveryMode(true); setError(null) }}>
                    {t(lang, 'auth2faRecoveryLogin')}
                  </button>
                </>
              ) : (
                <>
                  <p className="card-sub">{t(lang, 'auth2faRecoverySub')}</p>
                  <form onSubmit={submitRecoveryLogin} className="auth-form">
                    <div className="input-wrap">
                      <KeyRound size={16} className="input-ico" />
                      <input className="auth-input" value={recoveryInput} onChange={e => setRecoveryInput(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" autoFocus />
                    </div>
                    {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                    <button className="auth-submit" disabled={busy}>
                      {busy ? <Spinner /> : <span>{t(lang, 'auth2faRecoveryBtn')}</span>}
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => { setRecoveryMode(false); setError(null) }}>
                      {t(lang, 'auth2faBack')}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {/* ============ MOT DE PASSE OUBLIÉ ============ */}
          {step === STEPS.forgot && (
            <div className="step-card">
              <div className="card-ico"><Lock size={22} color="#18C27C" /></div>
              <h2 className="card-title">{t(lang, 'authForgotTitle')}</h2>
              <p className="card-sub">{t(lang, 'authForgotSub')}</p>
              <form onSubmit={submitForgot} className="auth-form">
                <div className="field">
                  <label className="field-label">{t(lang, 'authEmail')}</label>
                  <div className="input-wrap">
                    <Mail size={16} className="input-ico" />
                    <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoFocus />
                  </div>
                </div>
                {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                <button className="auth-submit" disabled={busy}>
                  {busy ? <Spinner /> : <span>{t(lang, 'authSendCode')}</span>}
                </button>
              </form>
            </div>
          )}

          {/* ============ RÉINITIALISATION ============ */}
          {step === STEPS.reset && (
            <div className="step-card">
              <div className="card-ico"><KeyRound size={22} color="#18C27C" /></div>
              <h2 className="card-title">{t(lang, 'authPasswordReset')}</h2>
              <p className="card-sub">{t(lang, 'authPasswordResetSub')}</p>
              {info && <div className="auth-info"><Check size={14} /> <span>{info}</span></div>}
              <form onSubmit={submitReset} className="auth-form">
                <div className="field">
                  <label className="field-label">{t(lang, 'authNewPassword')}</label>
                  <div className="input-wrap">
                    <Lock size={16} className="input-ico" />
                    <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t(lang, 'authNewPassword')} required autoComplete="new-password" />
                    <button type="button" className="pwd-toggle" onClick={() => setShowNew(v => !v)} aria-label="toggle">
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">{t(lang, 'authConfirmPassword')}</label>
                  <div className="input-wrap">
                    <Lock size={16} className="input-ico" />
                    <input className="auth-input" type={showConfirm ? 'text' : 'password'} value={confirmNew} onChange={e => setConfirmNew(e.target.value)} placeholder={t(lang, 'authConfirmPassword')} required autoComplete="new-password" />
                    <button type="button" className="pwd-toggle" onClick={() => setShowConfirm(v => !v)} aria-label="toggle">
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                <button className="auth-submit" disabled={busy}>
                  {busy ? <Spinner /> : <span>{t(lang, 'authResetBtn')}</span>}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .auth-shell {
          position: relative; min-height: 100vh; width: 100%;
          background: #05070c; color: #fff; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 24px 16px;
        }
        :global(.bg-canvas) { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .bg-overlay {
          position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(120% 80% at 50% 8%, rgba(24,194,124,0.09), transparent 55%),
            radial-gradient(90% 70% at 88% 95%, rgba(99,102,241,0.10), transparent 60%),
            linear-gradient(180deg, rgba(5,7,12,0.45), rgba(5,7,12,0.68));
        }
        .auth-scroll {
          position: relative; z-index: 2; width: 100%;
          flex: 0 0 auto;
          display: flex; justify-content: center;
          max-height: calc(100vh - 40px); overflow-y: auto;
          scrollbar-width: none;
        }
        .auth-scroll::-webkit-scrollbar { display: none; }
        .auth-card {
          width: 100%; max-width: 452px; margin: auto;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 28px; padding: 42px 40px 36px;
          box-shadow: none;
          display: flex; flex-direction: column; align-items: center;
        }
        .auth-logo { display: flex; align-items: center; justify-content: center; }
        .auth-logo-img {
          width: 72px; height: 72px; object-fit: contain;
          margin-bottom: 14px;
        }
        .auth-logo-name {
          font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2;
          background: linear-gradient(120deg, #5ba8ff 0%, #18C27C 100%);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
          margin-bottom: 26px;
        }
        @supports not (-webkit-background-clip: text) {
          .auth-logo-name { -webkit-text-fill-color: initial; background: none; color: #4d9fff; }
        }
        .green { color: #18C27C; }
        .mode-switch {
          display: flex; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 5px;
          width: 100%; margin-bottom: 24px;
        }
        .mode-btn {
          flex: 1; padding: 11px 0; border: none; border-radius: 12px;
          background: none; color: #9aa7ba; font-size: 15px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all 0.18s ease;
        }
        .mode-btn.active {
          background: linear-gradient(135deg, #18C27C, #0fa763); color: #04140c;
          box-shadow: 0 6px 18px rgba(24,194,124,0.3);
        }
        .auth-form {
          width: 100%;
          display: flex; flex-direction: column; gap: 16px;
        }
        .field { display: flex; flex-direction: column; gap: 7px; }
        .field-label { font-size: 12.5px; font-weight: 600; color: #c3ccd8; padding: 0 4px; }
        .field-opt { font-size: 11px; font-weight: 500; color: #66748a; margin-left: 4px; }
        .input-wrap { position: relative; display: flex; align-items: center; }
        .input-ico { position: absolute; left: 15px; color: #66748a; pointer-events: none; }
        .pwd-toggle {
          position: absolute; right: 11px; background: none; border: none;
          color: #7d8a9e; cursor: pointer; display: flex; padding: 6px;
        }
        .auth-input {
          height: 52px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.055); color: #F8F8FA; padding: 0 44px;
          font-size: 15px; font-weight: 500; font-family: inherit; outline: none; width: 100%;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .auth-input::placeholder { color: #5f6b7e; }
        .auth-input:focus {
          border-color: #18C27C;
          background: rgba(24,194,124,0.05);
          box-shadow: 0 0 0 4px rgba(24,194,124,0.13);
        }
        select.auth-input { appearance: none; background-image: linear-gradient(45deg, transparent 50%, #7d8a9e 50%), linear-gradient(135deg, #7d8a9e 50%, transparent 50%); background-position: calc(100% - 21px) 50%, calc(100% - 16px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
        .forgot-row { display: flex; justify-content: flex-end; }
        .forgot-link {
          background: none; border: none; color: #18C27C; font-size: 13.5px;
          cursor: pointer; font-family: inherit; font-weight: 600;
        }
        .auth-error {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.32);
          color: #ff8a8c; border-radius: 14px; padding: 11px 15px; font-size: 12.5px;
          line-height: 1.4;
        }
        .auth-divider {
          display: flex; align-items: center; gap: 12px;
          width: 100%; margin: 20px 0 2px;
        }
        .auth-divider::before, .auth-divider::after {
          content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.1);
        }
        .auth-divider span {
          font-size: 11.5px; font-weight: 600; color: #66748a;
          text-transform: uppercase; letter-spacing: 0.6px;
        }
        .google-btn {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          width: 100%; height: 52px; margin-top: 12px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px; color: #F8F8FA;
          font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .google-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
        .google-btn:active:not(:disabled) { background: rgba(255,255,255,0.07); }
        .google-btn:disabled { opacity: 0.55; cursor: default; }
        .auth-info {
          display: flex; align-items: center; gap: 8px;
          background: rgba(24,194,124,0.09); border: 1px solid rgba(24,194,124,0.32);
          color: #7ee2a4; border-radius: 14px; padding: 11px 15px; font-size: 12.5px;
        }
        .auth-submit {
          height: 52px; border: none; border-radius: 16px;
          background: linear-gradient(135deg, #18C27C, #0fa763); color: #04140c;
          font-size: 16px; font-weight: 700; letter-spacing: 0;
          cursor: pointer; font-family: inherit; margin-top: 6px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%;
          box-shadow: 0 10px 26px rgba(24,194,124,0.28);
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }
        .auth-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 32px rgba(24,194,124,0.38); }
        .auth-submit:active:not(:disabled) { transform: translateY(0); }
        .auth-submit:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
        .ghost-btn {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #b6c1d1;
          border-radius: 14px; padding: 12px 16px; font-size: 13.5px; font-weight: 600;
          cursor: pointer; font-family: inherit; margin-top: 10px;
          display: inline-flex; align-items: center; gap: 6px;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .ghost-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #fff; }
        .ghost-btn.copy { border-color: rgba(24,194,124,0.35); color: #18C27C; }
        .ghost-btn:disabled { opacity: 0.5; }
        .pwd-policy { font-size: 11.5px; color: #647087; line-height: 1.45; padding: 0 4px; }
        .strength-box { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
        .strength-bar { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .strength-fill { height: 100%; border-radius: 3px; transition: width 0.25s ease; }
        .strength-label { font-size: 11.5px; font-weight: 600; min-width: 64px; }
        .acct-type { display: flex; flex-direction: column; gap: 10px; }
        .acct-card {
          display: flex; align-items: center; gap: 13px;
          background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
          padding: 14px 16px; cursor: pointer; text-align: left; color: inherit; font-family: inherit;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .acct-card:hover { border-color: rgba(255,255,255,0.2); }
        .acct-card.active { border-color: #18C27C; background: rgba(24,194,124,0.08); }
        .acct-card.active .acct-label { color: #18C27C; }
        .acct-ico {
          width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .acct-ico.demo { color: #4ea8ff; background: rgba(78,168,255,0.12); }
        .acct-ico.real { color: #ffd166; background: rgba(255,209,102,0.12); }
        .acct-txt { display: flex; flex-direction: column; gap: 3px; }
        .acct-label { font-size: 15.5px; font-weight: 700; color: #F8F8FA; }
        .acct-desc { font-size: 13px; font-weight: 400; color: #93a1b5; }
        .broker-box { display: flex; flex-direction: column; gap: 10px; }
        .auth-note {
          margin-top: 18px; font-size: 11.5px; color: #647087; text-align: center;
          max-width: 340px; line-height: 1.45;
        }
        .back-btn {
          align-self: flex-start; background: none; border: 1px solid transparent; color: #93a1b5;
          display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; margin-bottom: 18px;
          padding: 7px 11px; border-radius: 11px; transition: all 0.15s ease;
        }
        .back-btn:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .step-card {
          width: 100%;
          display: flex; flex-direction: column; align-items: center;
          gap: 14px;
        }
        .card-ico {
          width: 54px; height: 54px; border-radius: 17px;
          background: rgba(24,194,124,0.1); border: 1px solid rgba(24,194,124,0.25);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 24px rgba(24,194,124,0.15);
        }
        .card-title { font-size: 20px; font-weight: 600; color: #F8F8FA; text-align: center; letter-spacing: 0; }
        .card-sub { font-size: 14px; font-weight: 400; color: #93a1b5; text-align: center; line-height: 1.5; max-width: 330px; }
        .email-chip {
          font-size: 12.5px; color: #18C27C; background: rgba(24,194,124,0.08);
          border: 1px solid rgba(24,194,124,0.25); padding: 6px 14px; border-radius: 14px;
          font-weight: 600; word-break: break-all; text-align: center;
        }
        .otp-hint { font-size: 11.5px; color: #647087; text-align: center; line-height: 1.45; margin-top: 2px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          .auth-card { padding: 32px 24px 28px; border-radius: 24px; }
          .auth-logo-img { width: 60px; height: 60px; }
          .auth-logo-name { font-size: 22px; }
        }
      `}</style>
    </div>
  )
}
