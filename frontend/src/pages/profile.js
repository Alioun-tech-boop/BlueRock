import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { updateMe, getCommunityMe } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import BottomNav from '../components/BottomNav'
import {
  ArrowLeft, UserRound, Shield, Mail, Check, LogOut, Eye, EyeOff,
  KeyRound, Loader2, Copy, Lock, Wallet, BadgeCheck, X, AtSign, Rocket, Users,
} from 'lucide-react'

const AVATARS = ['🦁', '🐘', '🐆', '🦓', '🦅', '🐬', '🌴', '🔥', '⚡', '💎', '🐊', '🦜', '🐢', '🦩', '🪙', '📈']

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

function Spinner() {
  return <Loader2 size={15} className="spin" />
}

function errMsg(err, fallback) {
  return err?.message || err?.error_description || fallback
}

const STRENGTH_COLORS = ['#ff4d4f', '#ff8c42', '#ffd166', '#a6e22e', '#00C853']

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading, logout, updateUser, refreshProfile, resendVerification } = useAuth()
  const [lang, setLang] = useState('fr')

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)

  const [resendBusy, setResendBusy] = useState(false)

  // 2FA activation
  const [setupData, setSetupData] = useState(null)
  const [setupCode, setSetupCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState([])
  const [copied, setCopied] = useState(false)
  // 2FA désactivation
  const [disableOpen, setDisableOpen] = useState(false)

  // mot de passe
  const [curPwd, setCurPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwdBusy, setPwdBusy] = useState(false)

  // e-mail de connexion
  const [newEmail, setNewEmail] = useState('')
  const [emailPwd, setEmailPwd] = useState('')
  const [showEmailPwd, setShowEmailPwd] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)

  // communauté
  const [community, setCommunity] = useState(null)
  const [communityPosts, setCommunityPosts] = useState([])

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  useEffect(() => setLang(detectLang()), [])

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent('/profile')}`)
      return
    }
    setName(user.name || '')
    setAvatar(user.avatar || '')
    getCommunityMe()
      .then(r => { setCommunity(r.data.user || null); setCommunityPosts(r.data.posts || []) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  const banner = (err, inf) => { setError(err); setInfo(inf) }
  const refetchMe = () => refreshProfile().catch(() => {})

  const submitProfile = async (e) => {
    e.preventDefault()
    setSaveBusy(true); banner(null, null)
    try {
      const r = await updateMe({ name: name.trim(), avatar })
      updateUser(r.data)
      banner(null, t(lang, 'pfSaved'))
    } catch (err) {
      banner(errMsg(err, t(lang, 'authError')), null)
    } finally {
      setSaveBusy(false)
    }
  }

  const sendCode = async () => {
    setResendBusy(true); banner(null, null)
    try {
      await resendVerification(user.email)
      banner(null, t(lang, 'pfCodeSent'))
    } catch (err) {
      banner(errMsg(err, t(lang, 'authError')), null)
    } finally {
      setResendBusy(false)
    }
  }

  const startSetup = async () => {
    banner(null, null)
    try {
      const { data: enroll, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error || !enroll) throw error || new Error(t(lang, 'authError'))
      setSetupData({
        provisioning_uri: enroll.totp.uri || enroll.totp.qr_code,
        secret: enroll.totp.secret,
        factorId: enroll.id,
      })
      setSetupCode('')
    } catch (err) {
      banner(errMsg(err, t(lang, 'authError')), null)
    }
  }

  const confirmSetup = async (code) => {
    setSaveBusy(true); banner(null, null)
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: setupData.factorId })
      if (ch.error) throw ch.error
      const vr = await supabase.auth.mfa.verify({ factorId: setupData.factorId, challengeId: ch.data.id, code: code.replace(/\s/g, '') })
      if (vr.error) throw vr.error
      const rc = await supabase.auth.mfa.generateRecoveryCodes()
      if (rc.error) throw rc.error
      setRecoveryCodes(rc.data?.codes || [])
      setSetupData(null)
      await refetchMe()
    } catch (err) {
      banner(errMsg(err, t(lang, 'authError')), null)
    } finally {
      setSaveBusy(false)
    }
  }

  const closeRecovery = () => {
    setRecoveryCodes([])
    setCopied(false)
  }

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = recoveryCodes.join('\n')
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const confirmDisable = async () => {
    setSaveBusy(true); banner(null, null)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.all?.find(f => f.type === 'totp' && f.status === 'verified')
      if (!totp) throw new Error(t(lang, 'authError'))
      const un = await supabase.auth.mfa.unenroll({ factorId: totp.id })
      if (un.error) throw un.error
      setDisableOpen(false)
      setDisableCode('')
      await refetchMe()
      banner(null, t(lang, 'pf2faDisabledOk'))
    } catch (err) {
      banner(errMsg(err, t(lang, 'authError')), null)
    } finally {
      setSaveBusy(false)
    }
  }

  const submitPwd = async (e) => {
    e.preventDefault()
    if (newPwd !== confirmPwd) {
      banner(t(lang, 'authPasswordsMismatch'), null)
      return
    }
    setPwdBusy(true); banner(null, null)
    try {
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: curPwd })
      if (check.error) throw check.error
      const upd = await supabase.auth.updateUser({ password: newPwd })
      if (upd.error) throw upd.error
      setCurPwd(''); setNewPwd(''); setConfirmPwd('')
      banner(null, t(lang, 'pfPwdChanged'))
    } catch (err) {
      banner(errMsg(err, t(lang, 'authError')), null)
    } finally {
      setPwdBusy(false)
    }
  }

  const submitEmail = async (e) => {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      banner(t(lang, 'pfEmailInvalid'), null)
      return
    }
    if (email === (user.email || '').toLowerCase()) {
      setNewEmail('')
      setEmailPwd('')
      banner(null, null)
      return
    }
    setEmailBusy(true); banner(null, null)
    try {
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: emailPwd })
      if (check.error) throw check.error
      const upd = await supabase.auth.updateUser({ email })
      if (upd.error) throw upd.error
      await updateMe({ email }).catch(() => {})
      updateUser({ email })
      setNewEmail('')
      setEmailPwd('')
      banner(null, t(lang, 'pfEmailChanged').replace('{email}', email))
    } catch (err) {
      const msg = errMsg(err, '')
      if (/invalid.*credential|wrong password|incorrect/i.test(msg)) banner(t(lang, 'pfPwdWrong'), null)
      else if (/already been registered|duplicate|déjà utilisé|exists/i.test(msg)) banner(t(lang, 'pfEmailExists'), null)
      else banner(errMsg(err, t(lang, 'authError')), null)
    } finally {
      setEmailBusy(false)
    }
  }

  const doLogout = async () => {
    await logout()
    router.replace('/login')
  }

  if (loading || !user) {
    return (
      <div className="mobile-root">
        <div className="safe-area center"><div className="loading-inline"><Spinner /> …</div></div>
        <style jsx>{`
          .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #000; color: #fff; font-family: Inter, -apple-system, sans-serif; overflow: hidden; }
          .safe-area { flex: 1; overflow-y: auto; display: flex; align-items: center; justify-content: center; }
          .safe-area::-webkit-scrollbar { display: none; }
          .loading-inline { display: flex; align-items: center; gap: 8px; color: #888; font-size: 13px; }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  const strength = passwordScore(newPwd)
  const memberSince = user.created_at
    ? t(lang, 'pfMemberSince').replace('{date}', new Date(user.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { year: 'numeric', month: 'long' }))
    : null
  const initial = (user.name || '?').charAt(0).toUpperCase()

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="pf-header">
          <button className="back-btn" onClick={() => router.push('/menu')} aria-label="back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="pf-title">{t(lang, 'pfTitle')}</h1>
          <div className="header-spacer" />
        </header>

        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info"><Check size={14} />{info}</div>}

        {/* ---- Carte identité ---- */}
        <div className="hero-card">
          <div className="hero-avatar">{user.avatar || initial}</div>
          <div className="hero-info">
            <span className="hero-name">{user.name}</span>
            <span className="hero-email">{user.email}</span>
            <div className="hero-badges">
              <span className={`h-badge ${user.email_verified ? 'ok' : 'warn'}`}>
                {user.email_verified ? <BadgeCheck size={11} /> : <Mail size={11} />}
                {user.email_verified ? t(lang, 'pfVerified') : t(lang, 'pfUnverified')}
              </span>
              <span className={`h-badge type ${user.account_type}`}>
                {user.account_type === 'real' ? t(lang, 'authReal') : t(lang, 'authDemo')}
              </span>
              {user.totp_enabled && <span className="h-badge ok"><Shield size={11} />2FA</span>}
            </div>
            {user.broker_name && <span className="hero-broker"><Wallet size={11} />{user.broker_name}{user.broker_account ? ` · ${user.broker_account}` : ''}</span>}
            {memberSince && <span className="hero-since">{memberSince}</span>}
          </div>
        </div>

        {/* ---- Informations personnelles ---- */}
        <div className="section-title">{t(lang, 'pfEditSection')}</div>
        <form className="card form-card" onSubmit={submitProfile}>
          <label className="field">
            <span className="field-label">{t(lang, 'pfName')}</span>
            <input className="auth-input" value={name} onChange={e => setName(e.target.value)}
              maxLength={80} autoComplete="name" />
          </label>
          <div className="field">
            <span className="field-label">{t(lang, 'pfAvatar')}</span>
            <div className="avatar-grid">
              {AVATARS.map(a => (
                <button key={a} type="button" className={`avatar-cell ${avatar === a ? 'active' : ''}`}
                  onClick={() => setAvatar(avatar === a ? '' : a)}>{a}</button>
              ))}
              <button type="button" className={`avatar-cell clear ${!avatar ? 'active' : ''}`}
                onClick={() => setAvatar('')}>{initial}</button>
            </div>
          </div>
          <button className="auth-submit" disabled={saveBusy || !name.trim()}>
            {saveBusy ? <Spinner /> : <Check size={16} />}{t(lang, 'pfSave')}
          </button>
        </form>

        {/* ---- E-mail de connexion ---- */}
        <div className="section-title">{t(lang, 'pfEmailSection')}</div>
        <form className="card form-card" onSubmit={submitEmail}>
          <div className="field">
            <span className="field-label">{t(lang, 'pfNewEmail')}</span>
            <div className="input-wrap">
              <AtSign size={16} className="input-ico" />
              <input className="auth-input" type="email" value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder={user.email} autoComplete="email" />
            </div>
          </div>
          <div className="field">
            <span className="field-label">{t(lang, 'pfCurrentPwd')}</span>
            <div className="input-wrap">
              <Lock size={16} className="input-ico" />
              <input className="auth-input" type={showEmailPwd ? 'text' : 'password'} value={emailPwd}
                onChange={e => setEmailPwd(e.target.value)} autoComplete="current-password" />
              <button type="button" className="pwd-toggle" onClick={() => setShowEmailPwd(!showEmailPwd)}>
                {showEmailPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button className="auth-submit" disabled={emailBusy || !newEmail.trim() || !emailPwd}>
            {emailBusy ? <Spinner /> : <Mail size={15} />}{t(lang, 'pfChangeEmail')}
          </button>
        </form>

        {/* ---- Sécurité ---- */}
        <div className="section-title">{t(lang, 'pfSecurity')}</div>

        <div className="card list-card">
          <div className="list-row">
            <div className="row-icon"><Mail size={17} /></div>
            <div className="row-text">
              <span className="row-label">{t(lang, 'pfEmailStatus')}</span>
              <span className={`row-sub ${user.email_verified ? 'ok' : 'warn'}`}>
                {user.email_verified ? t(lang, 'pfVerified') : t(lang, 'pfUnverified')}
              </span>
            </div>
            {!user.email_verified && (
              <button className="mini-btn" onClick={sendCode} disabled={resendBusy}>
                {resendBusy ? <Spinner /> : t(lang, 'pfResendCode')}
              </button>
            )}
          </div>

          <div className="list-row">
            <div className="row-icon"><Shield size={17} /></div>
            <div className="row-text">
              <span className="row-label">{t(lang, 'pf2faStatus')}</span>
              <span className={`row-sub ${user.totp_enabled ? 'ok' : ''}`}>
                {user.totp_enabled ? t(lang, 'pf2faEnabled') : t(lang, 'pf2faDisabled')}
              </span>
            </div>
            {user.totp_enabled ? (
              <button className="mini-btn danger" onClick={() => { setDisableOpen(!disableOpen); banner(null, null) }}>
                {t(lang, 'pf2faDisable')}
              </button>
            ) : (
              <button className="mini-btn" onClick={startSetup} disabled={saveBusy}>
                {t(lang, 'pf2faEnable')}
              </button>
            )}
          </div>

          {disableOpen && (
            <div className="disable-box">
              <span className="disable-sub">{t(lang, 'pf2faDisableSub')}</span>
              <div className="disable-actions">
                <button type="button" className="ghost-btn" onClick={() => setDisableOpen(false)}>
                  {t(lang, 'auth2faBack')}
                </button>
                <button type="button" className="auth-submit small" onClick={confirmDisable} disabled={saveBusy}>
                  {saveBusy ? <Spinner /> : t(lang, 'pf2faDisable')}
                </button>
              </div>
            </div>
          )}

          {setupData && (
            <div className="setup-box">
              <span className="card-sub">{t(lang, 'auth2faSetupSub')}</span>
              <div className="qr-box"><QRCodeSVG value={setupData.provisioning_uri} size={172}
                bgColor="#000000" fgColor="#ffffff" level="M" /></div>
              <div className="secret-box">
                <span className="secret-label">{t(lang, 'auth2faSecret')}</span>
                <div className="secret-value">{setupData.secret.match(/.{1,4}/g).join(' ')}</div>
              </div>
              <input className="auth-input mono" value={setupCode} onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" inputMode="numeric" />
              <button className="auth-submit" onClick={() => confirmSetup(setupCode)} disabled={saveBusy || setupCode.length !== 6}>
                {saveBusy ? <Spinner /> : t(lang, 'auth2faEnable')}
              </button>
            </div>
          )}
        </div>

        {recoveryCodes.length > 0 && (
          <div className="card recovery-card">
            <div className="recovery-head">
              <div>
                <span className="row-label">{t(lang, 'auth2faRecovery')}</span>
                <span className="row-sub">{t(lang, 'auth2faEnabledSub')}</span>
              </div>
              <button className="ghost-btn copy" onClick={copyCodes}>
                {copied ? <Check size={14} /> : <Copy size={14} />}{t(lang, 'auth2faCopied')}
              </button>
            </div>
            <div className="codes-grid">
              {recoveryCodes.map(c => <span key={c} className="code-chip">{c}</span>)}
            </div>
            <button className="ghost-btn" onClick={closeRecovery}><X size={14} />OK</button>
          </div>
        )}

        {/* ---- Mot de passe ---- */}
        <div className="section-title">{t(lang, 'pfPwdSection')}</div>
        <form className="card form-card" onSubmit={submitPwd}>
          <label className="field">
            <span className="field-label">{t(lang, 'pfCurrentPwd')}</span>
            <div className="input-wrap">
              <Lock size={16} className="input-ico" />
              <input className="auth-input" type={showCur ? 'text' : 'password'} value={curPwd}
                onChange={e => setCurPwd(e.target.value)} autoComplete="current-password" />
              <button type="button" className="pwd-toggle" onClick={() => setShowCur(!showCur)}>
                {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label className="field">
            <span className="field-label">{t(lang, 'pfNewPwd')}</span>
            <div className="input-wrap">
              <KeyRound size={16} className="input-ico" />
              <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPwd}
                onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" />
              <button type="button" className="pwd-toggle" onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {newPwd && (
            <div className="strength-box">
              <div className="strength-bar">
                <div className="strength-fill" style={{ width: `${strength * 20}%`, background: STRENGTH_COLORS[strength - 1] }} />
              </div>
              <span className="strength-label" style={{ color: STRENGTH_COLORS[strength - 1] }}>
                {t(lang, 'authPwdStrength')[strength - 1]}
              </span>
            </div>
          )}
          <label className="field">
            <span className="field-label">{t(lang, 'pfConfirmNewPwd')}</span>
            <div className="input-wrap">
              <Lock size={16} className="input-ico" />
              <input className="auth-input" type={showConfirm ? 'text' : 'password'} value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)} autoComplete="new-password" />
              <button type="button" className="pwd-toggle" onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <span className="pwd-policy">{t(lang, 'authPwdPolicy')}</span>
          <button className="auth-submit" disabled={pwdBusy || !curPwd || !newPwd || !confirmPwd}>
            {pwdBusy ? <Spinner /> : <KeyRound size={15} />}{t(lang, 'pfUpdatePwd')}
          </button>
        </form>

        {/* ---- Ma communauté ---- */}
        <div className="section-title">{t(lang, 'pfCommunity')}</div>

        {community && (
          <div className="card comm-card">
            <div className="comm-head">
              <div className="comm-avatar" style={{ background: community.avatar_color || '#7266D9' }}>
                {community.avatar ? <img src={community.avatar} alt="" /> : (community.handle || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="comm-id">
                <span className="comm-name">
                  {community.display_name || user.name}
                  {community.verified && <BadgeCheck size={14} color="#1DA1F2" />}
                </span>
                <span className="comm-handle">@{community.handle}</span>
              </div>
              <button className="ghost-btn" onClick={() => router.push('/community')}>
                <Users size={13} />{t(lang, 'pfGoCommunity')}
              </button>
            </div>
            <div className="comm-stats">
              <div className="cstat">
                <span className="cstat-n">{community.posts_count ?? 0}</span>
                <span className="cstat-l">{t(lang, 'cPosts')}</span>
              </div>
              <div className="cstat">
                <span className="cstat-n">{community.followers_count ?? 0}</span>
                <span className="cstat-l">{t(lang, 'cFollowers')}</span>
              </div>
              <div className="cstat">
                <span className="cstat-n">{community.following_count ?? 0}</span>
                <span className="cstat-l">{t(lang, 'cFollowingCount')}</span>
              </div>
              <div className="cstat">
                <span className="cstat-n">{community.rockets_received ?? 0}</span>
                <span className="cstat-l">{t(lang, 'pfLikes')}</span>
              </div>
            </div>
          </div>
        )}

        <div className="card posts-card">
          <div className="posts-head"><Rocket size={15} />{t(lang, 'pfMyPosts')}</div>
          {!community || communityPosts.length === 0 ? (
            <p className="info-empty">{t(lang, 'pfNoPosts')}</p>
          ) : (
            communityPosts.map(p => (
              <button key={p.id} className="mini-post" onClick={() => router.push('/community')}>
                <span className={`mini-badge ${p.sentiment === 'bearish' ? 'bear' : 'bull'}`}>
                  {p.sentiment === 'bearish' ? '▼' : '▲'}
                </span>
                <div className="mini-text">
                  <div className="mini-title">{p.title}</div>
                  <div className="mini-meta">
                    {p.symbol} · 🚀 {p.rockets} · 💬 {p.comments} · {p.created_at ? new Date(p.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : ''}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* ---- Déconnexion ---- */}
        <button className="logout-btn" onClick={doLogout}>
          <LogOut size={17} />{t(lang, 'pfLogout')}
        </button>

        <div className="footer-note">BlueRock © 2026</div>
      </div>

      <BottomNav active="menu" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .pf-header { display: flex; align-items: center; gap: 8px; height: 56px; }
        .back-btn {
          background: none; border: none; color: #fff; cursor: pointer;
          display: flex; padding: 8px; border-radius: 10px;
        }
        .back-btn:hover { background: #141414; }
        .pf-title { flex: 1; font-size: 18px; font-weight: 800; margin: 0; }
        .header-spacer { width: 36px; }
        .section-title { font-size: 14px; font-weight: 700; color: #aaa; margin: 18px 2px 10px; text-transform: uppercase; letter-spacing: 0.4px; }
        .card { background: #141414; border: 1px solid #1f1f1f; border-radius: 18px; padding: 16px; margin-bottom: 12px; }
        .form-card { display: flex; flex-direction: column; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-label { font-size: 12px; color: #8f8f8f; font-weight: 600; }
        .input-wrap { position: relative; display: flex; align-items: center; }
        .input-ico { position: absolute; left: 13px; color: #555; pointer-events: none; }
        .pwd-toggle {
          position: absolute; right: 8px; background: none; border: none;
          color: #777; cursor: pointer; display: flex; padding: 6px;
        }
        .auth-input {
          height: 46px; border-radius: 13px; border: 1px solid #262626;
          background: #0d0d0d; color: #fff; padding: 0 14px;
          font-size: 15px; font-family: inherit; outline: none; width: 100%;
        }
        .input-wrap .auth-input { padding: 0 40px; }
        .auth-input:focus { border-color: #00C853; }
        .auth-input.mono { font-family: 'JetBrains Mono', monospace; text-align: center; letter-spacing: 2px; }
        .auth-submit {
          height: 48px; border: none; border-radius: 13px;
          background: #00C853; color: #00130a; font-size: 14.5px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .auth-submit.small { height: 40px; padding: 0 16px; font-size: 13px; width: auto; }
        .auth-submit:disabled { opacity: 0.5; cursor: default; }
        .ghost-btn {
          background: none; border: 1px solid #2a2a2a; color: #aaa;
          border-radius: 11px; padding: 8px 12px; font-size: 12.5px;
          cursor: pointer; font-family: inherit;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .ghost-btn.copy { border-color: rgba(0,200,83,0.3); color: #00C853; }
        .ghost-btn:disabled { opacity: 0.5; }
        .auth-error {
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          color: #ff8a8c; border-radius: 12px; padding: 10px 14px; font-size: 12.5px;
          line-height: 1.5; margin-bottom: 12px;
        }
        .auth-info {
          display: flex; align-items: center; gap: 8px;
          background: rgba(0,200,83,0.08); border: 1px solid rgba(0,200,83,0.3);
          color: #7ee2a4; border-radius: 12px; padding: 10px 14px; font-size: 12.5px;
          margin-bottom: 12px;
        }
        .hero-card {
          display: flex; gap: 14px; align-items: flex-start;
          background: linear-gradient(135deg, #0f1a12, #141414 60%);
          border: 1px solid #1f2a22; border-radius: 20px; padding: 18px 16px;
        }
        .hero-avatar {
          width: 62px; height: 62px; border-radius: 20px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #00C853, #00994a);
          font-size: 30px; font-weight: 800; color: #00130a;
        }
        .hero-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .hero-name { font-size: 17px; font-weight: 800; }
        .hero-email { font-size: 12px; color: #8f8f8f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hero-badges { display: flex; flex-wrap: wrap; gap: 6px; }
        .h-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 8px;
        }
        .h-badge.ok { color: #7ee2a4; background: rgba(0,200,83,0.1); }
        .h-badge.warn { color: #ffd166; background: rgba(255,209,102,0.1); }
        .h-badge.type.demo { color: #4ea8ff; background: rgba(78,168,255,0.12); }
        .h-badge.type.real { color: #ffd166; background: rgba(255,209,102,0.12); }
        .hero-broker { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #bbb; }
        .hero-since { font-size: 11px; color: #666; }
        .avatar-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .avatar-cell {
          width: 40px; height: 40px; border-radius: 12px; border: 1px solid #262626;
          background: #0d0d0d; font-size: 20px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .avatar-cell.active { border-color: #00C853; background: rgba(0,200,83,0.1); }
        .avatar-cell.clear { font-weight: 800; color: #fff; font-size: 15px; }
        .list-card { padding: 6px 14px; }
        .list-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 0; border-bottom: 1px solid #1f1f1f;
        }
        .list-row:last-child { border-bottom: none; }
        .row-icon {
          width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,200,83,0.1); color: #00C853;
        }
        .row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .row-label { font-size: 13.5px; font-weight: 600; }
        .row-sub { font-size: 11.5px; color: #8f8f8f; }
        .row-sub.ok { color: #7ee2a4; }
        .row-sub.warn { color: #ffd166; }
        .mini-btn {
          background: rgba(0,200,83,0.1); border: 1px solid rgba(0,200,83,0.3);
          color: #00C853; font-size: 11.5px; font-weight: 700;
          padding: 7px 12px; border-radius: 10px; cursor: pointer;
          font-family: inherit; display: inline-flex; align-items: center; gap: 6px;
          flex-shrink: 0;
        }
        .mini-btn.danger { background: rgba(255,77,79,0.1); border-color: rgba(255,77,79,0.3); color: #ff8a8c; }
        .mini-btn:disabled { opacity: 0.5; }
        .disable-box, .setup-box { display: flex; flex-direction: column; gap: 10px; padding: 12px 0 14px; border-top: 1px solid #1f1f1f; align-items: center; }
        .disable-sub { font-size: 12px; color: #8f8f8f; text-align: center; }
        .disable-actions { display: flex; align-items: center; gap: 10px; width: 100%; justify-content: space-between; }
        .card-sub { font-size: 12.5px; color: #8f8f8f; text-align: center; line-height: 1.6; }
        .qr-box { padding: 12px; background: #0d0d0d; border: 1px solid #262626; border-radius: 14px; }
        .secret-box { text-align: center; }
        .secret-label { font-size: 10.5px; color: #666; }
        .secret-value { font-size: 12.5px; font-family: 'JetBrains Mono', monospace; color: #bbb; letter-spacing: 2px; margin-top: 4px; }
        .recovery-card { display: flex; flex-direction: column; gap: 12px; }
        .recovery-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .recovery-head .row-label { display: block; font-size: 14px; font-weight: 700; margin-bottom: 3px; }
        .recovery-head .row-sub { display: block; }
        .codes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .code-chip {
          background: #0d0d0d; border: 1px solid #262626; border-radius: 10px;
          padding: 9px 6px; text-align: center; font-family: 'JetBrains Mono', monospace;
          font-size: 12px; font-weight: 600; letter-spacing: 1px; color: #e8e8e8;
        }
        .pwd-policy { font-size: 11px; color: #666; line-height: 1.5; padding: 0 2px; }
        .strength-box { display: flex; align-items: center; gap: 10px; padding: 0 2px; }
        .strength-bar { flex: 1; height: 4px; border-radius: 2px; background: #1c1c1c; overflow: hidden; }
        .strength-fill { height: 100%; border-radius: 2px; transition: width 0.25s ease; }
        .strength-label { font-size: 11px; font-weight: 600; min-width: 64px; text-align: right; }
        .logout-btn {
          width: 100%; margin-top: 6px; height: 48px; border-radius: 14px;
          border: 1px solid rgba(255,77,79,0.3); background: rgba(255,77,79,0.08);
          color: #ff8a8c; font-size: 14px; font-weight: 700; cursor: pointer;
          font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .footer-note { text-align: center; font-size: 11px; color: #555; padding: 14px 0 6px; }
        .comm-card, .posts-card { display: flex; flex-direction: column; gap: 12px; }
        .comm-head { display: flex; align-items: center; gap: 12px; }
        .comm-avatar {
          width: 52px; height: 52px; border-radius: 16px; overflow: hidden; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 800; font-size: 22px;
        }
        .comm-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .comm-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .comm-name { font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; }
        .comm-handle { font-size: 12px; color: #8f8f8f; font-family: 'JetBrains Mono', monospace; }
        .comm-stats {
          display: flex; justify-content: space-between;
          background: #0d0d0d; border: 1px solid #1f1f1f; border-radius: 14px; padding: 12px 10px;
        }
        .cstat { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
        .cstat-n { font-size: 17px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
        .cstat-l { font-size: 10px; color: #8f8f8f; white-space: nowrap; }
        .posts-head { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: #00C853; }
        .info-empty { font-size: 12.5px; color: #8f8f8f; line-height: 1.6; margin: 4px 0; }
        .mini-post {
          display: flex; gap: 10px; align-items: flex-start; width: 100%;
          background: none; border: none; color: inherit; cursor: pointer;
          padding: 12px 0; border-bottom: 1px solid #1f1f1f;
          font-family: inherit; text-align: left;
        }
        .mini-post:last-child { border-bottom: none; }
        .mini-badge {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800;
        }
        .mini-badge.bull { background: rgba(0,200,83,0.12); color: #00C853; }
        .mini-badge.bear { background: rgba(255,77,79,0.12); color: #FF4D4F; }
        .mini-text { flex: 1; min-width: 0; }
        .mini-title { font-size: 13.5px; font-weight: 600; line-height: 1.35; }
        .mini-meta { font-size: 11.5px; color: #8f8f8f; margin-top: 3px; font-family: 'JetBrains Mono', monospace; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
