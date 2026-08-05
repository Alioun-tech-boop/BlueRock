import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../lib/auth'
import { getBrokers, verifyEmail, resendVerification, login2fa, setup2fa, enable2fa, forgotPassword, resetPassword } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import { Shield, Wallet, Eye, EyeOff, KeyRound, ScanLine, Copy, Check, ArrowLeft, Lock, Mail, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react'

const STEPS = {
  login: 'login',
  register: 'register',
  verifyEmail: 'verifyEmail',
  login2fa: 'login2fa',
  setup2fa: 'setup2fa',
  recoveryCodes: 'recoveryCodes',
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

function extractDetail(err) {
  const d = err?.response?.data?.detail
  if (typeof d === 'string') return d
  if (d && typeof d === 'object') return { error: d.error, message: d.message }
  return null
}

function CodeInput({ value, onChange, onComplete, length = 6, autoFocus }) {
  const refs = useRef([])
  const digits = Array.from({ length }, (_, i) => value[i] || '')
  const handle = (i, raw) => {
    const ch = raw.replace(/\D/g, '').slice(-1)
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
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
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
    </div>
  )
}

function Spinner() {
  return <Loader2 size={15} className="spin" />
}

export default function AuthPage() {
  const router = useRouter()
  const { user, login, register, completeLogin } = useAuth()
  const [lang, setLang] = useState('fr')
  const [step, setStep] = useState(STEPS.login)
  const [ready, setReady] = useState(false)

  // login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // register
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accountType, setAccountType] = useState('demo')
  const [brokers, setBrokers] = useState([])
  const [brokerName, setBrokerName] = useState('')
  const [brokerAccount, setBrokerAccount] = useState('')

  // codes
  const [code, setCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [tempToken, setTempToken] = useState(null)
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNew, setConfirmNew] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // 2FA setup
  const [setupData, setSetupData] = useState(null)
  const [setupCode, setSetupCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState([])
  const [copied, setCopied] = useState(false)

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  const next = typeof router.query.next === 'string' ? router.query.next : '/'

  useEffect(() => {
    setLang(detectLang())
    getBrokers().then(r => setBrokers(r.data.brokers || [])).catch(() => {})
    const timer = setTimeout(() => setReady(true), 250)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (user && step === STEPS.login) router.replace(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready])

  const go = (s) => { setStep(s); setError(null); setInfo(null); setCode(''); setSetupCode('') }

  const submitLogin = async (e) => {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      const data = await login(email.trim(), password)
      if (data?.status === 'totp_required') {
        setTempToken(data.temp_token)
        go(STEPS.login2fa)
      }
    } catch (err) {
      const d = extractDetail(err)
      if (d?.error === 'email_not_verified') {
        setInfo(d.message || t(lang, 'authEmailSent'))
        setStep(STEPS.verifyEmail)
      } else if (err?.response?.status === 423) {
        setError(t(lang, 'authAccountLocked'))
      } else if (err?.response?.status === 429) {
        setError(d || t(lang, 'authError'))
      } else {
        setError(typeof d === 'string' ? d : t(lang, 'authInvalid'))
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
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        account_type: accountType,
        broker_name: accountType === 'real' ? brokerName : null,
        broker_account: accountType === 'real' ? brokerAccount.trim() : null,
      })
      setInfo(t(lang, 'authEmailSent'))
      setStep(STEPS.verifyEmail)
    } catch (err) {
      const d = extractDetail(err)
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const submitVerify = async (value) => {
    if ((value || code).length < 6) return
    setBusy(true); setError(null)
    try {
      await verifyEmail(email.trim(), value || code)
      setInfo(null)
      setStep(STEPS.setup2fa)
      startSetup()
    } catch (err) {
      const d = extractDetail(err)
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const resend = async () => {
    setBusy(true); setError(null); setInfo(null)
    try {
      await resendVerification(email.trim())
      setCode('')
      setInfo(t(lang, 'authCodeSentAgain'))
    } catch (err) {
      const d = extractDetail(err)
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const startSetup = async () => {
    try {
      const r = await setup2fa()
      setSetupData(r.data)
    } catch (err) {
      const d = extractDetail(err)
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    }
  }

  const submit2faSetup = async (value) => {
    const v = value || setupCode
    if (v.length < 6) return
    setBusy(true); setError(null)
    try {
      const r = await enable2fa(v)
      setRecoveryCodes(r.data.recovery_codes || [])
      setStep(STEPS.recoveryCodes)
    } catch (err) {
      const d = extractDetail(err)
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const submit2faLogin = async (value) => {
    const v = value || code
    if (v.length < 6 || !tempToken) return
    setBusy(true); setError(null)
    try {
      const r = await login2fa(tempToken, v)
      completeLogin(r.data)
      router.replace(next)
    } catch (err) {
      const d = extractDetail(err)
      if (err?.response?.status === 423) setError(t(lang, 'authAccountLocked'))
      else setError(typeof d === 'string' ? d : t(lang, 'authError'))
      setCode(''); setRecoveryInput('')
    } finally { setBusy(false) }
  }

  const submitRecoveryLogin = async (e) => {
    e.preventDefault()
    if (!recoveryInput.trim() || !tempToken) return
    setBusy(true); setError(null)
    try {
      const r = await login2fa(tempToken, recoveryInput.trim())
      completeLogin(r.data)
      router.replace(next)
    } catch (err) {
      const d = extractDetail(err)
      if (err?.response?.status === 423) setError(t(lang, 'authAccountLocked'))
      else setError(typeof d === 'string' ? d : t(lang, 'authError'))
      setRecoveryInput('')
    } finally { setBusy(false) }
  }

  const submitForgot = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    try {
      await forgotPassword(email.trim())
      setInfo(t(lang, 'authResetSent'))
      setStep(STEPS.reset)
    } catch (err) {
      const d = extractDetail(err)
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const submitReset = async (e) => {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmNew) { setError(t(lang, 'authPasswordsMismatch')); return }
    setBusy(true)
    try {
      await resetPassword(email.trim(), resetCode.trim(), newPassword)
      setInfo(t(lang, 'authResetSuccess'))
      setPassword(newPassword)
      setTimeout(() => {
        setNewPassword(''); setConfirmNew(''); setResetCode('')
        go(STEPS.login)
      }, 1600)
    } catch (err) {
      const d = extractDetail(err)
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const copyCodes = () => {
    const txt = recoveryCodes.join('\n')
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
    else {
      const ta = document.createElement('textarea')
      ta.value = txt
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const strength = passwordScore(password)
  const scoreTxt = t(lang, 'authPwdStrength')
  const strengthLabel = strength > 0 ? scoreTxt[strength - 1] : ''
  const scoreColor = ['#FF4D4F', '#FF4D4F', '#f59e0b', '#00C853', '#00C853', '#00C853'][strength]
  const isReal = accountType === 'real'

  const renderHeader = () => (
    <>
      <div className="auth-logo">
        <span className="auth-logo-mark">B</span>
        <span className="auth-logo-name">Blue<span className="green">Rock</span></span>
      </div>
      <div className="auth-badge">
        <Shield size={13} color="#00C853" />
        <span>{t(lang, 'authSecurityBadge')}</span>
      </div>
      <div className="auth-badge-sub">{t(lang, 'authSecurityBadgeSub')}</div>
    </>
  )

  return (
    <div className="mobile-root">
      <div className="auth-area">
        {step !== STEPS.login && step !== STEPS.register && step !== STEPS.forgot && (
          <button className="back-btn" onClick={() => go(step === STEPS.reset ? STEPS.forgot : STEPS.login)}>
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
              <div className="input-wrap">
                <Mail size={16} className="input-ico" />
                <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoComplete="email" />
              </div>
              <div className="input-wrap">
                <Lock size={16} className="input-ico" />
                <input className="auth-input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t(lang, 'authPassword')} required autoComplete="current-password" />
                <button type="button" className="pwd-toggle" onClick={() => setShowPwd(v => !v)} aria-label="toggle">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
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
              <div className="input-wrap">
                <Mail size={16} className="input-ico" />
                <input className="auth-input" value={name} onChange={e => setName(e.target.value)} placeholder={t(lang, 'authName')} required autoComplete="name" />
              </div>
              <div className="input-wrap">
                <Mail size={16} className="input-ico" />
                <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoComplete="email" />
              </div>
              <div className="input-wrap">
                <Lock size={16} className="input-ico" />
                <input className="auth-input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t(lang, 'authPassword')} required autoComplete="new-password" />
                <button type="button" className="pwd-toggle" onClick={() => setShowPwd(v => !v)} aria-label="toggle">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {password && (
                <div className="strength-box">
                  <div className="strength-bar"><div className="strength-fill" style={{ width: `${(strength / 5) * 100}%`, background: scoreColor }} /></div>
                  <div className="strength-label" style={{ color: scoreColor }}>{strengthLabel}</div>
                </div>
              )}
              <div className="input-wrap">
                <Lock size={16} className="input-ico" />
                <input className="auth-input" type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t(lang, 'authConfirmPassword')} required autoComplete="new-password" />
                <button type="button" className="pwd-toggle" onClick={() => setShowConfirm(v => !v)} aria-label="toggle">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {!password && <div className="pwd-policy">{t(lang, 'authPwdPolicy')}</div>}

              <div className="acct-type">
                <button type="button" className={`acct-card ${!isReal ? 'active' : ''}`} onClick={() => setAccountType('demo')}>
                  <Shield size={18} className="acct-ico demo" />
                  <div className="acct-txt">
                    <span className="acct-label">{t(lang, 'authDemo')}</span>
                    <span className="acct-desc">{t(lang, 'authDemoDesc')}</span>
                  </div>
                </button>
                <button type="button" className={`acct-card ${isReal ? 'active' : ''}`} onClick={() => setAccountType('real')}>
                  <Wallet size={18} className="acct-ico real" />
                  <div className="acct-txt">
                    <span className="acct-label">{t(lang, 'authReal')}</span>
                    <span className="acct-desc">{t(lang, 'authRealDesc')}</span>
                  </div>
                </button>
              </div>

              {isReal && (
                <div className="broker-box">
                  <select className="auth-input" value={brokerName} onChange={e => setBrokerName(e.target.value)}>
                    <option value="">{t(lang, 'authSelectBroker')}</option>
                    {Object.entries(brokers).map(([country, cats]) => {
                      const names = [...(cats.SGI || []), ...(cats.SGO || [])]
                      if (!names.length) return null
                      return (
                        <optgroup key={country} label={country}>
                          {names.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                        </optgroup>
                      )
                    })}
                  </select>
                  <input className="auth-input" value={brokerAccount} onChange={e => setBrokerAccount(e.target.value)} placeholder={t(lang, 'authBrokerAccount')} />
                </div>
              )}

              {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
              <button className="auth-submit" disabled={busy}>
                {busy ? <Spinner /> : <><span>{t(lang, 'authRegister')}</span><ChevronRight size={16} /></>}
              </button>
            </form>
            <div className="auth-note">{t(lang, 'authNote')}</div>
          </>
        )}

        {/* ============ VÉRIFICATION EMAIL ============ */}
        {step === STEPS.verifyEmail && (
          <div className="auth-card">
            <div className="card-ico"><Mail size={22} color="#00C853" /></div>
            <h2 className="card-title">{t(lang, 'authEmailVerify')}</h2>
            <p className="card-sub">{t(lang, 'authEmailVerifySub')}</p>
            <div className="email-chip">{email}</div>
            <CodeInput value={code} onChange={setCode} onComplete={submitVerify} />
            {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
            {info && <div className="auth-info"><Check size={14} /> <span>{info}</span></div>}
            <button className="auth-submit" disabled={busy || code.length < 6} onClick={() => submitVerify()}>
              {busy ? <Spinner /> : <span>{t(lang, 'authVerifyBtn')}</span>}
            </button>
            <button className="ghost-btn" disabled={busy} onClick={resend}>
              {t(lang, 'authResendCode')}
            </button>
          </div>
        )}

        {/* ============ LOGIN 2FA ============ */}
        {step === STEPS.login2fa && (
          <div className="auth-card">
            <div className="card-ico"><KeyRound size={22} color="#00C853" /></div>
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

        {/* ============ 2FA SETUP (QR) ============ */}
        {step === STEPS.setup2fa && (
          <div className="auth-card">
            <div className="card-ico"><ScanLine size={22} color="#00C853" /></div>
            <h2 className="card-title">{t(lang, 'auth2faSetupTitle')}</h2>
            <p className="card-sub">{t(lang, 'auth2faSetupSub')}</p>
            {setupData ? (
              <>
                <div className="qr-box">
                  <QRCodeSVG value={setupData.provisioning_uri} size={172} bgColor="#000000" fgColor="#ffffff" level="M" />
                </div>
                <div className="secret-box">
                  <span className="secret-label">{t(lang, 'auth2faSecret')}</span>
                  <div className="secret-value">{setupData.secret.match(/.{1,4}/g)?.join(' ')}</div>
                </div>
                <CodeInput value={setupCode} onChange={setSetupCode} onComplete={submit2faSetup} />
                {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                <button className="auth-submit" disabled={busy || setupCode.length < 6} onClick={() => submit2faSetup()}>
                  {busy ? <Spinner /> : <span>{t(lang, 'auth2faEnable')}</span>}
                </button>
              </>
            ) : (
              <div className="loading-inline"><Spinner /> <span>{t(lang, 'loading')}</span></div>
            )}
          </div>
        )}

        {/* ============ CODES DE SECOURS ============ */}
        {step === STEPS.recoveryCodes && (
          <div className="auth-card">
            <div className="card-ico"><Shield size={22} color="#00C853" /></div>
            <h2 className="card-title">{t(lang, 'auth2faEnabled')}</h2>
            <p className="card-sub">{t(lang, 'auth2faEnabledSub')}</p>
            <div className="codes-grid">
              {recoveryCodes.map((c, i) => (
                <div key={i} className="code-chip">{c}</div>
              ))}
            </div>
            <button className="ghost-btn copy" onClick={copyCodes}>
              {copied ? <Check size={14} color="#00C853" /> : <Copy size={14} />} <span>{t(lang, 'auth2faCopied')}</span>
            </button>
            <button className="auth-submit" onClick={() => { completeLogin({ ...user, totp_enabled: true }); router.replace(next) }}>
              <span>{t(lang, 'auth2faNow')}</span>
            </button>
            <button className="ghost-btn" onClick={() => router.replace(next)}>
              {t(lang, 'auth2faLater')}
            </button>
          </div>
        )}

        {/* ============ MOT DE PASSE OUBLIÉ ============ */}
        {step === STEPS.forgot && (
          <div className="auth-card">
            <div className="card-ico"><Lock size={22} color="#00C853" /></div>
            <h2 className="card-title">{t(lang, 'authForgotTitle')}</h2>
            <p className="card-sub">{t(lang, 'authForgotSub')}</p>
            <form onSubmit={submitForgot} className="auth-form">
              <div className="input-wrap">
                <Mail size={16} className="input-ico" />
                <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoFocus />
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
          <div className="auth-card">
            <div className="card-ico"><KeyRound size={22} color="#00C853" /></div>
            <h2 className="card-title">{t(lang, 'authPasswordReset')}</h2>
            <p className="card-sub">{t(lang, 'authPasswordResetSub')}</p>
            {info && <div className="auth-info"><Check size={14} /> <span>{info}</span></div>}
            <form onSubmit={submitReset} className="auth-form">
              <CodeInput value={resetCode} onChange={setResetCode} />
              <div className="input-wrap">
                <Lock size={16} className="input-ico" />
                <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t(lang, 'authNewPassword')} required autoComplete="new-password" />
                <button type="button" className="pwd-toggle" onClick={() => setShowNew(v => !v)} aria-label="toggle">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="input-wrap">
                <Lock size={16} className="input-ico" />
                <input className="auth-input" type={showConfirm ? 'text' : 'password'} value={confirmNew} onChange={e => setConfirmNew(e.target.value)} placeholder={t(lang, 'authConfirmPassword')} required autoComplete="new-password" />
                <button type="button" className="pwd-toggle" onClick={() => setShowConfirm(v => !v)} aria-label="toggle">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
              <button className="auth-submit" disabled={busy}>
                {busy ? <Spinner /> : <span>{t(lang, 'authResetBtn')}</span>}
              </button>
            </form>
          </div>
        )}
      </div>
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .auth-area {
          flex: 1; min-height: 0; overflow-y: auto; padding: 36px 22px 28px;
          display: flex; flex-direction: column; align-items: center;
          max-width: 480px; width: 100%; margin: 0 auto;
        }
        .auth-area::-webkit-scrollbar { display: none; }
        .auth-logo { display: flex; align-items: center; gap: 10px; }
        .auth-logo-mark {
          width: 38px; height: 38px; border-radius: 12px;
          background: linear-gradient(135deg, #00C853, #00994a);
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 20px; color: #00130a;
        }
        .auth-logo-name { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .green { color: #00C853; }
        .auth-badge {
          display: inline-flex; align-items: center; gap: 6px;
          margin-top: 16px; padding: 6px 12px; border-radius: 20px;
          background: rgba(0,200,83,0.08); border: 1px solid rgba(0,200,83,0.25);
          font-size: 11px; font-weight: 600; color: #00C853;
        }
        .auth-badge-sub { font-size: 11px; color: #666; margin: 6px 0 20px; text-align: center; }
        .mode-switch {
          display: flex; background: #141414; border-radius: 14px; padding: 4px;
          width: 100%; max-width: 360px; margin-bottom: 18px;
        }
        .mode-btn {
          flex: 1; padding: 10px 0; border: none; border-radius: 11px;
          background: none; color: #888; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .mode-btn.active { background: #00C853; color: #00130a; }
        .auth-form {
          width: 100%; max-width: 360px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .input-wrap { position: relative; display: flex; align-items: center; }
        .input-ico { position: absolute; left: 14px; color: #555; pointer-events: none; }
        .pwd-toggle {
          position: absolute; right: 10px; background: none; border: none;
          color: #777; cursor: pointer; display: flex; padding: 6px;
        }
        .auth-input {
          height: 48px; border-radius: 14px; border: 1px solid #262626;
          background: #141414; color: #fff; padding: 0 42px;
          font-size: 15px; font-family: inherit; outline: none; width: 100%;
        }
        .auth-input:focus { border-color: #00C853; }
        .forgot-row { display: flex; justify-content: flex-end; }
        .forgot-link {
          background: none; border: none; color: #00C853; font-size: 12.5px;
          cursor: pointer; font-family: inherit; font-weight: 500;
        }
        .auth-error {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          color: #ff8a8c; border-radius: 12px; padding: 10px 14px; font-size: 12.5px;
          line-height: 1.5;
        }
        .auth-info {
          display: flex; align-items: center; gap: 8px;
          background: rgba(0,200,83,0.08); border: 1px solid rgba(0,200,83,0.3);
          color: #7ee2a4; border-radius: 12px; padding: 10px 14px; font-size: 12.5px;
        }
        .auth-submit {
          height: 50px; border: none; border-radius: 14px;
          background: #00C853; color: #00130a; font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: inherit; margin-top: 4px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; max-width: 360px;
        }
        .auth-submit:disabled { opacity: 0.5; cursor: default; }
        .ghost-btn {
          background: none; border: 1px solid #2a2a2a; color: #aaa;
          border-radius: 12px; padding: 10px 14px; font-size: 13px;
          cursor: pointer; font-family: inherit; margin-top: 8px;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .ghost-btn.copy { border-color: rgba(0,200,83,0.3); color: #00C853; }
        .ghost-btn:disabled { opacity: 0.5; }
        .pwd-policy { font-size: 11px; color: #666; line-height: 1.5; padding: 0 4px; }
        .strength-box { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
        .strength-bar { flex: 1; height: 4px; border-radius: 2px; background: #1c1c1c; overflow: hidden; }
        .strength-fill { height: 100%; border-radius: 2px; transition: width 0.25s ease; }
        .strength-label { font-size: 11px; font-weight: 600; min-width: 64px; }
        .acct-type { display: flex; flex-direction: column; gap: 8px; }
        .acct-card {
          display: flex; align-items: center; gap: 12px;
          background: #141414; border: 1px solid #262626; border-radius: 14px;
          padding: 12px 14px; cursor: pointer; text-align: left; color: inherit; font-family: inherit;
        }
        .acct-card.active { border-color: #00C853; background: rgba(0,200,83,0.06); }
        .acct-card.active .acct-label { color: #00C853; }
        .acct-ico.demo { color: #4ea8ff; }
        .acct-ico.real { color: #ffd166; }
        .acct-txt { display: flex; flex-direction: column; gap: 2px; }
        .acct-label { font-size: 14px; font-weight: 700; }
        .acct-desc { font-size: 11px; color: #8f8f8f; }
        .broker-box { display: flex; flex-direction: column; gap: 8px; }
        .auth-note {
          margin-top: 16px; font-size: 11px; color: #666; text-align: center;
          max-width: 340px; line-height: 1.5;
        }
        .back-btn {
          align-self: flex-start; background: none; border: none; color: #888;
          display: flex; align-items: center; gap: 6px; font-size: 13px;
          cursor: pointer; font-family: inherit; margin-bottom: 14px;
          padding: 4px 8px; border-radius: 10px;
        }
        .back-btn:hover { background: #141414; color: #fff; }
        .auth-card {
          width: 100%; max-width: 360px;
          display: flex; flex-direction: column; align-items: center;
          gap: 10px; padding: 26px 20px;
          background: #0d0d0d; border: 1px solid #1f1f1f; border-radius: 20px;
        }
        .card-ico {
          width: 48px; height: 48px; border-radius: 14px;
          background: rgba(0,200,83,0.08); border: 1px solid rgba(0,200,83,0.2);
          display: flex; align-items: center; justify-content: center;
        }
        .card-title { font-size: 18px; font-weight: 700; text-align: center; }
        .card-sub { font-size: 12.5px; color: #8f8f8f; text-align: center; line-height: 1.6; }
        .email-chip {
          font-size: 12px; color: #00C853; background: rgba(0,200,83,0.06);
          border: 1px solid rgba(0,200,83,0.2); padding: 4px 12px; border-radius: 12px;
        }
        .code-row { display: flex; gap: 8px; justify-content: center; width: 100%; }
        .code-cell {
          width: 44px; height: 52px; border-radius: 12px;
          background: #141414; border: 1px solid #2a2a2a; color: #fff;
          text-align: center; font-size: 20px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
          outline: none;
        }
        .code-cell:focus { border-color: #00C853; }
        .qr-box {
          padding: 14px; background: #141414; border: 1px solid #262626;
          border-radius: 16px; margin: 6px 0;
        }
        .secret-box { text-align: center; margin-bottom: 4px; }
        .secret-label { font-size: 10.5px; color: #666; }
        .secret-value {
          font-size: 12.5px; font-family: 'JetBrains Mono', monospace; color: #bbb;
          letter-spacing: 2px; margin-top: 4px;
        }
        .codes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; margin: 6px 0; }
        .code-chip {
          background: #141414; border: 1px solid #262626; border-radius: 10px;
          padding: 9px 6px; text-align: center; font-family: 'JetBrains Mono', monospace;
          font-size: 12px; font-weight: 600; letter-spacing: 1px; color: #e8e8e8;
        }
        .loading-inline {
          display: flex; align-items: center; gap: 8px; color: #888; font-size: 13px; padding: 20px 0;
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
