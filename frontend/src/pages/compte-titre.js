import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import {
  getBrokers,
  brokerConnectAuth, brokerConnectSession, brokerConnectLink,
  getKycStatus, getBrokerAccounts, openBrokerAccount, respondBrokerAccount,
} from '../services/api'
import { detectLang, t } from '../lib/i18n'
import { FEATURES } from '../lib/features'
import TriLoader from '../components/TriLoader'
import {
  ArrowLeft, ShieldCheck, Wallet, CheckCircle2,
  Lock, FileText, Star, BadgeCheck,
  Mail, Eye, EyeOff, UserRound, ChevronRight, AlertTriangle,
  Percent, Banknote, Repeat, Check, Landmark, KeyRound,
} from 'lucide-react'

const SGI_TOKEN_KEY = 'bluerock_broker_token'

const PALETTES = [
  ['#42E8F4', '#0d3540'],
  ['#0A63FF', '#0a1f4a'],
  ['#8b5cf6', '#241a4d'],
  ['#18C27C', '#0b3320'],
  ['#ff6b9d', '#3d1226'],
]

const KYC_LABELS = {
  not_started: 'kycStatusNotStarted',
  in_progress: 'kycStatusInProgress',
  document_submitted: 'kycStatusDocumentSubmitted',
  verification_in_progress: 'kycStatusVerificationInProgress',
  verified: 'kycStatusVerified',
  review_required: 'kycStatusReviewRequired',
  rejected: 'kycStatusRejected',
  retry_required: 'kycStatusRetryRequired',
  error: 'kycStatusError',
}

const KYC_HINTS = {
  not_started: 'kycStatusHintIncomplete',
  in_progress: 'kycStatusHintSubmitted',
  document_submitted: 'kycStatusHintSubmitted',
  verification_in_progress: 'kycStatusHintSubmitted',
  verified: 'kycStatusHintApproved',
  review_required: 'kycStatusHintReviewRequired',
  rejected: 'kycStatusHintRejected',
  retry_required: 'kycStatusHintRetryRequired',
  error: 'kycStatusHintError',
}

const KYC_COLORS = {
  verified: '#18C27C',
  not_started: '#8E95A3',
  in_progress: '#4EA8FF',
  document_submitted: '#4EA8FF',
  verification_in_progress: '#4EA8FF',
  review_required: '#B18CFF',
  rejected: '#F04438',
  retry_required: '#f59e0b',
  error: '#F04438',
}

const SG_STATUSES = {
  transmitted: { key: 'sgStatusTransmitted', color: '#4EA8FF' },
  under_review: { key: 'sgStatusUnderReview', color: '#B18CFF' },
  info_requested: { key: 'sgStatusInfoRequested', color: '#f59e0b' },
  approved: { key: 'sgStatusApproved', color: '#18C27C' },
  account_opening: { key: 'sgStatusAccountOpening', color: '#4EA8FF' },
  account_open: { key: 'sgStatusAccountOpen', color: '#18C27C' },
  refused: { key: 'sgStatusRefused', color: '#F04438' },
}

function seedHash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}

function initialsOf(name) {
  const words = name.replace(/^(SGI|SGO)\s*/i, '').split(/\s+/).filter(w => !/^(S\.?A)$/i.test(w))
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase()
}

