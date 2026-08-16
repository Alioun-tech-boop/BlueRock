import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import {
  getChallenges, getChallenge, joinChallenge, leaveChallenge, getChallengeLeaderboard,
  getChallengePortfolio, placeChallengeOrder, getChallengeUserProfile, getCompanies,
  verifyDepositOrder,
} from '../services/api'
import { useAuth } from '../lib/auth'
import { FEATURES } from '../lib/features'
import {
  Trophy, Flame, Users, Medal, Wallet, TrendingUp, TrendingDown,
  Crown, CheckCircle2, LogIn, X, ArrowLeft, Sparkles, RefreshCw,
  LayoutGrid, BarChart3, Target, ChevronRight, Search, Zap, CreditCard, Lock,
} from 'lucide-react'
import { detectLang, t } from '../lib/i18n'

const fmtXof = (n) => n == null ? '—' : Number(n).toLocaleString('fr-FR').replace(/[,.]\d+/, '').replace(/\s/g, ' ')
const fmtNum = (n) => n == null ? '—' : Number(n).toLocaleString('fr-FR')
const fmtPct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`
const fmtDate = (iso, lang) => iso
  ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })
  : '—'
const fmtDateFull = (iso, lang) => iso
  ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

function Spark({ data, height = 64, stroke = '#1ED760' }) {
  const pts = Array.isArray(data) ? data.filter(p => p && typeof p.value === 'number') : []
  if (pts.length < 2) {
    return <div style={{ height, color: '#6f7c8c', fontSize: 11, display: 'flex', alignItems: 'center' }}>—</div>
  }
  const w = 280
  const vals = pts.map(p => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = (max - min) || 1
  const step = w / (pts.length - 1)
  const coords = pts.map((p, i) => {
    const x = i * step
    const y = height - 8 - ((p.value - min) / span) * (height - 16)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const up = vals[vals.length - 1] >= vals[0]
  const color = up ? '#1ED760' : '#F04438'
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height, display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${coords.join(' ')} ${w},${height}`} fill={`url(#sg-${up ? 'u' : 'd'})`} />
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={coords[coords.length - 1].split(',')[1]} r="3" fill={color} />
    </svg>
  )
}

function GlassCard({ children, className = '', style }) {
  return <div className={`gl-card ${className}`} style={style}>{children}</div>
}

function SkeletonScreen({ lang }) {
  return (
    <div className="sk-screen" aria-busy="true" aria-label={t(lang, 'loading')}>
      <div className="sk-nav">
        {[0, 1, 2, 3].map(i => <div key={i} className="sk sk-nav-pill" />)}
      </div>
      <div className="sk-hero">
        <div className="sk-top">
          <div className="sk sk-badge" style={{ width: 128 }} />
          <div className="sk sk-ico" />
        </div>
        <div className="sk sk-l" style={{ width: '70%' }} />
        <div className="sk sk-m" style={{ width: '92%' }} />
        <div className="sk sk-m" style={{ width: '82%' }} />
        <div className="sk-stats">
          {[0, 1, 2].map(i => (
            <div key={i} className="sk-stat">
              <div className="sk sk-s" style={{ width: 46 }} />
              <div className="sk sk-l" style={{ width: 56 }} />
            </div>
          ))}
        </div>
        <div className="sk sk-btn" />
      </div>
      <div className="sk-card">
        <div className="sk-row"><div className="sk sk-box" /><div className="sk sk-m" style={{ width: '42%' }} /></div>
        <div className="sk sk-m" style={{ width: '88%' }} />
        <div className="sk sk-m" style={{ width: '72%' }} />
      </div>
      <div className="sk-card">
        <div className="sk-row"><div className="sk sk-box" /><div className="sk sk-m" style={{ width: '38%' }} /></div>
        <div className="sk sk-m" style={{ width: '85%' }} />
        <div className="sk sk-m" style={{ width: '64%' }} />
      </div>
    </div>
  )
}

const VIEWS = { home: 'home', rules: 'rules', portfolio: 'portfolio', leaderboard: 'leaderboard', user: 'user' }

