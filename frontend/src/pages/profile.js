import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { updateMe, getCommunityMe } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import {
  ArrowLeft, UserRound, Shield, Mail, Check, LogOut,
  Copy, Wallet, BadgeCheck, X, Rocket, Users,
} from 'lucide-react'

const AVATARS = ['🦁', '🐘', '🐆', '🦓', '🦅', '🐬', '🌴', '🔥', '⚡', '💎', '🐊', '🦜', '🐢', '🦩', '🪙', '📈']

function Spinner() {
  return <TriLoader inline />
}

function errMsg(err, fallback) {
  return err?.message || err?.error_description || fallback
}

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

  // communauté
  const [community, setCommunity] = useState(null)
  const [communityPosts, setCommunityPosts] = useState([])

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [logoutOpen, setLogoutOpen] = useState(false)

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

  const doLogout = async () => {
    setLogoutOpen(true)
  }

  const confirmLogout = async () => {
    setLogoutOpen(false)
    await logout()
    router.replace('/login')
  }

  if (loading || !user) {
    return (
      <div className="mobile-root">
        <div className="safe-area center"><div className="loading-inline"><TriLoader compact /></div></div>
        <style jsx>{`
          .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #000000; color: #fff; font-family: Inter, -apple-system, sans-serif; overflow: hidden; }
          .safe-area { flex: 1; overflow-y: auto; display: flex; align-items: center; justify-content: center; }
          .safe-area::-webkit-scrollbar { display: none; }
          .loading-inline { display: flex; align-items: center; gap: 8px; color: #888; font-size: 13px; }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  const memberSince = user.created_at
    ? t(lang, 'pfMemberSince').replace('{date}', new Date(user.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { year: 'numeric', month: 'long' }))
    : null
  const initial = (user.name || '?').charAt(0).toUpperCase()

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="pf-header">
          <button className="back-btn" onClick={() => router.push('/portfolio')} aria-label="back">
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

        {logoutOpen && (
          <div className="logout-box">
            <span className="logout-sub">{t(lang, 'pfLogoutConfirm')}</span>
            <div className="disable-actions">
              <button type="button" className="ghost-btn" onClick={() => setLogoutOpen(false)}>
                {t(lang, 'cancel')}
              </button>
              <button type="button" className="auth-submit small danger" onClick={confirmLogout}>
                {t(lang, 'pfLogout')}
              </button>
            </div>
          </div>
        )}

        <div className="footer-note">Bluerock © 2026</div>
      </div>

      <BottomNav active="portfolio" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
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
        .pf-title { flex: 1; font-size: 18px; font-weight: 700; margin: 0; }
        .header-spacer { width: 36px; }
        .section-title { font-size: 14px; font-weight: 700; color: #aaa; margin: 18px 2px 10px; text-transform: uppercase; letter-spacing: 0.15px; }
        .card { background: #141414; border: 1px solid #1f1f1f; border-radius: 18px; padding: 16px; margin-bottom: 12px; }
        .form-card { display: flex; flex-direction: column; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-label { font-size: 12px; color: #9AA3B2; font-weight: 600; }
        .auth-input {
          height: 46px; border-radius: 13px; border: 1px solid #262626;
          background: #0d0d0d; color: #fff; padding: 0 14px;
          font-size: 15px; font-family: inherit; outline: none; width: 100%;
        }
        .auth-input:focus { border-color: #18C27C; }
        .auth-input.mono { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; text-align: center; letter-spacing: 0.15px; }
        .auth-submit {
          height: 48px; border: none; border-radius: 13px;
          background: #18C27C; color: #00130a; font-size: 14.5px; font-weight: 700;
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
        .ghost-btn.copy { border-color: rgba(24,194,124,0.3); color: #18C27C; }
        .ghost-btn:disabled { opacity: 0.5; }
        .auth-error {
          background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.3);
          color: #ff8a8c; border-radius: 12px; padding: 10px 14px; font-size: 12.5px;
          line-height: 1.35; margin-bottom: 12px;
        }
        .auth-info {
          display: flex; align-items: center; gap: 8px;
          background: rgba(24,194,124,0.08); border: 1px solid rgba(24,194,124,0.3);
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
          background: linear-gradient(135deg, #18C27C, #00994a);
          font-size: 30px; font-weight: 700; color: #00130a;
        }
        .hero-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .hero-name { font-size: 17px; font-weight: 700; }
        .hero-email { font-size: 12px; color: #9AA3B2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hero-badges { display: flex; flex-wrap: wrap; gap: 6px; }
        .h-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 8px;
        }
        .h-badge.ok { color: #7ee2a4; background: rgba(24,194,124,0.1); }
        .h-badge.warn { color: #ffd166; background: rgba(255,209,102,0.1); }
        .hero-broker { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #bbb; }
        .hero-since { font-size: 11px; color: #666; }
        .avatar-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .avatar-cell {
          width: 40px; height: 40px; border-radius: 12px; border: 1px solid #262626;
          background: #0d0d0d; font-size: 20px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .avatar-cell.active { border-color: #18C27C; background: rgba(24,194,124,0.1); }
        .avatar-cell.clear { font-weight: 700; color: #fff; font-size: 15px; }
        .list-card { padding: 6px 14px; }
        .list-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 0; border-bottom: 1px solid #1f1f1f;
        }
        .list-row:last-child { border-bottom: none; }
        .row-icon {
          width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(24,194,124,0.1); color: #18C27C;
        }
        .row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .row-label { font-size: 13.5px; font-weight: 600; }
        .row-sub { font-size: 11.5px; color: #9AA3B2; }
        .row-sub.ok { color: #7ee2a4; }
        .row-sub.warn { color: #ffd166; }
        .mini-btn {
          background: rgba(24,194,124,0.1); border: 1px solid rgba(24,194,124,0.3);
          color: #18C27C; font-size: 11.5px; font-weight: 700;
          padding: 7px 12px; border-radius: 10px; cursor: pointer;
          font-family: inherit; display: inline-flex; align-items: center; gap: 6px;
          flex-shrink: 0;
        }
        .mini-btn.danger { background: rgba(240,68,56,0.1); border-color: rgba(240,68,56,0.3); color: #ff8a8c; }
        .mini-btn:disabled { opacity: 0.5; }
        .disable-box, .setup-box, .logout-box { display: flex; flex-direction: column; gap: 10px; padding: 12px 0 14px; border-top: 1px solid #1f1f1f; align-items: center; }
        .disable-sub, .logout-sub { font-size: 12px; color: #9AA3B2; text-align: center; }
        .auth-submit.small.danger { background: rgba(240,68,56,0.15); color: #ff8a8c; }
        .disable-actions { display: flex; align-items: center; gap: 10px; width: 100%; justify-content: space-between; }
        .card-sub { font-size: 12.5px; color: #9AA3B2; text-align: center; line-height: 1.35; }
        .qr-box { padding: 12px; background: #0d0d0d; border: 1px solid #262626; border-radius: 14px; }
        .secret-box { text-align: center; }
        .secret-label { font-size: 10.5px; color: #666; }
        .secret-value { font-size: 12.5px; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; color: #bbb; letter-spacing: 0.15px; margin-top: 4px; }
        .recovery-card { display: flex; flex-direction: column; gap: 12px; }
        .recovery-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .recovery-head .row-label { display: block; font-size: 14px; font-weight: 700; margin-bottom: 3px; }
        .recovery-head .row-sub { display: block; }
        .codes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .code-chip {
          background: #0d0d0d; border: 1px solid #262626; border-radius: 10px;
          padding: 9px 6px; text-align: center; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          font-size: 12px; font-weight: 600; letter-spacing: 0.15px; color: #e8e8e8;
        }
        .logout-btn {
          width: 100%; margin-top: 6px; height: 48px; border-radius: 14px;
          border: 1px solid rgba(240,68,56,0.3); background: rgba(240,68,56,0.08);
          color: #ff8a8c; font-size: 14px; font-weight: 700; cursor: pointer;
          font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .footer-note { text-align: center; font-size: 11px; color: #555; padding: 14px 0 6px; }
        .comm-card, .posts-card { display: flex; flex-direction: column; gap: 12px; }
        .comm-head { display: flex; align-items: center; gap: 12px; }
        .comm-avatar {
          width: 52px; height: 52px; border-radius: 16px; overflow: hidden; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 700; font-size: 22px;
        }
        .comm-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .comm-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .comm-name { font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; }
        .comm-handle { font-size: 12px; color: #9AA3B2; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .comm-stats {
          display: flex; justify-content: space-between;
          background: #0d0d0d; border: 1px solid #1f1f1f; border-radius: 14px; padding: 12px 10px;
        }
        .cstat { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
        .cstat-n { font-size: 17px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .cstat-l { font-size: 10px; color: #9AA3B2; white-space: nowrap; }
        .posts-head { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: #18C27C; }
        .info-empty { font-size: 12.5px; color: #9AA3B2; line-height: 1.35; margin: 4px 0; }
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
          font-size: 12px; font-weight: 700;
        }
        .mini-badge.bull { background: rgba(24,194,124,0.12); color: #18C27C; }
        .mini-badge.bear { background: rgba(240,68,56,0.12); color: #F04438; }
        .mini-text { flex: 1; min-width: 0; }
        .mini-title { font-size: 13.5px; font-weight: 600; line-height: 1.35; }
        .mini-meta { font-size: 11.5px; color: #9AA3B2; margin-top: 3px; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
