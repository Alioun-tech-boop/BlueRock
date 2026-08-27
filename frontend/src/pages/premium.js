import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import { subscribePro, startProTrial, verifySubscription, cancelSubscription } from '../services/api'
import { FEATURES as FEATURE_FLAGS } from '../lib/features'
import { ArrowLeft, Check, X, Lock, Sparkles, Crown, Coins, Globe2, Landmark, Star, ShieldCheck, CreditCard, Zap, ChevronDown, Brain, BarChart3, ShieldAlert, Bell, FileDown, GitBranch } from 'lucide-react'
import { detectLang, t } from '../lib/i18n'

const PRO_PRICE = '4 900 FCFA'

function fmt(n) {
  try { return Number(n || 0).toLocaleString('fr-FR') } catch { return String(n || 0) }
}

function Meter({ value, limit, gold }) {
  const pct = Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(limit || 1))) * 100))
  return (
    <div className="of-meter">
      <div className="of-meter-track">
        <div className={`of-meter-fill ${gold ? 'gold' : 'green'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="of-meter-label">
        <span>{fmt(value)} / {fmt(limit)}</span>
        <span>{pct}%</span>
      </div>
      <style jsx>{`
        .of-meter-track {
          height: 10px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden;
        }
        .of-meter-fill { height: 100%; border-radius: 999px; transition: width 0.6s ease; }
        .of-meter-fill.green { background: linear-gradient(90deg, #18C27C, #4fe0a0); box-shadow: 0 0 14px rgba(24,194,124,0.5); }
        .of-meter-fill.gold { background: linear-gradient(90deg, #f5c04c, #FFE9A8); box-shadow: 0 0 14px rgba(255,215,122,0.5); }
        .of-meter-label { display: flex; justify-content: space-between; margin-top: 6px; color: #8d97a5; font-size: 11.5px; }
      `}</style>
    </div>
  )
}

function Faq({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`of-faq ${open ? 'open' : ''}`}>
      <button className="of-faq-q" onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <ChevronDown size={16} className="of-faq-arrow" />
      </button>
      {open && <div className="of-faq-a">{a}</div>}
      <style jsx>{`
        .of-faq {
          border: 1px solid rgba(255,255,255,0.09); border-radius: 14px;
          background: rgba(255,255,255,0.025); margin-bottom: 10px; overflow: hidden;
        }
        .of-faq-q {
          width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 15px 16px; background: none; border: none; color: #fff;
          font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; text-align: left;
        }
        .of-faq-arrow { color: #7d8794; transition: transform 0.2s ease; flex-shrink: 0; }
        .of-faq.open .of-faq-arrow { transform: rotate(180deg); }
        .of-faq-a { padding: 0 16px 15px; color: #8d97a5; font-size: 13px; line-height: 1.55; }
      `}</style>
    </div>
  )
}

const FEATURES = (lang) => [
  { key: 'ofRowExchanges', b: t(lang, 'ofBasicValExchanges'), p: t(lang, 'ofProValExchanges'), icon: Globe2, pro: true },
  { key: 'ofRowAi', b: t(lang, 'ofBasicValAi'), p: t(lang, 'ofProValAi'), icon: Coins, pro: true },
  { key: 'ofRowAiAccess', b: t(lang, 'ofYes'), p: t(lang, 'ofYes'), icon: Sparkles },
  { key: 'ofRowAiStudio', b: t(lang, 'ofBasicValAiStudio'), p: t(lang, 'ofProValAiStudio'), icon: Brain, pro: true },
  { key: 'ofRowBacktest', b: t(lang, 'ofNo'), p: t(lang, 'ofYes'), icon: BarChart3, pro: true },
  { key: 'ofRowRisk', b: t(lang, 'ofNo'), p: t(lang, 'ofYes'), icon: ShieldAlert, pro: true },
  { key: 'ofRowAlerts', b: t(lang, 'ofNo'), p: t(lang, 'ofYes'), icon: Bell, pro: true },
  { key: 'ofRowExports', b: t(lang, 'ofNo'), p: t(lang, 'ofYes'), icon: FileDown, pro: true },
  { key: 'ofRowExplain', b: t(lang, 'ofNo'), p: t(lang, 'ofYes'), icon: GitBranch, pro: true },
  { key: 'ofRowInvest', b: t(lang, 'ofYes'), p: t(lang, 'ofYes'), icon: Landmark },
  { key: 'ofRowReal', b: t(lang, 'ofYes'), p: t(lang, 'ofYes'), icon: ShieldCheck },
  { key: 'ofRowChallenges', b: t(lang, 'ofYes'), p: t(lang, 'ofYes'), icon: Star },
  { key: 'ofRowSupport', b: t(lang, 'ofYes'), p: t(lang, 'ofYes'), icon: CreditCard },
]

export default function Premium() {
  const router = useRouter()
  const { user, authLoading, refreshProfile } = useAuth()
  const [lang] = useState(() => detectLang())
  const [busy, setBusy] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [announce, setAnnounce] = useState(null) // success | error
  const [error, setError] = useState('')

  const isPro = user?.tier === 'pro'
  const isTrial = !!user?.is_trial
  const trialUsed = !!user?.trial_ends_at

  const fmtTrialEnd = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch { return iso || '' }
  }
  const trialLabel = lang === 'en' ? 'Start your 1-month free trial' : 'Essai gratuit 1 mois'
  const trialSub = lang === 'en'
    ? 'Free for 30 days, then 4 900 FCFA/month — cancel anytime'
    : '1 mois offert, puis 4 900 FCFA/mois — sans engagement'

  // Retour du checkout Stripe : re-vérifie l'abonnement côté serveur.
  useEffect(() => {
    const orderId = parseInt(router.query?.order || '', 10)
    if (router.query?.subscribe !== 'return' || !orderId || isPro) return
    let alive = true
    setProcessing(true)
    verifySubscription(orderId)
      .then(async r => {
        if (!alive) return
        if (r.data?.plan?.tier === 'pro') {
          await refreshProfile()
          setAnnounce('success')
        } else {
          setAnnounce('error')
        }
      })
      .catch(() => { if (alive) setAnnounce('error') })
      .finally(() => { if (alive) setProcessing(false) })
    return () => { alive = false }
  }, [router.query, isPro, refreshProfile])

  const startTrial = useCallback(async () => {
    if (!user) { router.push(`/login?next=${encodeURIComponent('/premium')}`); return }
    if (isPro) return
    setBusy(true)
    setError('')
    try {
      await startProTrial()
      await refreshProfile()
      setAnnounce('success')
    } catch (e) {
      setError(e?.response?.data?.detail || t(lang, 'ofError'))
    } finally {
      setBusy(false)
    }
  }, [user, isPro, router, lang, refreshProfile])

  const subscribe = useCallback(async () => {
    if (!user) { router.push(`/login?next=${encodeURIComponent('/premium')}`); return }
    if (isPro) return
    if (!FEATURE_FLAGS.subscription) { setError(t(lang, 'ftSubPro')); return }
    setBusy(true)
    setError('')
    try {
      const res = await subscribePro()
      const url = res.data?.payment_url
      if (url) window.location.href = url
      else setError(t(lang, 'ofError'))
    } catch (e) {
      setError(e?.response?.data?.detail || t(lang, 'ofError'))
    } finally {
      setBusy(false)
    }
  }, [user, isPro, router, lang])

  const doCancel = useCallback(async () => {
    setConfirmCancel(false)
    setBusy(true)
    setError('')
    try {
      await cancelSubscription()
      await refreshProfile()
      setAnnounce(null)
    } catch (e) {
      setError(e?.response?.data?.detail || t(lang, 'ofError'))
    } finally {
      setBusy(false)
    }
  }, [refreshProfile, lang])

  const features = FEATURES(lang)

  return (
    <div className="of-root">
      <div className="of-aurora" />
      <div className="of-grid-haze" />
      <div className="of-banner-bg">
        <img src="/banner-hero.png" alt="" className="of-banner-img" />
      </div>

      <div className="of-top">
        <button className="of-back" onClick={() => router.back()} aria-label="Retour">
          <ArrowLeft size={20} />
        </button>
        <span className="of-brand"><span className="of-dot" />BlueRock <em>{t(lang, 'offers')}</em></span>
        <span className={`of-tier-chip ${isPro ? 'pro' : ''}`}>
          {isPro ? <><Crown size={12} /> PRO</> : <>{t(lang, 'ofFree')}</>}
        </span>
      </div>

      {/* Héro */}
      {!isPro && (
        <section className="of-hero">
          <span className="of-badge"><span className="of-badge-dot" />{t(lang, 'ofBadge')}</span>
          <h1 className="of-h1">
            {t(lang, 'ofHeroTitle')}<br />
            <span className="of-accent">{t(lang, 'ofHeroTitleAccent')}</span>
          </h1>
          <p className="of-sub">{t(lang, 'ofHeroSub')}</p>
          <div className="of-hero-trust">
            <span><ShieldCheck size={13} /> {t(lang, 'ofTrust1')}</span>
            <span><Lock size={13} /> {t(lang, 'ofTrust2')}</span>
            <span><Zap size={13} /> {t(lang, 'ofTrust3')}</span>
          </div>
        </section>
      )}

      {/* État Pro actif */}
      {isPro && (
        <section className="of-pro-active">
          <div className="of-pro-active-glow" />
          <span className="of-crown"><Crown size={22} /></span>
          <h2 className="of-pro-t">{isTrial ? (lang === 'en' ? 'You are on a free trial' : 'Vous êtes en essai gratuit') : t(lang, 'ofProActive')}</h2>
          <p className="of-pro-s">
            {isTrial && user?.trial_ends_at
              ? `${lang === 'en' ? 'Pro access until' : 'Accès Pro jusqu\'au'} ${fmtTrialEnd(user.trial_ends_at)}`
              : t(lang, 'ofProActiveSub')}
          </p>
          <div className="of-pro-meter-wrap">
            <div className="of-pro-meter-head">
              <span><Coins size={14} /> {t(lang, 'ofTokenMeter')}</span>
              <span className="of-pro-note">{t(lang, 'ofMonthlyRenew')}</span>
            </div>
            <Meter value={user.ai_tokens} limit={user.ai_tokens_limit || 500} gold />
          </div>
          <button className="of-cancel-link" onClick={() => setConfirmCancel(true)}>
            {t(lang, 'ofCancelPro')}
          </button>
        </section>
      )}

      {/* Cartes d'offres */}
      <section className="of-plans">
        <article className="of-card basic">
          <div className="of-card-head">
            <span className="of-plan-name">{t(lang, 'ofFree')}</span>
            <span className="of-plan-chip">{t(lang, 'ofBasicChip')}</span>
          </div>
          <div className="of-price-row">
            <span className="of-price">0</span>
            <span className="of-currency">FCFA</span>
            <span className="of-period">{t(lang, 'ofPerMonth')}</span>
          </div>
          <ul className="of-perks">
            <li><Check size={14} /> {t(lang, 'ofBasicValExchanges')}</li>
            <li><Check size={14} /> {t(lang, 'ofRowInvest')}</li>
            <li><Check size={14} /> {t(lang, 'ofRowReal')}</li>
            <li><Coins size={14} className="muted" /> {t(lang, 'ofBasicValAi')}</li>
          </ul>
          <button
            className="of-cta basic"
            onClick={() => user ? router.push('/portfolio') : router.push('/login?next=%2Fportfolio')}
          >
            {t(lang, 'ofCtaBasic')}
          </button>
        </article>

        <article className="of-card pro on">
          <div className="of-pop"><Sparkles size={12} /> POPULAIRE</div>
          <div className="of-card-head">
            <span className="of-plan-name"><Crown size={18} /> {t(lang, 'ofPro')}</span>
          </div>
          <div className="of-price-row">
            <span className="of-price gold">{PRO_PRICE}</span>
            <span className="of-period">{t(lang, 'ofPlanMonthly')}</span>
          </div>
          {!isPro && !trialUsed && (
            <div className="of-trial-line">
              <span className="of-trial-badge"><Zap size={12} /> {lang === 'en' ? '30 days free' : '30 jours offerts'}</span>
              <span className="of-trial-sub">{trialSub}</span>
            </div>
          )}
          {!FEATURE_FLAGS.subscription && !isPro && trialUsed && <div className="of-unavail-note">{t(lang, 'ftSubPro')}</div>}
          <ul className="of-perks">
            <li><Check size={14} /> {t(lang, 'ofProValExchanges')}</li>
            <li><Check size={14} /> {t(lang, 'ofRowInvest')}</li>
            <li><Check size={14} /> {t(lang, 'ofRowReal')}</li>
            <li><Coins size={14} /> {t(lang, 'ofProValAi')}</li>
            <li><Brain size={14} /> {t(lang, 'ofProValAiStudio')} — {t(lang, 'ofRowAiStudio')}</li>
            <li><BarChart3 size={14} /> {t(lang, 'ofRowBacktest')}</li>
            <li><ShieldAlert size={14} /> {t(lang, 'ofRowRisk')}</li>
            <li><FileDown size={14} /> {t(lang, 'ofRowExports')}</li>
            <li><Check size={14} /> {t(lang, 'ofRowSupport')}</li>
          </ul>
{!isPro && !trialUsed ? (
            <button className="of-cta pro trial" onClick={startTrial} disabled={busy || processing}>
              {busy || processing
                ? <><Lock size={15} /> {t(lang, 'ofCtaProProcessing')}</>
                : <><Sparkles size={15} /> {trialLabel} →</>}
            </button>
          ) : (
            <button className="of-cta pro" onClick={subscribe} disabled={busy || processing || !FEATURE_FLAGS.subscription}>
              {!FEATURE_FLAGS.subscription
                ? <><Lock size={15} /> {t(lang, 'ftUnavailableTitle')}</>
                : busy || processing
                  ? <><Lock size={15} /> {t(lang, 'ofCtaProProcessing')}</>
                  : isPro ? <><Crown size={15} /> {t(lang, 'ofProActive')}</> : <>{t(lang, 'ofCtaPro')} →</>}
            </button>
          )}
        </article>
      </section>

      {error && <div className="of-error"><AlertTag msg={error} /></div>}
      {announce === 'success' && (
        <section className="of-announce ok">
          <span className="of-announce-ico"><Check size={16} /></span>
          <div>
            <strong>{t(lang, 'ofWelcomePro')}</strong>
            <span>{t(lang, 'ofWelcomeProSub')}</span>
          </div>
        </section>
      )}
      {announce === 'error' && (
        <section className="of-announce bad">
          <span className="of-announce-ico"><X size={16} /></span>
          <div>
            <strong>{t(lang, 'ofError')}</strong>
            <span>{t(lang, 'payFailedSub')}</span>
          </div>
        </section>
      )}

      {/* Bourses */}
      <section className="of-section">
        <h3 className="of-section-t">{t(lang, 'ofSectionBourses')}</h3>
        <div className="of-grid2">
          <div className="of-feature">
            <span className="of-feature-ico brvm"><Landmark size={18} /></span>
            <div>
              <strong className="of-feature-name">BRVM <span className="of-tag">FCFA</span></strong>
              <p>{t(lang, 'ofBrvmSub')}</p>
            </div>
            <span className="of-feature-check"><Check size={13} /></span>
          </div>
          <div className={`of-feature ${isPro ? '' : 'locked'}`} onClick={() => { if (!isPro) router.push('/premium') }}>
            <span className="of-feature-ico ngx"><Globe2 size={18} /></span>
            <div>
              <strong className="of-feature-name">NGX <span className="of-tag gold">₦</span></strong>
              <p>{t(lang, 'ofNgxSub')}</p>
            </div>
            {isPro
              ? <span className="of-feature-check gold"><Check size={13} /></span>
              : <span className="of-feature-lock"><Lock size={13} /> PRO</span>}
          </div>
        </div>
        <div className="of-ai-banner">
          <Sparkles size={16} />
          <div>
            <strong>{t(lang, 'ofTokenMeter')}</strong>
            <span>{t(lang, 'ofMonthlyRenew')}</span>
          </div>
          <span className="of-ai-badge">50 → 500</span>
        </div>
      </section>

      {/* Intelligence artificielle */}
      <section className="of-section">
        <h3 className="of-section-t">{t(lang, 'ofSectionAi')}</h3>
        <div className="of-grid2">
          <div className="of-feature">
            <span className="of-feature-ico ai"><Sparkles size={18} /></span>
            <div>
              <strong className="of-feature-name">{t(lang, 'ofRowAiAccess')} <span className="of-tag">FREE</span></strong>
              <p>{t(lang, 'ofAiExplainDesc')}</p>
            </div>
            <span className="of-feature-check"><Check size={13} /></span>
          </div>
          <div className={`of-feature ${isPro ? '' : 'locked'}`} onClick={() => { if (!isPro) router.push('/premium') }}>
            <span className="of-feature-ico ai2"><Brain size={18} /></span>
            <div>
              <strong className="of-feature-name">{t(lang, 'ofAiStudioName')} <span className="of-tag gold">{t(lang, 'ofProOnly')}</span></strong>
              <p>{t(lang, 'ofAiStudioDesc')}</p>
            </div>
            {isPro
              ? <span className="of-feature-check gold"><Check size={13} /></span>
              : <span className="of-feature-lock"><Lock size={13} /> PRO</span>}
          </div>
          <div className={`of-feature ${isPro ? '' : 'locked'}`} onClick={() => { if (!isPro) router.push('/premium') }}>
            <span className="of-feature-ico ai3"><BarChart3 size={18} /></span>
            <div>
              <strong className="of-feature-name">{t(lang, 'ofAiBacktestName')} <span className="of-tag gold">{t(lang, 'ofProOnly')}</span></strong>
              <p>{t(lang, 'ofAiBacktestDesc')}</p>
            </div>
            {isPro
              ? <span className="of-feature-check gold"><Check size={13} /></span>
              : <span className="of-feature-lock"><Lock size={13} /> PRO</span>}
          </div>
          <div className={`of-feature ${isPro ? '' : 'locked'}`} onClick={() => { if (!isPro) router.push('/premium') }}>
            <span className="of-feature-ico ai4"><ShieldAlert size={18} /></span>
            <div>
              <strong className="of-feature-name">{t(lang, 'ofAiRiskName')} <span className="of-tag gold">{t(lang, 'ofProOnly')}</span></strong>
              <p>{t(lang, 'ofAiRiskDesc')}</p>
            </div>
            {isPro
              ? <span className="of-feature-check gold"><Check size={13} /></span>
              : <span className="of-feature-lock"><Lock size={13} /> PRO</span>}
          </div>
          <div className={`of-feature ${isPro ? '' : 'locked'}`} onClick={() => { if (!isPro) router.push('/premium') }}>
            <span className="of-feature-ico ai5"><Bell size={18} /></span>
            <div>
              <strong className="of-feature-name">{t(lang, 'ofAiAlertsName')} <span className="of-tag gold">{t(lang, 'ofProOnly')}</span></strong>
              <p>{t(lang, 'ofAiAlertsDesc')}</p>
            </div>
            {isPro
              ? <span className="of-feature-check gold"><Check size={13} /></span>
              : <span className="of-feature-lock"><Lock size={13} /> PRO</span>}
          </div>
          <div className={`of-feature ${isPro ? '' : 'locked'}`} onClick={() => { if (!isPro) router.push('/premium') }}>
            <span className="of-feature-ico ai6"><FileDown size={18} /></span>
            <div>
              <strong className="of-feature-name">{t(lang, 'ofAiExportsName')} <span className="of-tag gold">{t(lang, 'ofProOnly')}</span></strong>
              <p>{t(lang, 'ofAiExportsDesc')}</p>
            </div>
            {isPro
              ? <span className="of-feature-check gold"><Check size={13} /></span>
              : <span className="of-feature-lock"><Lock size={13} /> PRO</span>}
          </div>
          <div className={`of-feature ${isPro ? '' : 'locked'}`} onClick={() => { if (!isPro) router.push('/premium') }}>
            <span className="of-feature-ico ai7"><GitBranch size={18} /></span>
            <div>
              <strong className="of-feature-name">{t(lang, 'ofAiExplainName')} <span className="of-tag gold">{t(lang, 'ofProOnly')}</span></strong>
              <p>{t(lang, 'ofAiExplainDesc')}</p>
            </div>
            {isPro
              ? <span className="of-feature-check gold"><Check size={13} /></span>
              : <span className="of-feature-lock"><Lock size={13} /> PRO</span>}
          </div>
        </div>
      </section>

      {/* Comparaison */}
      <section className="of-section">
        <h3 className="of-section-t">{t(lang, 'ofCompareTitle')}</h3>
        <div className="of-table">
          <div className="of-table-row head">
            <span className="of-cell feat"> </span>
            <span className="of-cell plan basic">{t(lang, 'ofFree')}</span>
            <span className="of-cell plan pro"><Crown size={13} /> {t(lang, 'ofPro')}</span>
          </div>
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <div className="of-table-row" key={f.key}>
                <span className="of-cell feat"><Icon size={14} className="of-cell-ico" />{t(lang, f.key)}</span>
                <span className="of-cell val">{f.b}</span>
                <span className={`of-cell val ${f.pro ? 'gold' : ''}`}>{f.p}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="of-section">
        <h3 className="of-section-t">{t(lang, 'ofFaqTitle')}</h3>
        <Faq q={t(lang, 'ofFaq1q')} a={t(lang, 'ofFaq1a')} />
        <Faq q={t(lang, 'ofFaq2q')} a={t(lang, 'ofFaq2a')} />
        <Faq q={t(lang, 'ofFaq3q')} a={t(lang, 'ofFaq3a')} />
      </section>

      {/* Pied */}
      <footer className="of-footer">
        <div className="of-trust-row">
          <span><ShieldCheck size={14} /> {t(lang, 'ofTrust1')}</span>
          <span>·</span>
          <span><Lock size={14} /> {t(lang, 'ofTrust2')}</span>
          <span>·</span>
          <span><CreditCard size={14} /> VISA · Mastercard · AMEX</span>
        </div>
        <p className="of-copy">© {new Date().getFullYear()} BlueRock — BRVM Financial Intelligence</p>
      </footer>

      {/* Confirmation d'annulation */}
      {confirmCancel && (
        <div className="of-modal" onClick={() => setConfirmCancel(false)}>
          <div className="of-modal-box" onClick={e => e.stopPropagation()}>
            <span className="of-modal-ico"><X size={18} /></span>
            <strong>{t(lang, 'ofCancelConfirm')}</strong>
            <p>{t(lang, 'ofCancelConfirmSub')}</p>
            <div className="of-modal-actions">
              <button className="of-btn ghost" onClick={() => setConfirmCancel(false)}>{t(lang, 'ofKeepPro')}</button>
              <button className="of-btn danger" onClick={doCancel} disabled={busy}>
                {busy ? '…' : t(lang, 'ofYesCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .of-root {
          position: relative; min-height: 100vh; overflow-x: hidden; overflow-y: visible;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif;
          padding: 0 18px 40px; box-sizing: border-box;
          -webkit-overflow-scrolling: touch;
        }
        .of-aurora {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(600px 420px at 85% -10%, rgba(76, 141, 255, 0.22), transparent 65%),
            radial-gradient(560px 400px at -10% 8%, rgba(24, 194, 124, 0.16), transparent 60%),
            radial-gradient(520px 420px at 90% 45%, rgba(139, 92, 246, 0.14), transparent 65%),
            radial-gradient(500px 380px at 10% 88%, rgba(255, 215, 122, 0.06), transparent 60%);
        }
        .of-grid-haze {
          position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.5;
          background-image:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 52px 52px;
          mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 75%);
        }
        .of-banner-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
        }
        .of-banner-img {
          width: 100%; height: 100%; object-fit: cover; object-position: center top;
          opacity: 0.18; filter: blur(2px);
        }
        .of-top {
          position: relative; z-index: 1;
          display: flex; align-items: center; justify-content: space-between;
          height: 58px; max-width: 1080px; margin: 0 auto;
        }
        .of-back {
          width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);
          border-radius: 50%; color: #fff; cursor: pointer; font-family: inherit;
          transition: background 0.15s ease;
        }
        .of-back:hover { background: rgba(255,255,255,0.12); }
        .of-brand {
          display: flex; align-items: center; gap: 8px;
          font-size: 15px; font-weight: 700; letter-spacing: 0.2px;
        }
        .of-brand em { font-style: normal; color: #9AA3B2; font-weight: 600; }
        .of-dot {
          width: 9px; height: 9px; border-radius: 50%;
          background: #18C27C; box-shadow: 0 0 12px rgba(24,194,124,0.9);
        }
        .of-tier-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 999px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          font-size: 11.5px; font-weight: 700; letter-spacing: 0.6px; color: #9AA3B2;
        }
        .of-tier-chip.pro { color: #FFD77A; border-color: #FFD77A44; background: rgba(255,215,122,0.08); }
        .of-hero { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; padding: 34px 0 10px; text-align: center; }
        .of-badge {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 14px; border-radius: 999px;
          background: rgba(24,194,124,0.10); border: 1px solid rgba(24,194,124,0.30);
          color: #4fe0a0; font-size: 11px; font-weight: 700; letter-spacing: 1.4px;
        }
        .of-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #18C27C; box-shadow: 0 0 8px #18C27C; }
        .of-h1 {
          font-size: clamp(30px, 7.5vw, 58px); line-height: 1.06;
          font-weight: 800; letter-spacing: -0.02em; margin: 18px 0 16px;
        }
        .of-accent {
          background: linear-gradient(100deg, #4C8DFF 0%, #8b5cf6 45%, #FFD77A 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .of-sub { max-width: 620px; margin: 0 auto; color: #A7B0BE; font-size: 15px; line-height: 1.55; }
        .of-hero-trust { display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; margin-top: 20px; }
        .of-hero-trust span {
          display: inline-flex; align-items: center; gap: 6px;
          color: #7d8794; font-size: 12px;
        }
        .of-hero-trust svg { color: #18C27C; }
        .of-plans { position: relative; z-index: 1; max-width: 1080px; margin: 34px auto 0; display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
        .of-card {
          position: relative; padding: 26px 24px 24px; border-radius: 22px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.09);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        }
        .of-card.pro {
          background: linear-gradient(180deg, rgba(255,215,122,0.07), rgba(255,255,255,0.03) 45%);
          border: 1px solid rgba(255,215,122,0.32);
          box-shadow: 0 0 0 1px rgba(255,215,122,0.08), 0 24px 70px -28px rgba(255,215,122,0.28),
                      0 0 90px -20px rgba(76,141,255,0.25);
        }
        .of-pop {
          position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 14px; border-radius: 999px;
          background: linear-gradient(100deg, #FFD77A, #f5c04c); color: #3a2c00;
          font-size: 10.5px; font-weight: 800; letter-spacing: 1.2px;
          box-shadow: 0 8px 22px -6px rgba(255,215,122,0.5);
          white-space: nowrap;
        }
        .of-card-head { display: flex; align-items: center; justify-content: space-between; }
        .of-plan-name { display: inline-flex; align-items: center; gap: 7px; font-size: 16px; font-weight: 700; }
        .of-plan-chip {
          padding: 4px 10px; border-radius: 8px; background: rgba(255,255,255,0.07);
          font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #9AA3B2;
        }
        .of-price-row { display: flex; align-items: baseline; gap: 8px; margin: 14px 0 18px; }
        .of-price { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .of-price.gold { background: linear-gradient(100deg, #FFE9A8, #f5c04c); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .of-currency { font-size: 17px; color: #A7B0BE; font-weight: 700; }
        .of-period { font-size: 13px; color: #7d8794; }
        .of-perks { list-style: none; margin: 0 0 22px; padding: 0; display: grid; gap: 11px; }
        .of-perks li {
          display: flex; align-items: center; gap: 9px;
          font-size: 13.5px; color: #D5DAE1;
        }
        .of-perks svg { color: #18C27C; flex-shrink: 0; }
        .of-perks svg.muted { color: #5b636e; }
        .of-cta {
          width: 100%; height: 48px; border: none; border-radius: 14px;
          font-size: 14.5px; font-weight: 700; font-family: inherit; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.15s ease;
        }
        .of-cta.basic { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); color: #fff; }
        .of-cta.basic:hover { background: rgba(255,255,255,0.11); }
        .of-cta.pro {
          color: #0a0f0c;
          background: linear-gradient(100deg, #FFE9A8, #f5c04c 60%, #FFD77A);
          box-shadow: 0 14px 34px -12px rgba(255,210,110,0.55);
        }
        .of-cta.pro:hover { transform: translateY(-1px); box-shadow: 0 18px 42px -12px rgba(255,210,110,0.65); }
        .of-cta.trial {
          color: #0b1f14;
          background: linear-gradient(145deg, #3ef191, #1ED760 55%, #12b855);
          box-shadow: 0 14px 34px -12px rgba(24,194,124,0.55);
        }
        .of-cta.trial:hover { transform: translateY(-1px); box-shadow: 0 18px 42px -12px rgba(24,194,124,0.65); }
        .of-cta:disabled { opacity: 0.65; cursor: default; transform: none; }
        .of-trial-line {
          display: flex; flex-direction: column; gap: 6px;
          margin: -2px 0 14px; padding: 11px 13px; border-radius: 13px;
          background: rgba(24,194,124,0.08); border: 1px solid rgba(24,194,124,0.28);
        }
        .of-trial-badge {
          display: inline-flex; align-items: center; gap: 6px;
          width: fit-content; font-size: 11px; font-weight: 800; letter-spacing: 0.04em;
          color: #4fe0a0; text-transform: uppercase;
        }
        .of-trial-sub { font-size: 12px; color: #aab4c0; line-height: 1.45; }
        .of-unavail-note {
          margin: -6px 0 16px; padding: 10px 12px; border-radius: 12px;
          background: rgba(240,68,56,0.08); border: 1px solid rgba(240,68,56,0.25);
          color: #f0a0a0; font-size: 12.5px; line-height: 1.5;
        }
        .of-error {
          position: relative; z-index: 1; max-width: 1080px; margin: 16px auto 0;
          padding: 12px 16px; border-radius: 14px; font-size: 13px; text-align: center;
          background: rgba(240,68,56,0.10); border: 1px solid rgba(240,68,56,0.3); color: #f0a0a0;
        }
        .of-announce {
          position: relative; z-index: 1; max-width: 1080px; margin: 18px auto 0;
          display: flex; align-items: center; gap: 14px;
          padding: 16px 20px; border-radius: 16px;
        }
        .of-announce.ok { background: rgba(24,194,124,0.10); border: 1px solid rgba(24,194,124,0.3); }
        .of-announce.bad { background: rgba(240,68,56,0.10); border: 1px solid rgba(240,68,56,0.3); }
        .of-announce-ico {
          width: 34px; height: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
        }
        .of-announce.ok .of-announce-ico { background: #18C27C; color: #04120b; }
        .of-announce.bad .of-announce-ico { background: #F04438; color: #fff; }
        .of-announce div { display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; }
        .of-announce strong { font-size: 14.5px; }
        .of-section { position: relative; z-index: 1; max-width: 1080px; margin: 44px auto 0; }
        .of-section-t { font-size: 17px; font-weight: 750; margin: 0 0 16px; }
        .of-grid2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
        .of-feature {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 18px; border-radius: 18px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .of-feature.locked { cursor: pointer; border-color: rgba(255,215,122,0.22); }
        .of-feature.locked:hover { background: rgba(255,215,122,0.04); }
        .of-feature-ico {
          width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
        }
        .of-feature-ico.brvm { background: rgba(24,194,124,0.14); color: #18C27C; }
        .of-feature-ico.ngx { background: rgba(139,92,246,0.14); color: #a78bfa; }
        .of-feature-ico.ai { background: rgba(34,211,238,0.14); color: #22d3ee; }
        .of-feature-ico.ai2 { background: rgba(139,92,246,0.14); color: #a78bfa; }
        .of-feature-ico.ai3 { background: rgba(244,114,182,0.14); color: #f472b6; }
        .of-feature-ico.ai4 { background: rgba(251,146,60,0.14); color: #fb923c; }
        .of-feature-ico.ai5 { background: rgba(96,165,250,0.14); color: #60a5fa; }
        .of-feature-ico.ai6 { background: rgba(52,211,153,0.14); color: #34d399; }
        .of-feature-ico.ai7 { background: rgba(217,70,239,0.14); color: #d946ef; }
        .of-feature-name { display: flex; align-items: center; gap: 8px; font-size: 15px; }
        .of-tag {
          padding: 2.5px 8px; border-radius: 6px; font-size: 10px; font-weight: 800;
          background: rgba(24,194,124,0.16); color: #4fe0a0;
        }
        .of-tag.gold { background: rgba(255,215,122,0.16); color: #FFD77A; }
        .of-feature p { margin: 6px 0 0; color: #8d97a5; font-size: 12.5px; line-height: 1.5; }
        .of-feature-check { margin-left: auto; width: 22px; height: 22px; border-radius: 50%; background: rgba(24,194,124,0.15); display: flex; align-items: center; justify-content: center; color: #18C27C; flex-shrink: 0; }
        .of-feature-check.gold { background: rgba(255,215,122,0.15); color: #FFD77A; }
        .of-feature-lock {
          margin-left: auto; flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px;
          font-size: 10px; font-weight: 800; letter-spacing: 0.8px; color: #FFD77A;
        }
        .of-ai-banner {
          margin-top: 14px; display: flex; align-items: center; gap: 14px;
          padding: 16px 18px; border-radius: 18px;
          background: linear-gradient(100deg, rgba(139,92,246,0.10), rgba(76,141,255,0.06));
          border: 1px solid rgba(139,92,246,0.25);
        }
        .of-ai-banner svg { color: #a78bfa; flex-shrink: 0; }
        .of-ai-banner div { display: flex; flex-direction: column; gap: 2px; }
        .of-ai-banner strong { font-size: 14px; }
        .of-ai-banner span:not(.of-ai-badge) { color: #8d97a5; font-size: 12px; }
        .of-ai-badge {
          margin-left: auto; flex-shrink: 0; padding: 5px 11px; border-radius: 999px;
          background: rgba(255,215,122,0.12); color: #FFD77A; font-size: 11px; font-weight: 800;
        }
        .of-table { border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; overflow: hidden; }
        .of-table-row {
          display: grid; grid-template-columns: 1.4fr 1fr 1fr;
          border-bottom: 1px solid rgba(255,255,255,0.055);
        }
        .of-table-row:last-child { border-bottom: none; }
        .of-table-row.head { background: rgba(255,255,255,0.03); }
        .of-cell { padding: 13px 14px; font-size: 12.5px; }
        .of-cell.feat {
          display: flex; align-items: center; gap: 8px;
          color: #A7B0BE; font-weight: 600;
        }
        .of-cell-ico { color: #5b636e; flex-shrink: 0; }
        .of-cell.plan { font-weight: 800; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .of-cell.plan.pro { color: #FFD77A; background: rgba(255,215,122,0.05); }
        .of-cell.val { text-align: center; color: #fff; }
        .of-cell.val.gold { color: #FFD77A; font-weight: 700; }
        .of-footer { position: relative; z-index: 1; max-width: 1080px; margin: 48px auto 0; text-align: center; }
        .of-trust-row {
          display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;
          color: #7d8794; font-size: 12px;
        }
        .of-trust-row span { display: inline-flex; align-items: center; gap: 6px; }
        .of-trust-row svg { color: #18C27C; }
        .of-copy { margin-top: 14px; color: #4d5560; font-size: 11.5px; }
        .of-pro-active {
          position: relative; z-index: 1; max-width: 1080px; margin: 30px auto 0;
          text-align: center; padding: 34px 22px;
          border-radius: 24px; overflow: hidden;
          background: linear-gradient(180deg, rgba(255,215,122,0.09), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,215,122,0.30);
        }
        .of-pro-active-glow {
          position: absolute; top: -60px; left: 50%; transform: translateX(-50%);
          width: 420px; height: 220px; border-radius: 50%;
          background: radial-gradient(closest-side, rgba(255,215,122,0.22), transparent);
          pointer-events: none;
        }
        .of-crown {
          position: relative; width: 52px; height: 52px; display: inline-flex; align-items: center; justify-content: center;
          border-radius: 50%; background: rgba(255,215,122,0.14); color: #FFD77A;
          box-shadow: 0 0 34px -6px rgba(255,215,122,0.5);
        }
        .of-pro-t { position: relative; font-size: 24px; font-weight: 800; margin: 14px 0 6px; }
        .of-pro-s { position: relative; color: #A7B0BE; font-size: 13.5px; max-width: 480px; margin: 0 auto; line-height: 1.5; }
        .of-pro-meter-wrap { position: relative; max-width: 440px; margin: 22px auto 0; text-align: left; }
        .of-pro-meter-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .of-pro-meter-head span:first-child { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
        .of-pro-note { color: #7d8794; font-size: 11px; font-weight: 500; }
        .of-cancel-link {
          position: relative; margin-top: 20px;
          background: none; border: none; color: #f0a0a0;
          font: inherit; font-size: 12.5px; cursor: pointer; text-decoration: underline;
          text-underline-offset: 3px;
        }
        .of-cancel-link:hover { color: #ffb8b8; }
        .of-modal {
          position: fixed; inset: 0; z-index: 300;
          display: flex; align-items: center; justify-content: center; padding: 24px;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        }
        .of-modal-box {
          width: 100%; max-width: 360px; border-radius: 20px; padding: 24px;
          background: #141418; border: 1px solid rgba(255,255,255,0.12);
          text-align: center;
        }
        .of-modal-ico {
          width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
          margin: 0 auto 12px; border-radius: 50%;
          background: rgba(240,68,56,0.12); color: #F04438;
        }
        .of-modal-box strong { font-size: 16px; }
        .of-modal-box p { color: #8d97a5; font-size: 13px; margin: 8px 0 18px; line-height: 1.5; }
        .of-modal-actions { display: grid; gap: 10px; }
        .of-btn {
          height: 44px; border: none; border-radius: 12px; cursor: pointer;
          font: inherit; font-size: 13.5px; font-weight: 700;
        }
        .of-btn.ghost { background: rgba(255,255,255,0.07); color: #fff; border: 1px solid rgba(255,255,255,0.12); }
        .of-btn.danger { background: #F04438; color: #fff; }
        .of-btn:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </div>
  )
}

function AlertTag({ msg }) {
  return <span>{msg}</span>
}