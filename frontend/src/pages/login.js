import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { getBrokers } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import { Shield, Wallet, Eye, EyeOff, KeyRound, Check, ArrowLeft, Lock, Mail, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react'

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
    </div>
  )
}

function Spinner() {
  return <Loader2 size={15} className="spin" />
}

export default function AuthPage() {
  const router = useRouter()
  const { user, login, register, verifyMfa, resendVerification, sendResetCode, recovery, updatePassword } = useAuth()
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
  const [factorId, setFactorId] = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNew, setConfirmNew] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

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
        setInfo(t(lang, 'authEmailSent'))
        setStep(STEPS.verifyEmail)
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
        account_type: accountType,
        broker_name: accountType === 'real' ? brokerName : null,
        broker_account: accountType === 'real' ? brokerAccount.trim() : null,
      })
      if (res?.status === 'ok') {
        router.replace(next)
        return
      }
      setInfo(t(lang, 'authEmailSent'))
      setStep(STEPS.verifyEmail)
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const resend = async () => {
    setBusy(true); setError(null); setInfo(null)
    try {
      await resendVerification(email.trim())
      setCode('')
      setInfo(t(lang, 'authCodeSentAgain'))
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
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

  const submitForgot = async (e) => {
    e.preventDefault()
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
  const isReal = accountType === 'real'

  const renderHeader = () => (
    <>
      <div className="auth-logo">
        <span className="auth-logo-mark">B</span>
        <span className="auth-logo-name">Blue<span className="green">Rock</span></span>
      </div>
      <div className="auth-badge">
        <Shield size={13} color="#18C27C" />
        <span>{t(lang, 'authSecurityBadge')}</span>
      </div>
      <div className="auth-badge-sub">{t(lang, 'authSecurityBadgeSub')}</div>
    </>
  )

  return (
    <div className="mobile-root">
      <div className="auth-area">
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
            <div className="card-ico"><Mail size={22} color="#18C27C" /></div>
            <h2 className="card-title">{t(lang, 'authEmailVerify')}</h2>
            <p className="card-sub">{t(lang, 'authEmailVerifySub')}</p>
            <div className="email-chip">{email}</div>
            {error && <div className="auth-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
            {info && <div className="auth-info"><Check size={14} /> <span>{info}</span></div>}
            <button className="ghost-btn" disabled={busy} onClick={resend}>
              {busy ? <Spinner /> : <span>{t(lang, 'authResendCode')}</span>}
            </button>
          </div>
        )}

        {/* ============ LOGIN 2FA ============ */}
        {step === STEPS.login2fa && (
          <div className="auth-card">
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
          <div className="auth-card">
            <div className="card-ico"><Lock size={22} color="#18C27C" /></div>
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
            <div className="card-ico"><KeyRound size={22} color="#18C27C" /></div>
            <h2 className="card-title">{t(lang, 'authPasswordReset')}</h2>
            <p className="card-sub">{t(lang, 'authPasswordResetSub')}</p>
            {info && <div className="auth-info"><Check size={14} /> <span>{info}</span></div>}
            <form onSubmit={submitReset} className="auth-form">
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
          background: #0E1627; color: #fff;
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
          background: linear-gradient(135deg, #18C27C, #00994a);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 20px; color: #00130a;
        }
        .auth-logo-name { font-size: 24px; font-weight: 700; color: #F8F8FA; letter-spacing: 0.25px; }
        .green { color: #18C27C; }
        .auth-badge {
          display: inline-flex; align-items: center; gap: 6px;
          margin-top: 16px; padding: 6px 12px; border-radius: 20px;
          background: rgba(24,194,124,0.08); border: 1px solid rgba(24,194,124,0.25);
          font-size: 11px; font-weight: 600; color: #18C27C;
        }
        .auth-badge-sub { font-size: 11px; color: #666; margin: 6px 0 20px; text-align: center; }
        .mode-switch {
          display: flex; background: #141414; border-radius: 14px; padding: 4px;
          width: 100%; max-width: 360px; margin-bottom: 18px;
        }
        .mode-btn {
          flex: 1; padding: 10px 0; border: none; border-radius: 11px;
          background: none; color: #A5ADBB; font-size: 17px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .mode-btn.active { background: #F8F8FA; color: #111111; }
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
          background: #141414; color: #F8F8FA; padding: 0 42px;
          font-size: 15px; font-weight: 500; font-family: inherit; outline: none; width: 100%;
        }
        .auth-input:focus { border-color: #18C27C; }
        .forgot-row { display: flex; justify-content: flex-end; }
        .forgot-link {
          background: none; border: none; color: #18C27C; font-size: 14px;
          cursor: pointer; font-family: inherit; font-weight: 500;
        }
        .auth-error {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.3);
          color: #ff8a8c; border-radius: 12px; padding: 10px 14px; font-size: 12.5px;
          line-height: 1.35;
        }
        .auth-info {
          display: flex; align-items: center; gap: 8px;
          background: rgba(24,194,124,0.08); border: 1px solid rgba(24,194,124,0.3);
          color: #7ee2a4; border-radius: 12px; padding: 10px 14px; font-size: 12.5px;
        }
        .auth-submit {
          height: 50px; border: none; border-radius: 14px;
          background: #18C27C; color: #00130a; font-size: 17px; font-weight: 600;
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
        .ghost-btn.copy { border-color: rgba(24,194,124,0.3); color: #18C27C; }
        .ghost-btn:disabled { opacity: 0.5; }
        .pwd-policy { font-size: 11px; color: #666; line-height: 1.35; padding: 0 4px; }
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
        .acct-card.active { border-color: #18C27C; background: rgba(24,194,124,0.06); }
        .acct-card.active .acct-label { color: #18C27C; }
        .acct-ico.demo { color: #4ea8ff; }
        .acct-ico.real { color: #ffd166; }
        .acct-txt { display: flex; flex-direction: column; gap: 2px; }
        .acct-label { font-size: 16px; font-weight: 600; color: #F8F8FA; }
        .acct-desc { font-size: 14px; font-weight: 400; color: #9AA3B2; }
        .broker-box { display: flex; flex-direction: column; gap: 8px; }
        .auth-note {
          margin-top: 16px; font-size: 11px; color: #666; text-align: center;
          max-width: 340px; line-height: 1.35;
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
          background: rgba(24,194,124,0.08); border: 1px solid rgba(24,194,124,0.2);
          display: flex; align-items: center; justify-content: center;
        }
        .card-title { font-size: 18px; font-weight: 700; color: #F8F8FA; text-align: center; }
        .card-sub { font-size: 14px; font-weight: 400; color: #9AA3B2; text-align: center; line-height: 1.35; }
        .email-chip {
          font-size: 12px; color: #18C27C; background: rgba(24,194,124,0.06);
          border: 1px solid rgba(24,194,124,0.2); padding: 4px 12px; border-radius: 12px;
        }
        .code-row { display: flex; gap: 8px; justify-content: center; width: 100%; }
        .code-cell {
          width: 44px; height: 52px; border-radius: 12px;
          background: #141414; border: 1px solid #2a2a2a; color: #fff;
          text-align: center; font-size: 20px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          outline: none;
        }
        .code-cell:focus { border-color: #18C27C; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