function tierOf(n) {
  if (n >= 8.5) return { label: 'PLATINUM', color: '#0A63FF' }
  if (n >= 7.5) return { label: 'GOLD', color: '#D4A843' }
  return { label: 'SILVER', color: '#6f6f6f' }
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

const fmtXof2 = (n) => n == null ? '—' : n.toLocaleString('fr-FR').replace(/,/g, ' ')

function BrokerLogin({ broker, user }) {
  const router = useRouter()
  const { login, register, logout } = useAuth()
  const [lang, setLang] = useState('fr')
  const [meta, setMeta] = useState(null)
  const [fees, setFees] = useState(null)
  const [brokersList, setBrokersList] = useState([])

  // --- SGI (compte-titres) ---
  const [sgiToken, setSgiToken] = useState(null)
  const [sgiAccount, setSgiAccount] = useState(null)
  const [sgiBroker, setSgiBroker] = useState(broker || '')
  const [acctNum, setAcctNum] = useState('')
  const [pin, setPin] = useState('')
  const [sgiBusy, setSgiBusy] = useState(false)
  const [sgiError, setSgiError] = useState(null)
  const [sgiInfo, setSgiInfo] = useState(null)

  // --- KYC (plateforme) ---
  const [kyc, setKyc] = useState(null)

  // --- Dossiers d'ouverture (plateforme) ---
  const [dossiers, setDossiers] = useState([])
  const [sgForm, setSgForm] = useState({ full_name: '', phone: '', id_type: 'cni', id_number: '' })
  const [sgBusy, setSgBusy] = useState(false)
  const [sgMsg, setSgMsg] = useState(null)
  const [respond, setRespond] = useState({})

  // --- Démo (plateforme) ---
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  useEffect(() => {
    setLang(detectLang())
  }, [])

  useEffect(() => {
    if (!broker) return
    let alive = true
    getBrokers()
      .then(r => {
        const byCountry = r.data?.brokers || {}
        for (const country of Object.keys(byCountry)) {
          for (const cat of ['SGI', 'SGO']) {
            const found = (byCountry[country][cat] || []).find(b => b.name === broker)
            if (found && alive) { setMeta({ ...found, country }); return }
          }
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [broker])

  useEffect(() => {
    if (!broker) return
    let alive = true
    getBrokers()
      .then(r => {
        const byCountry = r.data?.brokers || {}
        for (const country of Object.keys(byCountry)) {
          for (const cat of ['SGI', 'SGO']) {
            const found = (byCountry[country][cat] || []).find(b => b.name === broker)
            if (found && alive) { setFees(found.fees || null); return }
          }
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [broker])

  // Liste des courtiers (SGI + SGO) pour la connexion SGI
  useEffect(() => {
    let alive = true
    getBrokers()
      .then(r => {
        const byCountry = r.data?.brokers || {}
        const flat = []
        for (const country of Object.keys(byCountry)) {
          for (const cat of ['SGI', 'SGO']) {
            for (const b of (byCountry[country][cat] || [])) flat.push({ name: b.name, category: cat, city: b.city })
          }
        }
        if (!alive) return
        setBrokersList(flat)
        setSgiBroker(prev => prev || (flat[0]?.name || ''))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Restauration de la session SGI locale
  useEffect(() => {
    let alive = true
    let tok = null
    try { tok = sessionStorage.getItem(SGI_TOKEN_KEY) } catch {}
    if (!tok) return
    brokerConnectSession(tok)
      .then(r => {
        if (!alive) return
        setSgiToken(tok)
        setSgiAccount(r.data?.account || null)
        setSgiBroker(prev => r.data?.account?.broker_name || prev)
      })
      .catch(() => { try { sessionStorage.removeItem(SGI_TOKEN_KEY) } catch {} })
    return () => { alive = false }
  }, [])

  // KYC + dossiers : liés au compte plateforme
  useEffect(() => {
    if (!user) { setKyc(null); setDossiers([]); return }
    let alive = true
    getKycStatus().then(r => { if (alive) setKyc(r.data || null) }).catch(() => { if (alive) setKyc(null) })
    getBrokerAccounts().then(r => { if (alive) setDossiers(r.data?.accounts || []) }).catch(() => {})
    return () => { alive = false }
  }, [user])

  const pal = PALETTES[seedHash(broker || 'BlueRock') % PALETTES.length]
  const tgr = tierOf(meta?.note ?? 8.5)
  const next = () => router.replace(`/compte-titre${broker ? `?broker=${encodeURIComponent(broker)}` : ''}`)

  // ---------- Démo (plateforme) ----------
  const submitLogin = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null); setInfo(null)
    try {
      const data = await login(email.trim(), password)
      if (data?.status === 'totp_required') {
        router.push('/login?next=' + encodeURIComponent(`/compte-titre${broker ? `?broker=${encodeURIComponent(broker)}` : ''}`))
        return
      }
    } catch (err) {
      const msg = err?.message || err?.error_description || err?.code || ''
      if (/otp|verif|confirm|unverified/i.test(msg)) {
        setInfo(t(lang, 'brAuthVerifyPending'))
      } else {
        setError(/invalid|credentials/i.test(msg) ? t(lang, 'authInvalid') : (msg || t(lang, 'authError')))
      }
    } finally { setBusy(false) }
  }

  const submitRegister = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null); setInfo(null)
    if (password !== confirm) {
      setError(t(lang, 'authPasswordsMismatch'))
      setBusy(false)
      return
    }
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
        next()
        return
      }
      setInfo(t(lang, 'brAuthVerifyPending'))
    } catch (err) {
      setError(err?.message || t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const doLogout = async () => {
    await logout()
    router.replace('/compte-titre')
  }

  // ---------- SGI (compte-titres) ----------
  const submitSgiLogin = async (e) => {
    e.preventDefault()
    if (sgiBusy) return
    setSgiBusy(true); setSgiError(null); setSgiInfo(null)
    try {
      const r = await brokerConnectAuth({ broker_name: sgiBroker, account_number: acctNum.trim(), pin })
      try { sessionStorage.setItem(SGI_TOKEN_KEY, r.data.broker_token) } catch {}
      setSgiToken(r.data.broker_token)
      setSgiAccount(r.data.account || null)
      setSgiBroker(r.data.account?.broker_name || sgiBroker)
      setAcctNum(''); setPin('')
    } catch (err) {
      const d = err?.response?.data?.detail
      setSgiError(typeof d === 'string' ? d : t(lang, 'bcErrorAuth'))
    } finally { setSgiBusy(false) }
  }

  const linkSgi = async () => {
    if (!sgiToken || !user || sgiBusy) return
    setSgiBusy(true); setSgiError(null); setSgiInfo(null)
    try {
      await brokerConnectLink(sgiToken)
      setSgiInfo(t(lang, 'bcConnectedSub').replace('{broker}', sgiBroker))
    } catch (err) {
      const d = err?.response?.data?.detail
      setSgiError(typeof d === 'string' ? d : t(lang, 'bcErrorAuth'))
    } finally { setSgiBusy(false) }
  }

  const logoutSgi = () => {
    try { sessionStorage.removeItem(SGI_TOKEN_KEY) } catch {}
    setSgiToken(null); setSgiAccount(null); setSgiInfo(null); setSgiError(null)
  }

  const submitDossier = async (e) => {
    e.preventDefault()
    if (sgBusy) return
    const target = broker || sgiBroker
    if (!target) { setSgMsg({ ok: false, sub: t(lang, 'sgFillAll') }); return }
    setSgBusy(true); setSgMsg(null)
    try {
      await openBrokerAccount({ broker_name: target, ...sgForm })
      setSgMsg({ ok: true, title: t(lang, 'sgSentOkTitle'), sub: t(lang, 'sgSentOkSub').replace('{broker}', target) })
      const list = await getBrokerAccounts()
      setDossiers(list.data?.accounts || [])
      setSgForm({ full_name: '', phone: '', id_type: 'cni', id_number: '' })
    } catch (err) {
      const d = err?.response?.data?.detail
      setSgMsg({ ok: false, title: '', sub: typeof d === 'string' ? d : t(lang, 'authError') })
    } finally { setSgBusy(false) }
  }

  const submitRespond = async (id) => {
    if (sgBusy) return
    setSgBusy(true); setSgMsg(null)
    try {
      await respondBrokerAccount(id, { response: respond[id] || '' })
      const list = await getBrokerAccounts()
      setDossiers(list.data?.accounts || [])
      setRespond({ ...respond, [id]: '' })
    } catch (err) {
      const d = err?.response?.data?.detail
      setSgMsg({ ok: false, title: '', sub: typeof d === 'string' ? d : t(lang, 'authError') })
    } finally { setSgBusy(false) }
  }

  const strength = passwordScore(password)
  const strengthLabel = strength > 0 ? (t(lang, 'authPwdStrength'))[strength - 1] : ''
  const scoreColor = ['#F04438', '#F04438', '#f59e0b', '#18C27C', '#18C27C', '#18C27C'][strength]

  const kycColor = KYC_COLORS[kyc?.status] || '#8E95A3'
  const kycLabel = kyc ? t(lang, KYC_LABELS[kyc.status] || 'kycStatusNotStarted') : ''
  let kycHint = kyc ? t(lang, KYC_HINTS[kyc.status] || 'kycStatusHintIncomplete') : ''
  if (kyc?.status === 'rejected' && kyc.review_note) kycHint = kycHint.replace('{note}', kyc.review_note)
  if (kyc?.status === 'verified' && kyc.profile_complete) kycHint = t(lang, 'kycReadyTitle')
  let kycCta = null
  if (kyc?.status === 'verified') {
    kycCta = kyc.profile_complete ? null : { label: t(lang, 'kycGo'), to: '/kyc' }
  } else if (kyc?.status === 'retry_required' || kyc?.status === 'error') {
    kycCta = { label: t(lang, 'kycRetry'), to: '/kyc' }
  } else if (kyc && kyc.status !== 'review_required' && kyc.status !== 'rejected') {
    kycCta = { label: t(lang, 'kycGo'), to: '/kyc' }
  }

  const sgiReady = !!sgiAccount && !!sgiToken

  return (
    <div className="bo-root">
      <div className="bo-glow" style={{ background: `radial-gradient(70% 45% at 50% 0%, ${pal[1]}66, transparent 70%)` }} />

      {/* ============ HÉRO COURTIER ============ */}
      <section className="bo-hero" style={{ animationDelay: '0ms' }}>
        <div className="bo-hero-logo" style={{ background: `linear-gradient(135deg, ${pal[0]}, ${pal[1]})` }}>
          <span>{initialsOf(broker || 'BlueRock')}</span>
        </div>
        <div className="bo-hero-info">
          <span className="bo-hero-name">{broker || 'BlueRock'}</span>
          <span className="bo-hero-sub">
            {meta
              ? [meta.country, meta.city].filter(Boolean).join(' · ')
              : t(lang, 'brAuthSubtitle')}
          </span>
          <div className="bo-chips">
            {meta?.category && <span className="bo-chip cat">{meta.category}</span>}
            {meta && <span className="bo-chip tier" style={{ background: tgr.color }}>{tgr.label}</span>}
          </div>
        </div>
      </section>

      {/* ============ VÉRIFICATION KYC ============ */}
          <section className="bo-kyc" style={{ animationDelay: '120ms' }}>
            <div className="bo-kyc-head">
              <div className="bo-kyc-ico"><ShieldCheck size={18} /></div>
              <div className="bo-kyc-txt">
                <b>{t(lang, 'kycTitle')}</b>
                <i>{t(lang, 'kycSubtitle')}</i>
              </div>
              {kyc && (
                <span className="bo-kyc-chip" style={{ color: kycColor, borderColor: kycColor + '66', background: kycColor + '1f' }}>
                  {kycLabel}
                </span>
              )}
            </div>
            {!user ? (
              <>
                <div className="bo-info"><Check size={14} /> <span>{t(lang, 'kycLoginRequired')}</span></div>
                <button type="button" className="bo-submit" onClick={() => router.push('/login')}>
                  <span>{t(lang, 'kycLoginBtn')}</span><ChevronRight size={16} />
                </button>
              </>
            ) : !FEATURES.kyc ? (
              <div className="bo-info"><AlertTriangle size={14} /> <span>{t(lang, 'ftSubKyc')}</span></div>
            ) : !kyc ? (
              <div className="bo-info"><TriLoader inline /> <span>{t(lang, 'loading')}</span></div>
            ) : (
              <>
                <p className="bo-kyc-hint">{kycHint}</p>
                {kycCta && (
                  <button type="button" className="bo-submit" onClick={() => router.push(kycCta.to)}>
                    <span>{kycCta.label}</span><ChevronRight size={16} />
                  </button>
                )}
              </>
            )}
          </section>

          {meta && fees && (
            <>
              {/* ============ CONVERSION ============ */}
              <section className="bo-title-row" style={{ animationDelay: '180ms' }}>
                <span className="bo-title">{t(lang, 'brAuthTitle')}</span>
                <span className="bo-title-big">{broker}</span>
                <span className="bo-sub">{t(lang, 'brAuthSubtitle')}</span>
              </section>

              <section className="bo-stats" style={{ animationDelay: '240ms' }}>
                <div className="bo-stat">
                  <span className="bo-stat-label">{t(lang, 'brMinDeposit')}</span>
                  <span className="bo-stat-value"><b>{fmtXof2(meta.min_deposit)}</b> <i>FCFA</i></span>
                  <span className="bo-stat-foot">à l&apos;ouverture</span>
                </div>
                <div className="bo-stat">
                  <span className="bo-stat-label">{t(lang, 'brOpeningFee')}</span>
                  <span className="bo-stat-value"><b>{fees.opening_fee ? fmtXof2(fees.opening_fee) : t(lang, 'brFeeOpeningFree')}</b> {fees.opening_fee ? <i>FCFA</i> : null}</span>
                  <span className="bo-stat-foot">{fees.opening_fee ? 'une seule fois' : t(lang, 'brFeeOpeningFree')}</span>
                </div>
                <div className="bo-stat">
                  <span className="bo-stat-label">{t(lang, 'brCustodyRate')}</span>
                  <span className="bo-stat-value"><b>{fees.custody_rate.toLocaleString('fr-FR')} %</b></span>
                  <span className="bo-stat-foot">{t(lang, 'brFeeCustodySub')}</span>
                </div>
              </section>

              {/* ============ GRILLE DE FRAIS ============ */}
              <section className="bo-fees" style={{ animationDelay: '300ms' }}>
                <div className="bo-fees-head">
                  <Percent size={16} className="bo-fees-ico" />
                  <span className="bo-fees-title">{t(lang, 'brFeesTitle')}</span>
                </div>
                <div className="bo-fee">
                  <span className="bo-fee-ico" style={{ color: '#4CE3A0', background: 'rgba(24,194,124,0.12)' }}><Percent size={15} /></span>
                  <div className="bo-fee-txt">
                    <span className="bo-fee-label">{t(lang, 'brFeeCommission')}</span>
                    <span className="bo-fee-sub">{t(lang, 'brFeeCommissionSub')} · {t(lang, 'brFeeCommissionMin').replace('{amount}', fmtXof2(fees.commission_min) + ' FCFA')}</span>
                  </div>
                  <span className="bo-fee-value">{fees.commission_rate.toLocaleString('fr-FR')} %</span>
                </div>
                <div className="bo-fee">
                  <span className="bo-fee-ico" style={{ color: '#4EA8FF', background: 'rgba(78,168,255,0.12)' }}><FileText size={15} /></span>
                  <div className="bo-fee-txt">
                    <span className="bo-fee-label">{t(lang, 'brFeeOpening')}</span>
                    <span className="bo-fee-sub">virement initial</span>
                  </div>
                  <span className="bo-fee-value">{fees.opening_fee ? fmtXof2(fees.opening_fee) + ' FCFA' : t(lang, 'brFeeOpeningFree')}</span>
                </div>
                <div className="bo-fee">
                  <span className="bo-fee-ico" style={{ color: '#D4A843', background: 'rgba(212,168,67,0.12)' }}><Wallet size={15} /></span>
                  <div className="bo-fee-txt">
                    <span className="bo-fee-label">{t(lang, 'brFeeCustody')}</span>
                    <span className="bo-fee-sub">{t(lang, 'brFeeCustodySub')}</span>
                  </div>
                  <span className="bo-fee-value">{fees.custody_rate.toLocaleString('fr-FR')} %</span>
                </div>
                <div className="bo-fee">
                  <span className="bo-fee-ico" style={{ color: '#42E8F4', background: 'rgba(66,232,244,0.12)' }}><Landmark size={15} /></span>
                  <div className="bo-fee-txt">
                    <span className="bo-fee-label">{t(lang, 'brFeeAccount')}</span>
                    <span className="bo-fee-sub">{t(lang, 'brFeeAccountSub')}</span>
                  </div>
                  <span className="bo-fee-value">{fees.account_fee ? fmtXof2(fees.account_fee) + ' FCFA' : t(lang, 'brFeeOpeningFree')}</span>
                </div>
                <div className="bo-fee">
                  <span className="bo-fee-ico" style={{ color: '#B18CFF', background: 'rgba(177,140,255,0.12)' }}><Repeat size={15} /></span>
                  <div className="bo-fee-txt">
                    <span className="bo-fee-label">{t(lang, 'brFeeTransfer')}</span>
                    <span className="bo-fee-sub">{t(lang, 'brFeeTransferSub')}</span>
                  </div>
                  <span className="bo-fee-value">{fmtXof2(fees.transfer_out_fee)} FCFA</span>
                </div>
                <div className="bo-fee">
                  <span className="bo-fee-ico" style={{ color: '#42E8F4', background: 'rgba(66,232,244,0.12)' }}><Banknote size={15} /></span>
                  <div className="bo-fee-txt">
                    <span className="bo-fee-label">{t(lang, 'brFeeWithdrawal')}</span>
                    <span className="bo-fee-sub">{t(lang, 'brFeeWithdrawalSub')}</span>
                  </div>
                  <span className="bo-fee-value" style={{ color: '#4CE3A0' }}>{t(lang, 'brFeeWithdrawalFree')}</span>
                </div>
                {meta.note != null && (
                  <div className="bo-fees-foot">
                    <span className="bo-score">{Number(meta.note / 2).toFixed(1)}</span>
                    <span className="bo-stars">
                      {[0, 1, 2, 3, 4].map(i => (
                        <Star key={i} size={13} className={parseFloat((meta.note / 2).toFixed(1)) >= i + 0.75 ? 'star-on' : 'star-off'} />
                      ))}
                    </span>
                    <span className="bo-founded">{t(lang, 'brFounded').replace('{year}', meta.founded)}</span>
                    <span className="bo-verified"><BadgeCheck size={13} /> {t(lang, 'brVerified')}</span>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ============ CONNEXION SGI (authentification propre) ============ */}
          <section className="bo-sgi" style={{ animationDelay: '360ms' }}>
            <div className="bo-kyc-head">
              <div className="bo-kyc-ico"><KeyRound size={18} /></div>
              <div className="bo-kyc-txt">
                <b>{t(lang, 'sgiAuthTitle')}</b>
                <i>{t(lang, 'sgiAuthSub')}</i>
              </div>
              {sgiReady && <span className="bo-kyc-chip" style={{ color: '#18C27C', borderColor: '#18C27C66', background: '#18C27C1f' }}>{t(lang, 'kycStatusVerified')}</span>}
            </div>

            {sgiReady ? (
              <div className="bo-connected">
                <div className="bo-connected-ico"><Landmark size={20} /></div>
                <div className="bo-connected-txt">
                  <b>{sgiAccount.holder_name}</b>
                  <i>{t(lang, 'sgiAccountConnectedSub').replace('{broker}', sgiBroker)}</i>
                  <i>{t(lang, 'bcAccountNumber')} : {sgiAccount.account_number_masked} · {t(lang, 'bcCash')} : {fmtXof2(sgiAccount.cash_balance)} FCFA</i>
                </div>
                {user ? (
                  <button type="button" className="bo-submit" onClick={linkSgi} disabled={sgiBusy}>
                    {sgiBusy ? <TriLoader inline /> : <><span>{t(lang, 'bcLinkCta')}</span><ChevronRight size={16} /></>}
                  </button>
                ) : (
                  <div className="bo-info"><Check size={14} /> <span>{t(lang, 'bcLinkHint')}</span></div>
                )}
                {sgiInfo && <div className="bo-info"><Check size={14} /> <span>{sgiInfo}</span></div>}
                {sgiError && <div className="bo-error"><AlertTriangle size={14} /> <span>{sgiError}</span></div>}
                <button type="button" className="bo-switch" onClick={logoutSgi}>
                  {t(lang, 'sgiLogout')}
                </button>
              </div>
            ) : (
              <form className="bo-form" onSubmit={submitSgiLogin}>
                <div className="bo-field">
                  <Landmark size={16} className="bo-field-ico" />
                  <select className="bo-input bo-select" value={sgiBroker} onChange={e => setSgiBroker(e.target.value)} required>
                    {brokersList.length === 0 && <option value="">{t(lang, 'bcBrokerPlaceholder')}</option>}
                    {brokersList.map(b => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="bo-field">
                  <Wallet size={16} className="bo-field-ico" />
                  <input className="bo-input" type="text" inputMode="numeric" value={acctNum} onChange={e => setAcctNum(e.target.value)} placeholder={t(lang, 'bcAccountNumber')} required autoComplete="off" name="sgi-account-number" />
                </div>
                <div className="bo-field">
                  <KeyRound size={16} className="bo-field-ico" />
                  <input className="bo-input" type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder={t(lang, 'bcPin')} required autoComplete="new-password" name="sgi-pin" />
                </div>
                {sgiError && <div className="bo-error"><AlertTriangle size={14} /> <span>{sgiError}</span></div>}
                <button className="bo-submit" disabled={sgiBusy}>
                  {sgiBusy ? <TriLoader inline /> : <><span>{t(lang, 'bcConnect')}</span><ChevronRight size={16} /></>}
                </button>
              </form>
            )}
          </section>

          {/* ============ DOSSIER D'OUVERTURE (plateforme) ============ */}
          <section className="bo-sgi" style={{ animationDelay: '420ms' }}>
            <div className="bo-kyc-head">
              <div className="bo-kyc-ico"><FileText size={18} /></div>
              <div className="bo-kyc-txt">
                <b>{t(lang, 'sgTitle')}</b>
                <i>{t(lang, 'sgSub')}</i>
              </div>
            </div>

            {!user ? (
              <>
                <div className="bo-info"><Check size={14} /> <span>{t(lang, 'ctLoginRequired')}</span></div>
                <button type="button" className="bo-submit" onClick={() => router.push('/login')}>
                  <span>{t(lang, 'kycLoginBtn')}</span><ChevronRight size={16} />
                </button>
              </>
            ) : !FEATURES.brokerAccounts ? (
              <>
                <div className="bo-info"><AlertTriangle size={14} /> <span>{t(lang, 'ftSubBroker')}</span></div>
                {dossiers.length > 0 && (
                  <div className="bo-sg-list">
                    {dossiers.map(a => {
                      const st = SG_STATUSES[a.status] || { key: 'sgStatusTransmitted', color: '#8E95A3' }
                      return (
                        <div key={a.id} className="bo-sg-row">
                          <div className="bo-sg-row-head">
                            <b>{a.broker_name}</b>
                            <span className="bo-kyc-chip" style={{ color: st.color, borderColor: st.color + '66', background: st.color + '1f' }}>
                              {t(lang, st.key)}
                            </span>
                          </div>
                          <i className="bo-sg-row-sub">
                            {a.transmitted_at ? t(lang, 'sgOpenedAt') + ' : ' + new Date(a.transmitted_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB') : ''}
                            {a.sgi_note ? ' · ' + a.sgi_note : ''}
                          </i>
                          {a.status === 'info_requested' && (
                            <div className="bo-form bo-respond">
                              <textarea className="bo-textarea" rows={3} value={respond[a.id] || ''} onChange={e => setRespond({ ...respond, [a.id]: e.target.value })} placeholder={t(lang, 'sgRespondPlaceholder')} />
                              <button type="button" className="bo-submit" onClick={() => submitRespond(a.id)} disabled={sgBusy}>
                                {sgBusy ? <TriLoader inline /> : <><span>{t(lang, 'sgRespondBtn')}</span><ChevronRight size={16} /></>}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : kyc && kyc.status === 'verified' && kyc.profile_complete ? (
              <>
                <form className="bo-form" onSubmit={submitDossier}>
                  <div className="bo-field">
                    <UserRound size={16} className="bo-field-ico" />
                    <input className="bo-input" type="text" value={sgForm.full_name} onChange={e => setSgForm({ ...sgForm, full_name: e.target.value })} placeholder={t(lang, 'sgOpenFullName')} required />
                  </div>
                  <div className="bo-field">
                    <Mail size={16} className="bo-field-ico" />
                    <input className="bo-input" type="tel" value={sgForm.phone} onChange={e => setSgForm({ ...sgForm, phone: e.target.value })} placeholder={t(lang, 'sgOpenPhone')} required />
                  </div>
                  <div className="bo-field">
                    <FileText size={16} className="bo-field-ico" />
                    <select className="bo-input bo-select" value={sgForm.id_type} onChange={e => setSgForm({ ...sgForm, id_type: e.target.value })}>
                      <option value="cni">{t(lang, 'sgIdCni')}</option>
                      <option value="passeport">{t(lang, 'sgIdPasseport')}</option>
                      <option value="ninea">{t(lang, 'sgIdNinea')}</option>
                      <option value="npi">{t(lang, 'sgIdNpi')}</option>
                    </select>
                  </div>
                  <div className="bo-field">
                    <BadgeCheck size={16} className="bo-field-ico" />
                    <input className="bo-input" type="text" value={sgForm.id_number} onChange={e => setSgForm({ ...sgForm, id_number: e.target.value })} placeholder={t(lang, 'sgOpenIdNumber')} required />
                  </div>
                  {sgMsg && (sgMsg.ok
                    ? <div className="bo-info"><Check size={14} /> <span>{sgMsg.title} — {sgMsg.sub}</span></div>
                    : <div className="bo-error"><AlertTriangle size={14} /> <span>{sgMsg.sub}</span></div>)}
                  <button className="bo-submit" disabled={sgBusy}>
                    {sgBusy ? <TriLoader inline /> : <><span>{t(lang, 'sgOpenBtn')}</span><ChevronRight size={16} /></>}
                  </button>
                </form>

                {dossiers.length > 0 && (
                  <div className="bo-sg-list">
                    {dossiers.map(a => {
                      const st = SG_STATUSES[a.status] || { key: 'sgStatusTransmitted', color: '#8E95A3' }
                      return (
                        <div key={a.id} className="bo-sg-row">
                          <div className="bo-sg-row-head">
                            <b>{a.broker_name}</b>
                            <span className="bo-kyc-chip" style={{ color: st.color, borderColor: st.color + '66', background: st.color + '1f' }}>
                              {t(lang, st.key)}
                            </span>
                          </div>
                          <i className="bo-sg-row-sub">
                            {a.transmitted_at ? t(lang, 'sgOpenedAt') + ' : ' + new Date(a.transmitted_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB') : ''}
                            {a.sgi_note ? ' · ' + a.sgi_note : ''}
                          </i>
                          {a.status === 'info_requested' && (
                            <div className="bo-form bo-respond">
                              <textarea className="bo-textarea" rows={3} value={respond[a.id] || ''} onChange={e => setRespond({ ...respond, [a.id]: e.target.value })} placeholder={t(lang, 'sgRespondPlaceholder')} />
                              <button type="button" className="bo-submit" onClick={() => submitRespond(a.id)} disabled={sgBusy}>
                                {sgBusy ? <TriLoader inline /> : <><span>{t(lang, 'sgRespondBtn')}</span><ChevronRight size={16} /></>}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bo-info"><AlertTriangle size={14} /> <span>{t(lang, 'sgKycRequired')}</span></div>
                <button type="button" className="bo-submit" onClick={() => router.push('/kyc')}>
                  <span>{t(lang, 'kycGo')}</span><ChevronRight size={16} />
                </button>
              </>
            )}
          </section>

          {/* ============ AUTH / CONNECTÉ (plateforme) ============ */}
          <section className="bo-auth" style={{ animationDelay: '240ms' }}>
            {user ? (
              <div className="bo-connected">
                <div className="bo-connected-ico"><CheckCircle2 size={20} /></div>
                <div className="bo-connected-txt">
                  <b>{user.name || 'Utilisateur'}</b>
                  <i>{user.email}</i>
                </div>
                <button type="button" className="bo-submit" onClick={() => router.push('/portfolio')}>
                  <span>{t(lang, 'ctViewPortfolio')}</span><ChevronRight size={16} />
                </button>
                <button type="button" className="bo-switch" onClick={doLogout}>
                  {t(lang, 'pfLogout')}
                </button>
              </div>
            ) : (
              <>
                <div className="bo-tabs">
                  <button className={`bo-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(null); setInfo(null) }}>
                    {t(lang, 'brAuthConnect')}
                  </button>
                  <button className={`bo-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(null); setInfo(null) }}>
                    {t(lang, 'brAuthCreate')}
                  </button>
                </div>

                {tab === 'login' && (
                  <form className="bo-form" onSubmit={submitLogin}>
                    <div className="bo-field">
                      <Mail size={16} className="bo-field-ico" />
                      <input className="bo-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoComplete="off" name="ct-login-email" />
                    </div>
                    <div className="bo-field">
                      <Lock size={16} className="bo-field-ico" />
                      <input className="bo-input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t(lang, 'authPassword')} required autoComplete="new-password" name="ct-login-password" />
                      <button type="button" className="bo-pwd" onClick={() => setShowPwd(v => !v)} aria-label="toggle">
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button type="button" className="bo-forgot" onClick={() => router.push('/login')}>{t(lang, 'brAuthNeedHelp')}</button>
                    {error && <div className="bo-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                    {info && <div className="bo-info"><Check size={14} /> <span>{info}</span></div>}
                    <button className="bo-submit" disabled={busy}>
                      {busy ? <TriLoader inline /> : <><span>{t(lang, 'brAuthConnect')}</span><ChevronRight size={16} /></>}
                    </button>
                    <button type="button" className="bo-switch" onClick={() => { setTab('register'); setError(null); setInfo(null) }}>
                      {t(lang, 'brAuthCreateCta')}
                    </button>
                  </form>
                )}

                {tab === 'register' && (
                  <form className="bo-form" onSubmit={submitRegister}>
                    <div className="bo-field">
                      <UserRound size={16} className="bo-field-ico" />
                      <input className="bo-input" value={name} onChange={e => setName(e.target.value)} placeholder={t(lang, 'authName')} required autoComplete="off" name="ct-register-name" />
                    </div>
                    <div className="bo-field">
                      <Mail size={16} className="bo-field-ico" />
                      <input className="bo-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t(lang, 'authEmail')} required autoComplete="off" name="ct-register-email" />
                    </div>
                    <div className="bo-field">
                      <Lock size={16} className="bo-field-ico" />
                      <input className="bo-input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t(lang, 'authPassword')} required autoComplete="new-password" name="ct-register-password" />
                      <button type="button" className="bo-pwd" onClick={() => setShowPwd(v => !v)} aria-label="toggle">
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {password && (
                      <div className="bo-strength">
                        <div className="bo-strength-bar"><div className="bo-strength-fill" style={{ width: `${(strength / 5) * 100}%`, background: scoreColor }} /></div>
                        <span className="bo-strength-label" style={{ color: scoreColor }}>{strengthLabel}</span>
                      </div>
                    )}
                    <div className="bo-field">
                      <Lock size={16} className="bo-field-ico" />
                      <input className="bo-input" type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t(lang, 'authConfirmPassword')} required autoComplete="new-password" name="ct-register-confirm" />
                      <button type="button" className="bo-pwd" onClick={() => setShowConfirm(v => !v)} aria-label="toggle">
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {error && <div className="bo-error"><AlertTriangle size={14} /> <span>{error}</span></div>}
                    {info && <div className="bo-info"><Check size={14} /> <span>{info}</span></div>}
                    <button className="bo-submit" disabled={busy}>
                      {busy ? <TriLoader inline /> : <><span>{t(lang, 'brAuthCreate')}</span><ChevronRight size={16} /></>}
                    </button>
                    <button type="button" className="bo-switch" onClick={() => { setTab('login'); setError(null); setInfo(null) }}>
                      {t(lang, 'brAuthLoginCta')}
                    </button>
                  </form>
                )}
              </>
            )}

            <span className="bo-security"><ShieldCheck size={12} /> {t(lang, 'brAuthSecurity')}</span>
          </section>

      <style jsx>{`
        .bo-root { position: relative; display: flex; flex-direction: column; gap: 14px; padding: 8px 0 22px; }
        .bo-glow { position: fixed; top: -60px; left: -40%; right: -40%; height: 340px; pointer-events: none; filter: blur(2px); opacity: 0.5; z-index: 0; }
        .bo-hero {
          position: relative; z-index: 1;
          display: flex; align-items: center; gap: 16px;
          background: linear-gradient(160deg, #12161c, #0b0e13);
          border: 1px solid #26303f; border-radius: 22px;
          padding: 20px 18px;
          box-shadow: 0 18px 44px -22px rgba(0,0,0,0.9);
          animation: boUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .bo-hero-logo {
          width: 84px; height: 84px; border-radius: 22px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(255,255,255,0.16);
          box-shadow: 0 10px 26px rgba(0,0,0,0.55);
        }
        .bo-hero-logo span { font-size: 26px; font-weight: 700; color: #fff; letter-spacing: 0; }
        .bo-hero-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .bo-hero-name { font-size: 21px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; word-break: break-word; }
        .bo-hero-sub { font-size: 13px; color: #9AA3B2; line-height: 1.4; }
        .bo-chips { display: flex; gap: 7px; flex-wrap: wrap; }
        .bo-chip { font-size: 10.5px; font-weight: 800; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 7px; text-transform: uppercase; }
        .bo-chip.cat { color: #cfe3ff; background: rgba(78,168,255,0.12); border: 1px solid rgba(78,168,255,0.3); }
        .bo-chip.tier { color: #fff; }
        .bo-kyc, .bo-sgi {
          position: relative; z-index: 1;
          display: flex; flex-direction: column; gap: 12px;
          background: linear-gradient(170deg, #0f1319, #0a0d12);
          border: 1px solid #26303f; border-radius: 20px;
          padding: 16px 16px 14px;
          animation: boUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .bo-kyc-head { display: flex; align-items: center; gap: 10px; }
        .bo-kyc-ico {
          width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #4CE3A0; background: rgba(24,194,124,0.15);
        }
        .bo-kyc-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .bo-kyc-txt b { font-size: 14px; font-weight: 800; color: #EDF1F7; }
        .bo-kyc-txt i { font-style: normal; font-size: 11px; color: #7d8a9e; line-height: 1.35; }
        .bo-kyc-chip {
          flex-shrink: 0; padding: 4px 10px; border-radius: 999px;
          font-size: 10.5px; font-weight: 800; letter-spacing: 0.03em;
          border: 1px solid; text-transform: uppercase;
        }
        .bo-kyc-hint { margin: 0; font-size: 12.5px; color: #9AA3B2; line-height: 1.45; }
        .bo-sg-list { display: flex; flex-direction: column; gap: 10px; }
        .bo-sg-row {
          display: flex; flex-direction: column; gap: 6px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 12px 13px;
        }
        .bo-sg-row-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .bo-sg-row-head b { font-size: 13.5px; font-weight: 800; color: #EDF1F7; }
        .bo-sg-row-sub { font-style: normal; font-size: 11px; color: #7d8a9e; line-height: 1.4; }
        .bo-respond { gap: 8px; margin-top: 4px; }
        .bo-textarea {
          width: 100%; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          color: #F8F8FA; font-size: 13px; font-family: inherit; font-weight: 500;
          padding: 10px 12px; outline: none; resize: vertical; min-height: 70px;
        }
        .bo-textarea::placeholder { color: #5f6b7e; }
        .bo-title-row { display: flex; flex-direction: column; gap: 2px; padding: 4px 4px 0; animation: boUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .bo-title { font-size: 12.5px; font-weight: 700; color: #8E95A3; text-transform: uppercase; letter-spacing: 0.06em; }
        .bo-title-big { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
        .bo-sub { font-size: 13px; color: #8E95A3; line-height: 1.4; }
        .bo-stats {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
          animation: boUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .bo-stat {
          display: flex; flex-direction: column; gap: 3px;
          background: linear-gradient(170deg, #11151b, #0b0e13);
          border: 1px solid #26303f; border-radius: 16px; padding: 14px 12px;
        }
        .bo-stat-label { font-size: 9.5px; font-weight: 700; color: #7d8a9e; text-transform: uppercase; letter-spacing: 0.05em; }
        .bo-stat-value { display: flex; align-items: baseline; gap: 4px; font-weight: 800; font-size: 12px; color: #F8F8FA; letter-spacing: 0; }
        .bo-stat-value b { font-size: 17px; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .bo-stat-value i { font-style: normal; font-size: 10px; font-weight: 700; color: #5f6b77; }
        .bo-stat-foot { font-size: 10px; color: #5f6b77; line-height: 1.3; }
        .bo-fees {
          display: flex; flex-direction: column;
          background: linear-gradient(170deg, #10141a, #0b0e13);
          border: 1px solid #26303f; border-radius: 20px;
          padding: 16px 16px 8px;
          animation: boUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .bo-fees-head { display: flex; align-items: center; gap: 9px; padding: 0 2px 6px; }
        .bo-fees-ico { color: #18C27C; }
        .bo-fees-title { font-size: 13.5px; font-weight: 800; }
        .bo-fee {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 2px; border-top: 1px solid rgba(255,255,255,0.05);
        }
        .bo-fee-ico {
          width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .bo-fee-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .bo-fee-label { font-size: 13px; font-weight: 700; color: #EDF1F7; }
        .bo-fee-sub { font-size: 11px; color: #7d8a9e; line-height: 1.3; }
        .bo-fee-value {
          font-size: 13.5px; font-weight: 800; color: #F8F8FA; white-space: nowrap;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
        }
        .bo-fees-foot {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          border-top: 1px solid rgba(255,255,255,0.06); margin-top: 4px; padding: 12px 2px 6px;
        }
        .bo-score { font-size: 14px; font-weight: 800; color: #8E95A3; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .bo-stars { display: flex; gap: 1px; }
        .star-on { color: #fff; fill: #fff; }
        .star-off { color: #4a4f5a; }
        .bo-founded { font-size: 11px; color: #7d8a9e; }
        .bo-verified {
          display: flex; align-items: center; gap: 4px; margin-left: auto;
          font-size: 10.5px; font-weight: 700; color: #18C27C;
        }
        .bo-auth {
          display: flex; flex-direction: column; gap: 14px;
          background: linear-gradient(170deg, #0f1319, #0a0d12);
          border: 1px solid #26303f; border-radius: 22px;
          padding: 18px 16px 14px;
          box-shadow: 0 18px 44px -22px rgba(0,0,0,0.9);
          animation: boUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .bo-connected {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 6px 0 2px; text-align: center;
        }
        .bo-connected-ico {
          width: 46px; height: 46px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          color: #4CE3A0; background: rgba(24,194,124,0.15);
        }
        .bo-connected-txt { display: flex; flex-direction: column; gap: 2px; }
        .bo-connected-txt b { font-size: 15px; font-weight: 800; color: #EDF1F7; }
        .bo-connected-txt i { font-style: normal; font-size: 12px; color: #7d8a9e; }
        .bo-tabs {
          display: flex; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 13px; padding: 4px;
        }
        .bo-tab {
          flex: 1; padding: 10px 0; border: none; border-radius: 10px;
          background: none; color: #9aa7ba; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: all 0.18s ease;
        }
        .bo-tab.active {
          background: linear-gradient(135deg, #18C27C, #0fa763); color: #04140c;
          box-shadow: 0 6px 16px rgba(24,194,124,0.28);
        }
        .bo-form { display: flex; flex-direction: column; gap: 10px; width: 100%; }
        .bo-field {
          position: relative; display: flex; align-items: center;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px; height: 50px;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .bo-field:focus-within { border-color: #18C27C; box-shadow: 0 0 0 4px rgba(24,194,124,0.12); }
        .bo-field-ico { position: absolute; left: 14px; color: #66748a; pointer-events: none; }
        .bo-input {
          flex: 1; height: 100%; background: none; border: none; outline: none;
          color: #F8F8FA; font-size: 14.5px; font-weight: 500; font-family: inherit;
          padding: 0 42px; min-width: 0;
        }
        .bo-input::placeholder { color: #5f6b7e; }
        .bo-select {
          appearance: none; cursor: pointer; color: #F8F8FA;
          padding-right: 42px; background: transparent;
        }
        .bo-select option { background: #0f1319; color: #F8F8FA; }
        .bo-pwd {
          position: absolute; right: 10px; background: none; border: none; color: #7d8a9e;
          cursor: pointer; display: flex; padding: 6px;
        }
        .bo-forgot {
          align-self: flex-end; background: none; border: none; color: #18C27C;
          font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit;
          padding: 2px 4px;
        }
        .bo-strength { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
        .bo-strength-bar { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .bo-strength-fill { height: 100%; border-radius: 3px; transition: width 0.25s ease; }
        .bo-strength-label { font-size: 11px; font-weight: 700; min-width: 62px; }
        .bo-error {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.32);
          color: #ff8a8c; border-radius: 12px; padding: 10px 13px; font-size: 12.5px; line-height: 1.4;
        }
        .bo-info {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(24,194,124,0.09); border: 1px solid rgba(24,194,124,0.32);
          color: #7ee2a4; border-radius: 12px; padding: 10px 13px; font-size: 12.5px; line-height: 1.4;
        }
        .bo-submit {
          height: 50px; border: none; border-radius: 14px;
          background: linear-gradient(135deg, #18C27C, #0fa763); color: #04140c;
          font-size: 15.5px; font-weight: 800; letter-spacing: 0;
          cursor: pointer; font-family: inherit; margin-top: 2px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 10px 24px rgba(24,194,124,0.26);
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }
        .bo-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(24,194,124,0.36); }
        .bo-submit:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
        .bo-switch {
          background: none; border: none; color: #18C27C;
          font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit;
          padding: 6px; text-decoration: underline; text-underline-offset: 3px;
        }
        .bo-security {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 11px; color: #6b7889; text-align: center; padding: 0 8px;
        }
        @keyframes boUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  )
}

export default function CompteTitre() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [lang, setLang] = useState('fr')

  useEffect(() => {
    setLang(detectLang())
  }, [])

  if (authLoading) {
    return (
      <div className="mobile-root center">
        <div className="loading"><TriLoader compact label={t(lang, 'loading')} /></div>
        <style jsx>{`
          .mobile-root { display: flex; align-items: center; justify-content: center; height: 100vh; background: #000000; color: #fff; }
          .loading { color: #9AA3B2; font-size: 14px; }
        `}</style>
      </div>
    )
  }

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="br-header">
          <button className="icon-btn" onClick={() => router.back()}><ArrowLeft size={20} /></button>
          <div className="br-title">
            <span className="br-name">{t(lang, 'ctTitle')}</span>
          </div>
          <div className="icon-btn spacer" />
        </header>
        <BrokerLogin broker={typeof router.query.broker === 'string' ? router.query.broker : null} user={user} />
        <span className="ct-foot">{t(lang, 'ctNote')}</span>
      </div>
      <style jsx>{`
        .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #000000; color: #fff; font-family: Inter, -apple-system, sans-serif; overflow: hidden; }
        .safe-area { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .br-header { display: flex; align-items: center; justify-content: space-between; height: 60px; }
        .icon-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%; }
        .br-title { display: flex; align-items: center; text-align: center; }
        .br-name { font-size: 17px; font-weight: 700; }
        .spacer { opacity: 0; }
        .ct-foot { display: block; text-align: center; font-size: 11px; color: #6f6f6f; margin-top: 16px; line-height: 1.35; }
      `}</style>
    </div>
  )
}