export default function Challenges() {
  const router = useRouter()
  const { user } = useAuth()
  const [lang, setLang] = useState('fr')
  const [view, setView] = useState(VIEWS.home)
  const [ch, setCh] = useState(null)
  const [portfolio, setPortfolio] = useState(null)
  const [lb, setLb] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderSide, setOrderSide] = useState('buy')
  const [orderSymbol, setOrderSymbol] = useState('')
  const [orderQty, setOrderQty] = useState('10')
  const [symbols, setSymbols] = useState(null)
  const [symQuery, setSymQuery] = useState('')
  const [orderErr, setOrderErr] = useState('')
  const [tick, setTick] = useState(0)
  const mounted = useRef(true)
  const chRef = useRef(null)
  const viewRef = useRef(VIEWS.home)
  const explicitIdRef = useRef(0)

  const refreshPortfolio = useCallback(async (id) => {
    if (!id) return
    try {
      const r = await getChallengePortfolio(id)
      if (mounted.current) setPortfolio(r.data)
    } catch {}
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    const qId = Number(router.query.id)
    if (qId) explicitIdRef.current = qId
    try {
      if (qId) {
        const [cd, lbd] = await Promise.all([getChallenge(qId), getChallengeLeaderboard(qId)])
        if (!mounted.current || explicitIdRef.current !== qId) return
        setCh(cd.data)
        setLb(lbd.data?.leaderboard || [])
        if (cd.data?.joined) refreshPortfolio(cd.data.id)
      } else {
        const list = await getChallenges()
        if (!mounted.current || explicitIdRef.current) return
        const listData = list.data?.challenges || []
        const open = listData.find(c => c.status === 'live' || c.status === 'open')
          || listData.find(c => c.status !== 'ended') || listData[0]
        if (!open) {
          if (mounted.current) { setCh(null); setLoading(false) }
          return
        }
        const [cd, lbd] = await Promise.all([getChallenge(open.id), getChallengeLeaderboard(open.id)])
        if (!mounted.current || explicitIdRef.current) return
        setCh(cd.data)
        setLb(lbd.data?.leaderboard || [])
        if (cd.data?.joined) refreshPortfolio(cd.data.id)
      }
    } catch {
      if (mounted.current) setErr(t(lang, 'loadError'))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [lang, router.query.id, refreshPortfolio])

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    loadAll()
    const iv = setInterval(() => {
      setTick(x => x + 1)
      loadAll()
    }, 45000)
    const pv = setInterval(() => {
      if (chRef.current?.joined && viewRef.current === VIEWS.portfolio) refreshPortfolio(chRef.current.id)
    }, 15000)
    return () => { mounted.current = false; clearInterval(iv); clearInterval(pv) }
  }, [loadAll, refreshPortfolio])

  useEffect(() => {
    chRef.current = ch
  }, [ch])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    if (router.query.pay !== 'return') return
    const chId = ch?.id
    const orderId = ch?.payment_order_id
    if (!chId || !orderId) return
    setBusy(true)
    verifyDepositOrder(orderId)
      .then(async () => {
        const cd = await getChallenge(chId)
        if (mounted.current && explicitIdRef.current === chId) {
          setCh(cd.data)
          if (cd.data?.joined) {
            refreshPortfolio(chId)
            setView(VIEWS.portfolio)
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (mounted.current) setBusy(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch?.id, ch?.payment_order_id, router.query.pay])

  useEffect(() => {
    if (view === VIEWS.user && profile?.user_id && ch?.id) {
      getChallengeUserProfile(ch.id, profile.user_id)
        .then(r => { if (mounted.current) setProfile(r.data) })
        .catch(() => {})
    }
  }, [view, profile?.user_id, ch?.id, tick])

  const doJoin = async () => {
    if (!user) { router.push('/login?next=/challenges'); return }
    if (paidUnavailable) { setErr(t(lang, 'ftSubPaid')); return }
    setBusy(true); setErr('')
    try {
      const r = await joinChallenge(ch.id)
      if (r.data?.requires_payment && r.data?.payment_url) {
        setCh(prev => ({ ...prev, payment_pending: true, payment_order_id: r.data.payment_order_id }))
        setErr('')
        window.location.href = r.data.payment_url
        return
      }
      setCh(prev => ({ ...prev, joined: true }))
      refreshPortfolio(ch.id)
      const lbd = await getChallengeLeaderboard(ch.id)
      if (mounted.current) setLb(lbd.data?.leaderboard || [])
      if (ch.status === 'live' || ch.status === 'open') setView(VIEWS.portfolio)
    } catch (e) {
      const d = e?.response?.data?.detail
      setErr(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const doLeave = async () => {
    setBusy(true); setErr('')
    try {
      await leaveChallenge(ch.id)
      setCh(prev => ({ ...prev, joined: false }))
      setPortfolio(null)
      const lbd = await getChallengeLeaderboard(ch.id)
      if (mounted.current) setLb(lbd.data?.leaderboard || [])
      setView(VIEWS.home)
    } catch (e) {
      const d = e?.response?.data?.detail
      setErr(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally { setBusy(false) }
  }

  const openOrder = (side) => {
    setOrderSide(side)
    setOrderSymbol('')
    setSymQuery('')
    setOrderQty('10')
    setOrderErr('')
    setOrderOpen(true)
    if (!symbols) getCompanies({ limit: 100 }).then(r => { if (mounted.current) setSymbols(r.data?.companies || []) }).catch(() => {})
  }

  const submitOrder = async () => {
    if (!orderSymbol) { setOrderErr(t(lang, 'ch2Symbol')); return }
    const qty = parseFloat(orderQty)
    if (!qty || qty <= 0) { setOrderErr(t(lang, 'ch2Qty')); return }
    setBusy(true); setOrderErr('')
    try {
      const r = await placeChallengeOrder(ch.id, { symbol: orderSymbol, side: orderSide, qty })
      if (!mounted.current) return
      setPortfolio(r.data.portfolio)
      setOrderOpen(false)
      const lbd = await getChallengeLeaderboard(ch.id)
      if (mounted.current) setLb(lbd.data?.leaderboard || [])
    } catch (e) {
      const d = e?.response?.data?.detail
      setOrderErr(typeof d === 'string' ? d : t(lang, 'ch2OrderErr').replace('{msg}', ''))
    } finally { setBusy(false) }
  }

  const goProfile = (userId) => {
    getChallengeUserProfile(ch.id, userId)
      .then(r => { if (mounted.current) { setProfile(r.data); setView(VIEWS.user) } })
      .catch(() => {})
  }

  const myRank = lb.find(r => r.is_me)
  const showLb = lb.filter(r => r.virtual !== false)
  const symList = (symbols || []).filter(s =>
    !symQuery || s.symbol.toLowerCase().includes(symQuery.toLowerCase()) || (s.name || '').toLowerCase().includes(symQuery.toLowerCase())
  ).slice(0, 12)
  const isOpen = ch?.status === 'live' || ch?.status === 'open'
  const isEnded = ch?.status === 'ended'
  const paidUnavailable = !FEATURES.paidChallenges && Number(ch?.entry_fee || 0) > 0
  const statusLabel = ch
    ? ch.status === 'live' ? t(lang, 'chLive')
      : ch.status === 'open' ? t(lang, 'chOpen')
        : ch.status === 'upcoming'
          ? (ch.registration_open ? t(lang, 'chOpen') : t(lang, 'chUpcoming'))
          : t(lang, 'chEnded')
    : ''

  const baseNav = (v, label, icon) => (
    <button
      className={`tab-btn ${view === v ? 'active' : ''}`}
      onClick={() => { setView(v); setProfile(null) }}
    >
      {icon}{label}
    </button>
  )

  return (
    <div className="ch-root">
      <div className="ch-bg">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
        <div className="grid-overlay" />
      </div>

      <div className="ch-safe">
        <header className="ch-header">
          <button className="ch-icn" onClick={() => router.push('/community')} aria-label={t(lang, 'back')}>
            <ArrowLeft size={20} />
          </button>
          <div className="ch-head-mid">
            <span className="ch-title">{t(lang, 'ch2Title')}</span>
            {ch && !loading && <span className="ch-sub">{statusLabel}</span>}
          </div>
          <div className="ch-head-side">
            {ch && !loading && (
              <span className={`ch-live-dot ${isOpen && !isEnded ? 'on' : ''}`} title={statusLabel} />
            )}
          </div>
        </header>

        {loading && !ch ? (
          <SkeletonScreen lang={lang} />
        ) : err && !ch ? (
          <div className="ch-state">
            <div className="ch-state-ico"><RefreshCw size={24} /></div>
            <div className="ch-state-t">{err}</div>
            <button className="ch-btn" onClick={loadAll}>{t(lang, 'retry')}</button>
          </div>
        ) : ch ? (
          <>
            {/* ===== NAV ===== */}
            <nav className="ch-nav">
              {baseNav(VIEWS.home, t(lang, 'ch2OpenChallenge'), <Trophy size={15} />)}
              {baseNav(VIEWS.rules, t(lang, 'ch2Rules'), <Target size={15} />)}
              {isOpen && ch.joined && baseNav(VIEWS.portfolio, t(lang, 'ch2Positions'), <Wallet size={15} />)}
              {baseNav(VIEWS.leaderboard, t(lang, 'ch2Leaderboard'), <BarChart3 size={15} />)}
            </nav>

            {view === VIEWS.home && (
              <div className="ch-view">
                <div className="hero-card">
                  <div className="hero-sheen" />
                  <div className="hero-top">
                    <span className="hero-badge"><Flame size={13} /> {t(lang, 'ch2OpenChallenge')}</span>
                    <span className="hero-trophy"><Crown size={26} /></span>
                  </div>
                  <h1 className="hero-name">{ch.name}</h1>
                  <p className="hero-tag">{ch.tagline}</p>

                  <div className="hero-stats">
                    <div className="hs-item">
                      <span className="hs-label">{t(lang, 'ch2Capital')}</span>
                      <span className="hs-value">{fmtXof(ch.starting_capital)}</span>
                    </div>
                    <div className="hs-item">
                      <span className="hs-label">{t(lang, 'ch2Participants').replace('{n}', '')}</span>
                      <span className="hs-value">{ch.participants_count}</span>
                    </div>
                    <div className="hs-item">
                      <span className="hs-label">{t(lang, 'ch2PrizePool')}</span>
                      <span className="hs-value">{fmtXof(ch.prize_pool)}</span>
                    </div>
                  </div>

                  <div className="hero-dates">
                    {ch.start_date && (
                      <div className="hs-item">
                        <span className="hs-label">{t(lang, 'ch2Start')}</span>
                        <span className="hs-value">{fmtDateFull(ch.start_date, lang)}</span>
                      </div>
                    )}
                    {ch.end_date && (
                      <div className="hs-item">
                        <span className="hs-label">{t(lang, 'ch2End')}</span>
                        <span className="hs-value">{fmtDateFull(ch.end_date, lang)}</span>
                      </div>
                    )}
                    {ch.registration_end && (
                      <div className="hs-item">
                        <span className="hs-label">{t(lang, 'ch2RegClose')}</span>
                        <span className="hs-value">{fmtDateFull(ch.registration_end, lang)}</span>
                      </div>
                    )}
                    {!ch.start_date && !ch.end_date && !ch.registration_end && (
                      <div className="hs-item">
                        <span className="hs-label">{t(lang, 'ch2Start')}</span>
                        <span className="hs-value">—</span>
                      </div>
                    )}
                  </div>

                  <div className="hero-actions">
                    {isEnded ? (
                      <div className="hero-end">
                        <span className="hero-end-badge"><Crown size={15} /> {t(lang, 'chEnded')}</span>
                        {(ch.winners || []).length > 0 && (
                          <span className="hero-end-winners">{t(lang, 'chWinners')} · {ch.winners.map(w => w.handle).join(', ')}</span>
                        )}
                      </div>
                    ) : paidUnavailable ? (
                      ch.joined ? (
                        <>
                          <button className="ch-btn ch-big" onClick={() => setView(VIEWS.portfolio)}>
                            {t(lang, 'ch2Enter')} <ChevronRight size={17} />
                          </button>
                        </>
                      ) : (
                        <div className="hero-end">
                          <span className="hero-end-badge"><Lock size={15} /> {t(lang, 'ftUnavailableTitle')}</span>
                        </div>
                      )
                    ) : !isOpen ? (
                      ch.registration_open ? (
                        ch.joined ? (
                          <div className="hero-end">
                            <span className="hero-end-badge"><CheckCircle2 size={15} /> {t(lang, 'ch2Joined')}</span>
                          </div>
                        ) : ch.payment_pending ? (
                          <>
                            <button className="ch-btn ch-big" onClick={doJoin} disabled={busy}>
                              {busy ? t(lang, 'loading') : t(lang, 'ch2PayResume')} <CreditCard size={17} />
                            </button>
                            <span className="hero-fee">{t(lang, 'ch2PayPending')}</span>
                          </>
                        ) : (
                          <>
                            <button className="ch-btn ch-big" onClick={doJoin} disabled={busy}>
                              {busy ? t(lang, 'loading') : t(lang, 'ch2Join')} <Sparkles size={17} />
                            </button>
                            {ch.entry_fee > 0 && (
                              <span className="hero-fee">{t(lang, 'ch2Fee').replace('{fee}', fmtXof(ch.entry_fee))}</span>
                            )}
                          </>
                        )
                      ) : (
                        <div className="hero-end">
                          <span className="hero-end-badge"><Flame size={15} /> {t(lang, 'chUpcoming')}</span>
                        </div>
                      )
                    ) : ch.joined ? (
                      <>
                        <button className="ch-btn ch-big" onClick={() => setView(VIEWS.portfolio)}>
                          {t(lang, 'ch2Enter')} <ChevronRight size={17} />
                        </button>
                        {myRank && (
                          <div className="hero-rank">
                            <Medal size={16} /> {t(lang, 'ch2Rank')} · {myRank.rank}e — {fmtPct(myRank.perf)}
                          </div>
                        )}
                      </>
                    ) : (
                      <button className="ch-btn ch-big" onClick={doJoin} disabled={busy}>
                        {busy ? t(lang, 'loading') : t(lang, 'ch2Join')} <Sparkles size={17} />
                      </button>
                    )}
                    {isOpen && !ch.joined && !ch.payment_pending && ch.entry_fee > 0 && (
                      <span className="hero-fee">{t(lang, 'ch2Fee').replace('{fee}', fmtXof(ch.entry_fee))}</span>
                    )}
                    {ch.payment_pending && !ch.joined && isOpen && (
                      <>
                        <button className="ch-btn ch-big" onClick={doJoin} disabled={busy}>
                          {busy ? t(lang, 'loading') : t(lang, 'ch2PayResume')} <CreditCard size={17} />
                        </button>
                        <span className="hero-fee">{t(lang, 'ch2PayPending')}</span>
                      </>
                    )}
                  </div>
                  {err && view === VIEWS.home && (
                    <div className="ch-join-err">{err}</div>
                  )}
                </div>

                <GlassCard className="how-card">
                  <button className="how-head" onClick={() => setView(VIEWS.rules)}>
                    <div className="gc-title"><Zap size={16} /> {t(lang, 'ch2HowItWorks')}</div>
                    <span className="how-chev"><ChevronRight size={16} /></span>
                  </button>
                  <div className="steps">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div className="step" key={i}>
                        <span className="step-n">{i}</span>
                        <span className="step-t">{t(lang, `ch2Steps${i}`)}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <div className="rules-preview">
                  <div className="gc-title"><Target size={16} /> {t(lang, 'ch2Rules')}</div>
                  {(ch.rules || []).slice(0, 3).map((r, i) => (
                    <div className="rule-row" key={i}><CheckCircle2 size={15} />{r}</div>
                  ))}
                  <button className="ch-link" onClick={() => setView(VIEWS.rules)}>
                    {t(lang, 'ch2Rules')} <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {view === VIEWS.rules && (
              <div className="ch-view">
                <div className="rw-hero">
                  <span className="rw-badge"><Zap size={13} /> {t(lang, 'ch2HowItWorks')}</span>
                  <h2 className="rw-title">{t(lang, 'ch2Rules')}</h2>
                  <p className="rw-sub">{t(lang, 'ch2RulesSub')}</p>
                </div>

                <GlassCard>
                  <div className="rw-steps">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div className="rw-step" key={i}>
                        <div className="rw-track">
                          <span className="rw-n">{i}</span>
                          {i < 5 && <span className="rw-line" />}
                        </div>
                        <span className="rw-t">{t(lang, `ch2Steps${i}`)}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard>
                  <div className="gc-title"><Target size={16} /> {t(lang, 'ch2Rules')}</div>
                  <div className="rw-rules">
                    {(ch.rules || []).map((r, i) => (
                      <div className="rw-rule" key={i}>
                        <span className="rw-rule-n">{i + 1}</span>
                        <span className="rw-rule-t">{r}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                {isOpen && !ch.joined && !paidUnavailable && (
                  <button className="ch-btn ch-big" onClick={doJoin} disabled={busy}>
                    {busy ? t(lang, 'loading') : t(lang, 'ch2Join')} <Sparkles size={17} />
                  </button>
                )}
              </div>
            )}

            {view === VIEWS.portfolio && (
              <div className="ch-view">
                {!ch.joined ? (
                  <GlassCard>
                    <div className="gc-title">{t(lang, 'ch2JoinSub')}</div>
                    {paidUnavailable
                      ? <div className="hero-end"><span className="hero-end-badge"><Lock size={15} /> {t(lang, 'ftUnavailableTitle')}</span></div>
                      : <button className="ch-btn ch-big" onClick={doJoin} disabled={busy}>
                          {t(lang, 'ch2Join')}
                        </button>}
                  </GlassCard>
                ) : portfolio ? (
                  <>
                    <div className="pf-hero">
                      <div className="pf-hero-top">
                        <span className="pf-label">{t(lang, 'ch2Value')}</span>
                        {myRank && <span className="pf-rank"><Medal size={13} /> #{myRank.rank}</span>}
                      </div>
                      <div className="pf-value">{fmtXof(portfolio.value)}</div>
                      <div className="pf-perf">{fmtPct(portfolio.perf)}</div>
                      <div className="pf-cash-line">{t(lang, 'ch2Cash')} : {fmtXof(portfolio.cash)}</div>
                      <Spark data={portfolio.sparkline} height={72} />
                    </div>

                    <div className="pf-grid">
                      <GlassCard className="pf-stat">
                        <span className="pf-stat-l">{t(lang, 'ch2Cash')}</span>
                        <span className="pf-stat-v">{fmtXof(portfolio.cash)}</span>
                      </GlassCard>
                      <GlassCard className="pf-stat">
                        <span className="pf-stat-l">{t(lang, 'ch2Invested')}</span>
                        <span className="pf-stat-v">{fmtXof(portfolio.invested)}</span>
                      </GlassCard>
                      <GlassCard className="pf-stat">
                        <span className="pf-stat-l">{t(lang, 'ch2TradesN')}</span>
                        <span className="pf-stat-v">{portfolio.trades_count}</span>
                      </GlassCard>
                    </div>

                    <div className="order-bar">
                      <button className="buy-btn" onClick={() => openOrder('buy')}>
                        <TrendingUp size={16} /> {t(lang, 'ch2Buy')}
                      </button>
                      <button className="sell-btn" onClick={() => openOrder('sell')}>
                        <TrendingDown size={16} /> {t(lang, 'ch2Sell')}
                      </button>
                    </div>

                    <GlassCard>
                      <div className="gc-title"><Wallet size={16} /> {t(lang, 'ch2Positions')}</div>
                      {portfolio.positions.length === 0 ? (
                        <div className="ch-empty">{t(lang, 'ch2NoPositions')}</div>
                      ) : (
                        <div className="pos-list">
                          {portfolio.positions.map(p => (
                            <div className="pos-row" key={p.symbol}>
                              <div className="pos-main">
                                <span className="pos-sym">{p.symbol}</span>
                                <span className="pos-sub">{p.qty} × {fmtNum(p.avg_price)}</span>
                              </div>
                              <div className="pos-right">
                                <span className="pos-val">{fmtXof(p.value)}</span>
                                <span className={`pos-pnl ${p.pnl >= 0 ? 'ch-up' : 'ch-down'}`}>{fmtPct(p.pnl_pct)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassCard>

                    <GlassCard>
                      <div className="gc-title"><LayoutGrid size={16} /> {t(lang, 'ch2Trades')}</div>
                      {portfolio.trades.length === 0 ? (
                        <div className="ch-empty">{t(lang, 'ch2NoTrades')}</div>
                      ) : (
                        <div className="trade-list">
                          {portfolio.trades.map(tr => (
                            <div className="trade-row" key={tr.id}>
                              <span className={`trade-side ${tr.side}`}>{tr.side === 'buy' ? 'B' : 'S'}</span>
                              <div className="trade-main">
                                <span className="trade-sym">{tr.symbol}</span>
                                <span className="trade-sub">{tr.qty} @ {fmtNum(tr.price)}</span>
                              </div>
                              <div className="trade-right">
                                <span className="trade-total">{fmtXof(tr.total)}</span>
                                <span className="trade-date">{fmtDate(tr.created_at, lang)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassCard>
                  </>
                ) : (
                  <div className="ch-loading">
                    <TriLoader compact label={t(lang, 'loading')} />
                  </div>
                )}
              </div>
            )}

            {view === VIEWS.leaderboard && (
              <div className="ch-view">
                <div className="lb-head">
                  <div className="gc-title"><BarChart3 size={16} /> {t(lang, 'ch2Leaderboard')}</div>
                  <span className="lb-count">{t(lang, 'ch2Participants').replace('{n}', lb.length)}</span>
                </div>

                {showLb.length === 0 ? (
                  <GlassCard><div className="ch-empty">{t(lang, 'ch2JoinSub')}</div></GlassCard>
                ) : (
                  <div className="lb-list">
                    {showLb.slice(0, 3).map((r, i) => (
                      <div className={`podium rank-${i + 1}`} key={r.user_id} onClick={() => goProfile(r.user_id)}>
                        <span className="podium-n">{i === 0 ? <Crown size={20} /> : i + 1}</span>
                        <img className="podium-av" src={r.avatar} alt={r.handle} />
                        <div className="podium-main">
                          <span className="podium-name">{r.handle}{r.is_me ? ' · vous' : ''}</span>
                          <span className="podium-sub">{fmtXof(r.value)}</span>
                        </div>
                        <span className={`podium-perf ${r.perf >= 0 ? 'ch-up' : 'ch-down'}`}>{fmtPct(r.perf)}</span>
                      </div>
                    ))}
                    <div className="lb-rest">
                      {showLb.slice(3).map(r => (
                        <div className="lb-row" key={r.user_id} onClick={() => goProfile(r.user_id)}>
                          <span className="lb-rank">{r.rank}</span>
                          <img className="lb-av" src={r.avatar} alt={r.handle} />
                          <span className="lb-name">{r.handle}{r.is_me ? ' · vous' : ''}</span>
                          {r.trades_count > 0 && <span className="lb-trades"><Zap size={11} /> {r.trades_count}</span>}
                          <span className={`lb-perf ${r.perf >= 0 ? 'ch-up' : 'ch-down'}`}>{fmtPct(r.perf)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === VIEWS.user && profile && (
              <div className="ch-view">
                <GlassCard className="u-card">
                  <div className="u-top">
                    <img className="u-av" src={profile.avatar} alt={profile.handle} />
                    <div className="u-info">
                      <span className="u-name">{profile.handle}{profile.is_me ? ' · vous' : ''}</span>
                      <span className="u-sub">
                        {t(lang, 'ch2JoinedOn').replace('{date}', fmtDate(profile.joined_at, lang))}
                        {profile.rank ? ` · #${profile.rank}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="u-stats">
                    <div className="u-stat">
                      <span className="u-stat-l">{t(lang, 'ch2Perf')}</span>
                      <span className={`u-stat-v ${profile.perf?.perf >= 0 ? 'ch-up' : 'ch-down'}`}>{fmtPct(profile.perf?.perf)}</span>
                    </div>
                    <div className="u-stat">
                      <span className="u-stat-l">{t(lang, 'ch2Value')}</span>
                      <span className="u-stat-v">{fmtXof(profile.perf?.value)}</span>
                    </div>
                    <div className="u-stat">
                      <span className="u-stat-l">{t(lang, 'ch2Cash')}</span>
                      <span className="u-stat-v">{fmtXof(profile.cash)}</span>
                    </div>
                  </div>
                  <Spark data={profile.sparkline} height={70} />
                </GlassCard>

                <GlassCard>
                  <div className="gc-title">{t(lang, 'ch2PublicPositions').replace('{handle}', profile.handle)}</div>
                  {!profile.positions || profile.positions.length === 0 ? (
                    <div className="ch-empty">—</div>
                  ) : (
                    <div className="pos-list">
                      {profile.positions.map(p => (
                        <div className="pos-row" key={p.symbol}>
                          <div className="pos-main">
                            <span className="pos-sym">{p.symbol}</span>
                            <span className="pos-sub">{p.qty} × {fmtNum(p.avg_price)}</span>
                          </div>
                          <div className="pos-right">
                            <span className="pos-val">{fmtXof(p.value)}</span>
                            <span className={`pos-pnl ${p.pnl >= 0 ? 'ch-up' : 'ch-down'}`}>{fmtPct(p.pnl_pct)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>

                {profile.trades && profile.trades.length > 0 && (
                  <GlassCard>
                    <div className="gc-title">{t(lang, 'ch2PublicTrades').replace('{handle}', profile.handle)}</div>
                    <div className="trade-list">
                      {profile.trades.map(tr => (
                        <div className="trade-row" key={tr.id}>
                          <span className={`trade-side ${tr.side}`}>{tr.side === 'buy' ? 'B' : 'S'}</span>
                          <div className="trade-main">
                            <span className="trade-sym">{tr.symbol}</span>
                            <span className="trade-sub">{tr.qty} @ {fmtNum(tr.price)}</span>
                          </div>
                          <div className="trade-right">
                            <span className="trade-total">{fmtXof(tr.total)}</span>
                            <span className="trade-date">{fmtDate(tr.created_at, lang)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {ch.joined && profile.is_me && (
                  <button className="ch-link danger" onClick={doLeave} disabled={busy}>
                    {t(lang, 'ch2Leave')}
                  </button>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      {orderOpen && (
        <div className="modal-bg" onClick={() => setOrderOpen(false)}>
          <div className="order-modal" onClick={e => e.stopPropagation()}>
            <div className="om-head">
              <span className={`om-title ${orderSide}`}>
                {orderSide === 'buy' ? t(lang, 'ch2Buy') : t(lang, 'ch2Sell')} — {t(lang, 'ch2Cash')} : {fmtXof(portfolio?.cash)}
              </span>
              <button className="ch-icn" onClick={() => setOrderOpen(false)}><X size={18} /></button>
            </div>

            <div className="om-field">
              <div className="om-label">{t(lang, 'ch2Symbol')}</div>
              <div className="om-search">
                <Search size={14} />
                <input
                  value={symQuery}
                  onChange={e => setSymQuery(e.target.value)}
                  placeholder="SNTS, SIBC…"
                  autoCapitalize="characters"
                />
              </div>
              {symList.length > 0 && (
                <div className="sym-list">
                  {symList.map(s => (
                    <button
                      key={s.symbol}
                      className={`sym-opt ${orderSymbol === s.symbol ? 'active' : ''}`}
                      onClick={() => { setOrderSymbol(s.symbol); setSymQuery(s.symbol) }}
                    >
                      <span className="sym-code">{s.symbol}</span>
                      <span className="sym-name">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="om-field">
              <div className="om-label">{t(lang, 'ch2Qty')}</div>
              <input
                className="om-input"
                type="number"
                min="1"
                value={orderQty}
                onChange={e => setOrderQty(e.target.value)}
              />
            </div>

            <div className="om-total">
              <span>{t(lang, 'ch2EstTotal')}</span>
              <b>{fmtXof(parseFloat(orderQty || 0))}</b>
            </div>

            {orderErr && <div className="ch-err">{orderErr}</div>}

            <button
              className={`ch-btn ch-big ${orderSide === 'sell' ? 'ch-btn-sell' : ''}`}
              onClick={submitOrder}
              disabled={busy || !orderSymbol}
            >
              {busy ? t(lang, 'loading') : orderSide === 'buy' ? t(lang, 'ch2Buy') : t(lang, 'ch2Sell')}
            </button>
          </div>
        </div>
      )}

      <BottomNav active="community" />
      <style jsx global>{`
        .ch-root {
          --green: #1ED760;
          --green-soft: rgba(30,215,96,0.14);
          --violet: #8B5CF6;
          --blue: #4C8DFF;
          --red: #F04438;
          --text: #F6F7F9;
          --text-2: #9AA3B2;
          --text-3: #6f7c8c;
          --line: rgba(255,255,255,0.09);
          --card-bg: linear-gradient(155deg, rgba(255,255,255,0.085), rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.055));
          display: flex; flex-direction: column; height: 100dvh;
          background: #05070b; color: var(--text);
          font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
          overflow: hidden; position: relative;
          /* #__next est display:flex : sans width/flex, la page se rétracte
             à la largeur de son contenu (écran de chargement écrasé à gauche). */
          width: 100%; flex: 1; min-width: 0;
        }
        .ch-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .blob { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.5; }
        .b1 { width: 400px; height: 400px; background: radial-gradient(circle, #1ED760, transparent 70%); top: -140px; right: -110px; opacity: 0.24; }
        .b2 { width: 440px; height: 440px; background: radial-gradient(circle, #4C8DFF, transparent 70%); top: 32%; left: -180px; opacity: 0.15; }
        .b3 { width: 380px; height: 380px; background: radial-gradient(circle, #8B5CF6, transparent 70%); bottom: -160px; right: -90px; opacity: 0.18; }
        .grid-overlay {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 75%);
        }

        .ch-safe {
          flex: 1; padding: 0 16px 88px; overflow-y: auto; position: relative; z-index: 1;
          display: flex; flex-direction: column;
          scrollbar-width: none;
        }
        .ch-safe::-webkit-scrollbar { display: none; }

        .ch-header {
          position: sticky; top: 0; z-index: 20;
          display: flex; align-items: center; justify-content: space-between;
          height: 64px; flex-shrink: 0; margin: 0 -16px; padding: 0 16px;
          background: linear-gradient(180deg, rgba(5,7,11,0.96), rgba(7,10,15,0.92) 78%, rgba(7,10,15,0.7));
          backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 12px 32px rgba(0,0,0,0.35);
        }
        .ch-head-mid { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .ch-title {
          font-size: 17px; font-weight: 700; letter-spacing: -0.02em;
          background: linear-gradient(120deg, #fff, #b8e6cd);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        }
        .ch-sub { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--green); }
        .ch-head-side { width: 40px; display: flex; align-items: center; justify-content: center; }
        .ch-live-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: rgba(255,255,255,0.18); border: 2px solid rgba(255,255,255,0.1);
        }
        .ch-live-dot.on {
          background: var(--green); border-color: rgba(30,215,96,0.35);
          box-shadow: 0 0 12px rgba(30,215,96,0.7);
          animation: pulseDot 1.6s ease-in-out infinite;
        }
        .ch-icn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06); border: 1px solid var(--line);
          border-radius: 13px; color: var(--text); cursor: pointer;
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          transition: background 0.15s, transform 0.15s, border-color 0.15s;
        }
        .ch-icn:hover { border-color: rgba(255,255,255,0.18); }
        .ch-icn:active { transform: scale(0.94); background: rgba(255,255,255,0.11); }

        .ch-nav {
          display: flex; gap: 6px; padding: 5px; border-radius: 18px;
          background: rgba(255,255,255,0.05); border: 1px solid var(--line);
          backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%);
          overflow-x: auto; flex-shrink: 0; margin-bottom: 16px;
          scrollbar-width: none;
        }
        .ch-nav::-webkit-scrollbar { display: none; }
        .tab-btn {
          position: relative; flex-shrink: 0; display: flex; align-items: center; gap: 6px;
          padding: 9px 15px; border: none; border-radius: 13px;
          background: none; color: var(--text-2); font-family: inherit;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: color 0.18s ease-out, background 0.18s ease-out, transform 0.12s;
        }
        .tab-btn:active { transform: scale(0.97); }
        .tab-btn.active {
          color: #0b1f14;
          background: linear-gradient(135deg, #3ef191, #1ED760 55%, #0fbf4f);
          box-shadow: 0 6px 22px rgba(30,215,96,0.35), inset 0 1px 0 rgba(255,255,255,0.45);
          font-weight: 700;
        }

        .ch-view { display: flex; flex-direction: column; gap: 16px; animation: fadeUp 0.35s ease both; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        .gl-card {
          position: relative;
          background: var(--card-bg);
          border: 1px solid var(--line);
          border-radius: 24px;
          backdrop-filter: blur(26px) saturate(160%); -webkit-backdrop-filter: blur(26px) saturate(160%);
          box-shadow: 0 18px 44px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.3);
          padding: 18px;
        }
        .gl-card::before {
          content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
          background: linear-gradient(135deg, rgba(255,255,255,0.09), transparent 38%);
        }
        .gc-title { position: relative; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700;
          color: #e8edf4; letter-spacing: -0.01em; margin-bottom: 13px; }
        .gc-title svg { color: var(--green); }

        .hero-card {
          position: relative; overflow: hidden; padding: 24px 22px 20px;
          border-radius: 30px;
          background:
            radial-gradient(130% 100% at 12% 0%, rgba(30,215,96,0.26), transparent 55%),
            radial-gradient(115% 85% at 100% 100%, rgba(139,92,246,0.2), transparent 60%),
            radial-gradient(100% 80% at 85% 0%, rgba(76,141,255,0.12), transparent 55%),
            linear-gradient(165deg, rgba(30,215,96,0.1), rgba(16,20,27,0.82) 65%);
          border: 1px solid rgba(255,255,255,0.13);
          backdrop-filter: blur(30px) saturate(160%); -webkit-backdrop-filter: blur(30px) saturate(160%);
          box-shadow: 0 34px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2),
            inset 0 -24px 44px rgba(0,0,0,0.28);
        }
        .hero-card::after {
          content: ''; position: absolute; top: -70%; left: -40%; width: 60%; height: 240%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.1), transparent);
          transform: rotate(18deg) translateX(-120%);
          animation: sheen 7s ease-in-out infinite; pointer-events: none;
        }
        @keyframes sheen {
          0%, 55% { transform: rotate(18deg) translateX(-140%); }
          85%, 100% { transform: rotate(18deg) translateX(320%); }
        }
        .hero-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;
          letter-spacing: 0.07em; text-transform: uppercase; color: #4dff9e;
          background: rgba(30,215,96,0.15); border: 1px solid rgba(30,215,96,0.38);
          padding: 6px 12px; border-radius: 99px;
          box-shadow: 0 0 20px rgba(30,215,96,0.18);
        }
        .hero-badge::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%; background: #4dff9e;
          box-shadow: 0 0 10px #4dff9e; animation: pulseDot 1.6s ease-in-out infinite;
        }
        @keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .hero-trophy { color: #3ee885; filter: drop-shadow(0 8px 22px rgba(30,215,96,0.5)); }
        .hero-name {
          font-size: 26px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.1;
          margin-bottom: 8px; text-wrap: balance;
          background: linear-gradient(120deg, #fff 30%, #b9f6d4);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        }
        .hero-tag { font-size: 13.5px; font-weight: 500; color: #a9b6c8; line-height: 1.55; max-width: 94%; }

        .hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin: 20px 0 12px; }
        .hero-dates { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 9px; margin-bottom: 18px; }
        .hero-dates .hs-value { font-size: 13px; }
        .hs-item {
          position: relative;
          background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px; padding: 13px 8px; text-align: center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.09), 0 10px 26px rgba(0,0,0,0.25);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .hs-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: #8b96a6; margin-bottom: 5px; }
        .hs-value { font-size: 15.5px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }

        .hero-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .hero-fee {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; font-weight: 600; color: #ffd166;
          background: rgba(255,209,102,0.1); border: 1px solid rgba(255,209,102,0.28);
          padding: 8px 14px; border-radius: 12px;
        }
        .ch-join-err {
          margin-top: 12px; font-size: 12.5px; font-weight: 600; color: #ff8a80;
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          padding: 10px 14px; border-radius: 12px; line-height: 1.4;
        }
        .ch-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          border: none; cursor: pointer; font-family: inherit;
          font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: #06130b;
          background: linear-gradient(145deg, #3ef191, #1ED760 55%, #12b855);
          border-radius: 17px; padding: 14px 24px;
          box-shadow: 0 12px 30px rgba(29,185,84,0.4), inset 0 1px 0 rgba(255,255,255,0.45),
            inset 0 -2px 6px rgba(0,60,25,0.35);
          transition: transform 0.14s ease-out, filter 0.14s, box-shadow 0.14s;
        }
        .ch-btn:hover { filter: brightness(1.06); }
        .ch-btn:active { transform: translateY(1.5px) scale(0.985); box-shadow: 0 7px 18px rgba(29,185,84,0.32); }
        .ch-btn:disabled { opacity: 0.6; }
        .ch-btn.ch-big { flex: 1; min-height: 52px; }
        .ch-btn.btn-sell { background: linear-gradient(145deg, #ff8a7d, #F04438 55%, #d6372b); color: #2a0603;
          box-shadow: 0 12px 30px rgba(240,68,56,0.38), inset 0 1px 0 rgba(255,255,255,0.35); }
        .hero-rank { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; color: #dfe5ee; }
        .hero-rank svg { color: var(--green); }
        .hero-end { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; flex: 1; }
        .hero-end-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-2);
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
          padding: 9px 15px; border-radius: 99px; }
        .hero-end-winners { font-size: 13px; color: #dfe5ee; font-weight: 600; }

        .how-card { margin-top: 2px; }
        .how-head {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          background: none; border: none; cursor: pointer; padding: 0; margin-bottom: 4px;
          font-family: inherit;
        }
        .how-head .gc-title { margin-bottom: 0; }
        .how-chev {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border-radius: 9px; color: var(--green);
          background: rgba(30,215,96,0.12); border: 1px solid rgba(30,215,96,0.25);
          transition: transform 0.15s;
        }
        .how-head:active .how-chev { transform: translateX(2px); }
        .steps { display: flex; flex-direction: column; gap: 11px; }
        .step { display: flex; align-items: flex-start; gap: 12px; }
        .step-n {
          position: relative; flex-shrink: 0; width: 26px; height: 26px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; color: #0b1f14;
          background: linear-gradient(135deg, #3ef191, #12b855);
          box-shadow: 0 4px 14px rgba(30,215,96,0.3);
        }
        .step-t { font-size: 13px; font-weight: 500; color: #c6cedb; line-height: 1.5; padding-top: 2px; }

        .rules-preview { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
        .rule-row { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; font-weight: 500;
          color: #b8c2d0; line-height: 1.5; }
        .rule-row.ch-full { padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.07); align-items: flex-start; }
        .rule-row.ch-full:last-child { border-bottom: none; }
        .rule-row svg { color: var(--green); flex-shrink: 0; margin-top: 2px; }
        .rule-n { flex-shrink: 0; width: 22px; font-size: 12px; font-weight: 800; color: var(--green); }
        .rule-list { display: flex; flex-direction: column; }
        .ch-link {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 4px;
          background: none; border: none; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 700; color: var(--green); padding: 7px 0;
          transition: opacity 0.15s;
        }
        .ch-link:active { opacity: 0.7; }
        .ch-link.danger { color: #ff7a6b; margin-top: 4px; }

        .rw-hero {
          position: relative; overflow: hidden; padding: 26px 22px 22px;
          border-radius: 30px;
          background:
            radial-gradient(120% 90% at 85% 0%, rgba(139,92,246,0.22), transparent 55%),
            radial-gradient(110% 80% at 0% 100%, rgba(30,215,96,0.14), transparent 55%),
            linear-gradient(160deg, rgba(30,215,96,0.08), rgba(16,20,27,0.85) 60%);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(26px) saturate(160%); -webkit-backdrop-filter: blur(26px) saturate(160%);
          box-shadow: 0 26px 60px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.16);
        }
        .rw-badge {
          display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;
          letter-spacing: 0.07em; text-transform: uppercase; color: #d8b4ff;
          background: rgba(139,92,246,0.16); border: 1px solid rgba(139,92,246,0.38);
          padding: 6px 12px; border-radius: 99px; margin-bottom: 12px;
        }
        .rw-title {
          font-size: 25px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.12; margin-bottom: 7px;
          background: linear-gradient(120deg, #fff 35%, #e4d0ff);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        }
        .rw-sub { font-size: 13.5px; font-weight: 500; color: #a9b6c8; line-height: 1.55; max-width: 92%; }

        .rw-steps { display: flex; flex-direction: column; }
        .rw-step { display: flex; align-items: flex-start; gap: 13px; }
        .rw-track { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
        .rw-n {
          position: relative; width: 30px; height: 30px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: #0b1f14;
          background: linear-gradient(135deg, #3ef191, #12b855);
          box-shadow: 0 5px 16px rgba(30,215,96,0.32), inset 0 1px 0 rgba(255,255,255,0.4);
        }
        .rw-line {
          width: 2px; flex: 1; min-height: 22px; margin: 4px 0;
          background: linear-gradient(180deg, rgba(30,215,96,0.45), rgba(30,215,96,0.08));
        }
        .rw-t {
          font-size: 13.5px; font-weight: 500; color: #c6cedb; line-height: 1.55;
          padding: 4px 0 18px; text-wrap: balance;
        }
        .rw-step:last-child .rw-t { padding-bottom: 2px; }

        .rw-rules { display: flex; flex-direction: column; gap: 9px; }
        .rw-rule {
          display: flex; align-items: flex-start; gap: 12px;
          background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 15px; padding: 12px 13px;
          transition: border-color 0.15s, background 0.15s;
        }
        .rw-rule:active { border-color: rgba(30,215,96,0.3); background: rgba(255,255,255,0.07); }
        .rw-rule-n {
          flex-shrink: 0; width: 24px; height: 24px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11.5px; font-weight: 800; color: var(--green);
          background: rgba(30,215,96,0.14); border: 1px solid rgba(30,215,96,0.28);
        }
        .rw-rule-t { font-size: 13px; font-weight: 500; color: #b8c2d0; line-height: 1.5; padding-top: 1px; }

        .pf-hero {
          position: relative; overflow: hidden; padding: 22px 20px 10px;
          border-radius: 28px;
          background:
            radial-gradient(130% 100% at 18% 0%, rgba(76,141,255,0.24), transparent 55%),
            radial-gradient(110% 90% at 100% 100%, rgba(30,215,96,0.14), transparent 60%),
            linear-gradient(165deg, rgba(76,141,255,0.07), rgba(16,20,27,0.85) 65%);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(26px) saturate(160%); -webkit-backdrop-filter: blur(26px) saturate(160%);
          box-shadow: 0 26px 60px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.16);
        }
        .pf-hero-top { display: flex; justify-content: space-between; align-items: center; }
        .pf-label { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #8b96a6; }
        .pf-rank { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800;
          color: #0b1f14; background: linear-gradient(135deg, #3ef191, #12b855);
          padding: 4px 10px; border-radius: 99px; box-shadow: 0 4px 14px rgba(30,215,96,0.3); }
        .pf-value { font-size: 36px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.12;
          margin: 8px 0 4px; font-variant-numeric: tabular-nums; }
        .pf-perf { display: inline-block; font-size: 13px; font-weight: 800; margin-bottom: 8px;
          padding: 4px 10px; border-radius: 9px; }
        .pf-perf { background: var(--green-soft); color: var(--green); }
        .pf-cash-line { font-size: 11.5px; font-weight: 600; color: #8b96a6; margin: -2px 0 8px;
          font-variant-numeric: tabular-nums; }
        .ch-up { color: var(--green); }
        .ch-down { color: #ff6b5e; }

        .pf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .pf-stat { padding: 15px 12px; }
        .pf-stat-l { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: #8b96a6; margin-bottom: 6px; }
        .pf-stat-v { font-size: 15px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }

        .order-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .buy-btn, .sell-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 15px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.1);
          cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 800;
          backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
          transition: transform 0.14s ease-out, filter 0.14s;
        }
        .buy-btn { background: linear-gradient(145deg, rgba(30,215,96,0.28), rgba(30,215,96,0.09)); color: #3ee885;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.15); }
        .sell-btn { background: linear-gradient(145deg, rgba(240,68,56,0.26), rgba(240,68,56,0.07)); color: #ff7a6b;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.15); }
        .buy-btn:active, .sell-btn:active { transform: scale(0.97); }

        .pos-list, .trade-list { display: flex; flex-direction: column; }
        .pos-row, .trade-row {
          display: flex; align-items: center; gap: 10px; padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          transition: background 0.12s;
        }
        .pos-row:last-child, .trade-row:last-child { border-bottom: none; }
        .pos-main, .trade-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .pos-sym, .trade-sym { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
        .pos-sub, .trade-sub { font-size: 11.5px; font-weight: 500; color: #8b96a6; font-variant-numeric: tabular-nums; }
        .pos-right, .trade-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .pos-val, .trade-total { font-size: 13.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .pos-pnl { font-size: 11.5px; font-weight: 800; }
        .trade-side {
          flex-shrink: 0; width: 28px; height: 28px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800;
        }
        .trade-side.buy { background: rgba(30,215,96,0.16); color: var(--green); border: 1px solid rgba(30,215,96,0.32); }
        .trade-side.sell { background: rgba(240,68,56,0.15); color: #ff7a6b; border: 1px solid rgba(240,68,56,0.32); }
        .trade-date { font-size: 10.5px; color: #6f7c8c; font-weight: 500; }

        .lb-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 2px; }
        .lb-head .gc-title { margin-bottom: 0; }
        .lb-count { font-size: 12px; font-weight: 700; color: #8b96a6; }
        .lb-list { display: flex; flex-direction: column; }
        .podium {
          display: flex; align-items: center; gap: 13px; padding: 16px 15px; margin-bottom: 10px;
          border-radius: 22px; cursor: pointer;
          background: linear-gradient(150deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04));
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%);
          box-shadow: 0 14px 34px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.14);
          transition: transform 0.12s;
        }
        .podium:active { transform: scale(0.985); }
        .rank-1 {
          border-color: rgba(222,179,62,0.5);
          background: linear-gradient(150deg, rgba(222,179,62,0.14), rgba(255,255,255,0.04));
          box-shadow: 0 18px 44px rgba(222,179,62,0.14), inset 0 1px 0 rgba(255,255,255,0.18);
        }
        .rank-2 { border-color: rgba(200,210,225,0.32); }
        .rank-3 { border-color: rgba(240,160,61,0.32); }
        .podium-n { width: 32px; text-align: center; font-size: 17px; font-weight: 800; color: #e6ebf2; }
        .rank-1 .podium-n { color: #f0cf6d; }
        .rank-2 .podium-n { color: #c4ccd8; }
        .rank-3 .podium-n { color: #e0a05e; }
        .podium-av, .lb-av, .u-av {
          width: 44px; height: 44px; border-radius: 15px; object-fit: cover;
          border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0;
          box-shadow: 0 6px 16px rgba(0,0,0,0.4);
        }
        .podium-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .podium-name { font-size: 14.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .podium-sub { font-size: 11.5px; font-weight: 500; color: #8b96a6; font-variant-numeric: tabular-nums; }
        .podium-perf { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .lb-rest { display: flex; flex-direction: column; padding: 0 6px; margin-top: 2px; }
        .lb-rest .lb-row:first-child { border-top: 1px solid rgba(255,255,255,0.06); }
        .lb-row {
          display: flex; align-items: center; gap: 11px; padding: 12px 6px; cursor: pointer;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          transition: background 0.12s;
        }
        .lb-row:active { background: rgba(255,255,255,0.04); }
        .lb-row:last-child { border-bottom: none; }
        .lb-rank { width: 26px; font-size: 12.5px; font-weight: 700; color: #8b96a6; font-variant-numeric: tabular-nums; }
        .lb-av { width: 36px; height: 36px; border-radius: 12px; }
        .lb-name { flex: 1; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lb-trades { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 700;
          color: #b08cff; background: rgba(139,92,246,0.16); padding: 3px 8px; border-radius: 99px;
          border: 1px solid rgba(139,92,246,0.25); }
        .lb-perf { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }

        .u-card { padding: 20px 18px; }
        .u-top { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
        .u-av { width: 58px; height: 58px; border-radius: 20px; }
        .u-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .u-name { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .u-sub { font-size: 12px; font-weight: 500; color: #8b96a6; }
        .u-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-bottom: 16px; }
        .u-stat {
          background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 11px 8px; text-align: center;
        }
        .u-stat-l { display: block; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: #8b96a6; margin-bottom: 4px; }
        .u-stat-v { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }

        .ch-empty { font-size: 13px; font-weight: 500; color: #7d8999; padding: 14px 0 6px; text-align: center; }
        .ch-err { font-size: 12.5px; font-weight: 600; color: #ff8a7d; background: rgba(240,68,56,0.12);
          border: 1px solid rgba(240,68,56,0.3); border-radius: 13px; padding: 11px 13px; margin-bottom: 10px; }

        .ch-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; padding: 70px 24px; text-align: center; animation: fadeUp 0.35s ease both; }
        .ch-state-ico { width: 62px; height: 62px; border-radius: 22px; display: flex; align-items: center; justify-content: center;
          background: rgba(240,68,56,0.13); border: 1px solid rgba(240,68,56,0.3); color: #ff8a7d;
          box-shadow: 0 16px 38px rgba(240,68,56,0.16); }
        .ch-state-t { font-size: 14px; font-weight: 500; color: var(--text-2); line-height: 1.55; max-width: 310px; }

        .sk { position: relative; overflow: hidden; border-radius: 10px;
          background: rgba(255,255,255,0.08); height: 14px; }
        .sk::after { content: ''; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.13) 50%, transparent 70%);
          animation: skShimmer 1.5s ease-in-out infinite; transform: translateX(-100%); }
        @keyframes skShimmer { to { transform: translateX(100%); } }
        .sk-l { height: 16px; } .sk-m { height: 13px; } .sk-s { height: 10px; }
        .sk-hero {
          position: relative; overflow: hidden; padding: 24px 22px;
          border-radius: 30px; display: flex; flex-direction: column; gap: 13px;
          background: radial-gradient(120% 90% at 15% 0%, rgba(30,215,96,0.15), transparent 55%),
            linear-gradient(160deg, rgba(30,215,96,0.06), rgba(20,24,31,0.75) 60%);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .sk-top { display: flex; justify-content: space-between; align-items: center; }
        .sk-badge { height: 26px; border-radius: 99px; }
        .sk-ico { width: 34px; height: 34px; border-radius: 13px; }
        .sk-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-top: 8px; }
        .sk-stat { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px; padding: 13px 8px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
        .sk-btn { height: 52px; border-radius: 17px; margin-top: 6px;
          background: linear-gradient(145deg, rgba(30,215,96,0.28), rgba(30,215,96,0.1)); }
        .sk-card { display: flex; flex-direction: column; gap: 13px; padding: 20px;
          border-radius: 24px; border: 1px solid rgba(255,255,255,0.09);
          background: linear-gradient(150deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); }
        .sk-row { display: flex; align-items: center; gap: 12px; }
        .sk-box { width: 28px; height: 28px; border-radius: 10px; flex-shrink: 0; }
        .sk-screen {
          flex: 1; display: flex; flex-direction: column; gap: 16px;
          padding: 18px 2px 44px; animation: fadeIn 0.25s ease both;
        }
        .sk-nav { display: flex; gap: 10px; }
        .sk-nav-pill { height: 36px; border-radius: 999px; flex: 1; }

        .ch-loading { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 13px; color: #8b96a6; font-size: 13.5px; font-weight: 500; padding: 60px 0; }
        .spin-ico { width: 46px; height: 46px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--green); }
        .spin-ico svg { animation: rot 0.9s linear infinite; }

        .modal-bg {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(3,4,6,0.65);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          display: flex; align-items: flex-end; justify-content: center;
          animation: fadeIn 0.18s ease both;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .order-modal {
          width: 100%; max-width: 520px; padding: 22px 20px calc(26px + env(safe-area-inset-bottom));
          border-radius: 28px 28px 0 0;
          background: linear-gradient(170deg, rgba(28,32,41,0.95), rgba(12,14,19,0.97));
          border: 1px solid rgba(255,255,255,0.13); border-bottom: none;
          backdrop-filter: blur(30px) saturate(160%); -webkit-backdrop-filter: blur(30px) saturate(160%);
          box-shadow: 0 -26px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.16);
          display: flex; flex-direction: column; gap: 13px;
          animation: sheetUp 0.26s cubic-bezier(0.2, 0.9, 0.3, 1) both;
        }
        @keyframes sheetUp { from { transform: translateY(60px); opacity: 0; } to { transform: none; opacity: 1; } }
        .om-head { display: flex; align-items: center; justify-content: space-between; }
        .om-title { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
        .om-title.buy { color: var(--green); }
        .om-title.sell { color: #ff7a6b; }
        .om-field { display: flex; flex-direction: column; gap: 7px; }
        .om-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8b96a6; }
        .om-search {
          display: flex; align-items: center; gap: 9px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 15px; padding: 12px 13px; color: #8b96a6;
          transition: border-color 0.15s;
        }
        .om-search:focus-within { border-color: rgba(30,215,96,0.45); }
        .om-search input { flex: 1; background: none; border: none; outline: none; color: var(--text);
          font-family: inherit; font-size: 14px; font-weight: 600; }
        .sym-list { display: flex; flex-direction: column; max-height: 176px; overflow-y: auto; }
        .sym-list::-webkit-scrollbar { width: 3px; }
        .sym-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 99px; }
        .sym-opt {
          display: flex; align-items: center; gap: 10px; padding: 10px 9px;
          background: none; border: none; border-radius: 11px; cursor: pointer;
          font-family: inherit; color: #c6cedb;
          transition: background 0.12s;
        }
        .sym-opt:active { background: rgba(255,255,255,0.06); }
        .sym-opt.active { background: rgba(30,215,96,0.13); }
        .sym-code { font-size: 13.5px; font-weight: 800; letter-spacing: 0.02em; min-width: 58px; }
        .sym-name { font-size: 12px; font-weight: 500; color: #8b96a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .om-input {
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 15px; padding: 13px 15px; color: var(--text);
          font-family: inherit; font-size: 15px; font-weight: 700; outline: none;
          font-variant-numeric: tabular-nums;
          transition: border-color 0.15s;
        }
        .om-input:focus { border-color: rgba(30,215,96,0.45); }
        .om-total {
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 14px; padding: 11px 14px; font-size: 12.5px; color: #8b96a6; font-weight: 600;
        }
        .om-total b { color: var(--text); font-size: 14px; font-variant-numeric: tabular-nums; }

        .ch-spin { animation: rot 0.9s linear infinite; }
        @keyframes rot { to { transform: rotate(360deg); } }

        @media (min-width: 768px) {
          .ch-root { background: #080a0f; }
          .ch-safe { max-width: 720px; width: 100%; margin: 0 auto; padding: 0 20px 96px; }
          .ch-header { margin: 0 -20px; padding: 0 20px; }
          .hero-card { padding: 32px 30px 26px; border-radius: 34px; }
          .hero-name { font-size: 34px; }
          .hero-tag { font-size: 15px; max-width: 80%; }
          .gl-card { padding: 22px; }
          .ch-nav { gap: 8px; padding: 6px; }
          .tab-btn { padding: 10px 20px; font-size: 14px; }
          .pf-value { font-size: 46px; }
          .order-modal { border-radius: 28px; box-shadow: 0 36px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.16); }
          .lb-rest { padding: 0 12px; }
        }

        @media (min-width: 1200px) {
          .ch-safe { max-width: 780px; }
          .ch-view { gap: 18px; }
        }

        @media (max-width: 360px) {
          .ch-safe { padding: 0 12px 80px; }
          .ch-header { margin: 0 -12px; padding: 0 12px; }
          .hero-card { padding: 20px 18px 18px; }
          .hero-name { font-size: 21px; }
          .hero-stats { gap: 6px; }
          .hs-value { font-size: 13px; }
          .ch-status { font-size: 14px; padding: 5px 10px; }
          .pf-grid { gap: 8px; }
          .pf-value { font-size: 32px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sk::after, .hero-card::after, .hero-badge::before { animation: none; }
          .ch-view, .modal-bg, .order-modal, .ch-state { animation: none; }
        }
      `}</style>
    </div>
  )
}
