import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import {
  getPortfolio, initiateDeposit, verifyDepositOrder, getDepositOrders,
  withdrawPortfolioAccount,
} from '../services/api'
import { useAuth } from '../lib/auth'
import {
  ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Landmark, Wallet,
  CreditCard, Lock, ShieldCheck, CheckCircle2, X, Clock, AlertTriangle, ChevronRight,
} from 'lucide-react'
import { detectLang, t } from '../lib/i18n'

const QUICK = [5000, 25000, 50000, 100000, 250000]
const MIN = 100
const MAX = 950000

const fmtInt = n => (n == null ? '' : Number(n).toLocaleString('fr-FR').replace(/\s/g, '\u202F'))
const fmtMoney = (n, lang) =>
  n != null ? Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-'

function Spinner({ size = 18 }) {
  return (
    <span className="pp-spin" style={{ width: size, height: size }}>
      <style jsx>{`
        .pp-spin {
          border: 2.5px solid rgba(4,18,12,0.2); border-top-color: currentColor;
          border-radius: 50%; animation: ppSpin 0.75s linear infinite;
          flex-shrink: 0;
        }
        @keyframes ppSpin { to { transform: rotate(360deg); } }
      `}</style>
    </span>
  )
}

export default function Paiement() {
  const router = useRouter()
  const { user, authLoading } = useAuth()
  const rawId = Array.isArray(router.query.account) ? router.query.account[0] : router.query.account
  const rawMode = Array.isArray(router.query.mode) ? router.query.mode[0] : router.query.mode
  const mode = router.isReady ? (rawMode === 'withdraw' ? 'withdraw' : 'deposit') : 'deposit'
  const accountId = router.isReady ? rawId : null
  const [lang, setLang] = useState('fr')
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [amt, setAmt] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { kind: 'confirmed'|'pending'|'failed', amount }

  useEffect(() => { setLang(detectLang()) }, [])

  const loadAccount = () => {
    if (!user || !accountId) return
    getPortfolio(accountId)
      .then(res => {
        const list = res.data.accounts || []
        setAccount(list.find(a => String(a.id) === String(accountId)) || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    if (authLoading || !user) return
    if (!accountId) { setLoading(false); return }
    loadAccount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, accountId])

  // Retour de paiement Stripe (?pay=return) : on re-vérifie l'ordre le plus
  // récent auprès du backend, qui crédite le solde si le paiement est accepté.
  useEffect(() => {
    if (authLoading || !user) return
    if (router.query.pay !== 'return') return
    let cancelled = false
    getDepositOrders()
      .then(res => {
        if (cancelled) return null
        const orders = res.data.orders || []
        if (!orders.length) return null
        return verifyDepositOrder(orders[0].id).then(r => {
          if (cancelled) return
          const st = r.data.order?.status
          const amount = r.data.order?.amount ?? orders[0].amount
          if (st === 'accepted') {
            setStatus({ kind: 'confirmed', amount })
            setAmt(String(amount))
            loadAccount()
          } else if (st === 'pending') {
            setStatus({ kind: 'pending', amount })
          } else {
            setStatus({ kind: 'failed', amount })
          }
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, router.query.pay])

  const retryVerify = async () => {
    setBusy(true)
    try {
      const orders = await getDepositOrders()
      const first = (orders.data.orders || [])[0]
      if (!first) return
      const r = await verifyDepositOrder(first.id)
      const st = r.data.order?.status
      const amount = r.data.order?.amount ?? status?.amount ?? first.amount
      if (st === 'accepted') {
        setStatus({ kind: 'confirmed', amount })
        setAmt(String(amount))
        loadAccount()
      } else if (st === 'pending') {
        setStatus({ kind: 'pending', amount })
      } else {
        setStatus({ kind: 'failed', amount })
      }
    } catch (e) {
      setErr(e.response?.data?.detail || t(lang, 'loadError'))
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    const v = parseInt(amt === '' ? '0' : amt.replace(/\D/g, ''), 10) || 0
    if (!(v > 0)) { setStatus({ kind: 'failed', amount: v }); setErr(t(lang, 'accAmountInvalid')); return }
    if (v < MIN || v > MAX) { setStatus({ kind: 'failed', amount: v }); setErr(t(lang, 'payMinMax')); return }
    setBusy(true)
    setErr('')
    setStatus(null)
    try {
      if (mode === 'deposit') {
        const res = await initiateDeposit(account.id, v)
        if (res.data.payment_url) {
          setStatus({ kind: 'pending', amount: v })
          window.location.href = res.data.payment_url
        } else {
          setStatus({ kind: 'failed', amount: v })
        }
      } else {
        await withdrawPortfolioAccount(account.id, v)
        setStatus({ kind: 'confirmed', amount: v })
        setAccount(a => a ? { ...a, balance: Math.max(0, (a.balance || 0) - v) } : a)
        loadAccount()
      }
    } catch (e) {
      const d = e.response?.data?.detail
      setErr(typeof d === 'string' ? d : t(lang, 'loadError'))
    } finally {
      setBusy(false)
    }
  }

  const isReal = !!account && account.type === 'real'
  const amountValue = useMemo(() => {
    const v = parseInt(amt.replace(/\D/g, '') || '0', 10) || 0
    return { v, valid: v >= MIN && v <= MAX }
  }, [amt])

  const onAmount = e => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 7)
    setAmt(digits)
    if (err) setErr('')
  }

  return (
    <div className="mobile-root pp-root">
      <div className="pp-aurora" aria-hidden="true" />

      <div className="safe-area pp-safe">
        <header className="pp-top">
          <button className="pp-back" onClick={() => router.push('/portfolio')} aria-label={t(lang, 'payBack')}>
            <ArrowLeft size={21} strokeWidth={2.4} />
          </button>
          <div className="pp-top-txt">
            <strong>{t(lang, 'payTitle')}</strong>
            <span>{t(lang, 'payStepAmount')}</span>
          </div>
          <span className={`pp-mode ${mode === 'deposit' ? 'dep' : 'wd'}`}>
            {mode === 'deposit' ? <ArrowDownToLine size={15} strokeWidth={2.4} /> : <ArrowUpFromLine size={15} strokeWidth={2.4} />}
          </span>
        </header>

        <div className="pp-wrap">
          {!user && !authLoading && (
            <div className="pp-state">
              <ShieldCheck size={44} strokeWidth={1.8} className="pp-state-ico" />
              <strong>{t(lang, 'authRequired')}</strong>
              <span>{t(lang, 'authRequiredSub')}</span>
              <button className="pp-cta pp-cta-primary" onClick={() => router.push('/login?next=/portfolio')}>
                {t(lang, 'authLogin')}
              </button>
            </div>
          )}

          {user && loading && (
            <div className="pp-state">
              <div className="pp-loading-ring"><Spinner size={30} /></div>
            </div>
          )}

          {user && !loading && !account && (
            <div className="pp-state">
              <AlertTriangle size={44} strokeWidth={1.8} className="pp-state-ico warn" />
              <strong>{t(lang, 'payInvalidAcc')}</strong>
              <button className="pp-cta pp-cta-primary" onClick={() => router.push('/portfolio')}>
                {t(lang, 'payBack')}
              </button>
            </div>
          )}

          {user && !loading && account && status?.kind === 'confirmed' && (
            <div className="pp-state pp-success">
              <div className="pp-check-ring">
                <CheckCircle2 size={46} strokeWidth={2} />
              </div>
              <strong>{mode === 'withdraw' ? t(lang, 'payWithdrawConfirmed').replace('{amount}', fmtMoney(status.amount, lang)) : t(lang, 'paySuccessTitle')}</strong>
              {mode === 'deposit' && (
                <span className="pp-state-sub">{t(lang, 'paySuccessBack')}</span>
              )}
              <div className="pp-success-amt">
                <span>{fmtInt(status.amount)}</span>
                <em>FCFA</em>
              </div>
              <button className="pp-cta pp-cta-primary" onClick={() => router.push('/portfolio')}>
                {t(lang, 'payBack')}
              </button>
            </div>
          )}

          {user && !loading && account && status?.kind === 'pending' && (
            <div className="pp-state pp-pending">
              <div className="pp-clock-ring"><Clock size={38} strokeWidth={2} /></div>
              <strong>{t(lang, 'payVerifyTitle')}</strong>
              <span className="pp-state-sub">{t(lang, 'payVerifySub')}</span>
              <div className="pp-success-amt pending">
                <span>{fmtInt(status.amount)}</span>
                <em>FCFA</em>
              </div>
              <button className="pp-cta pp-cta-primary" onClick={retryVerify} disabled={busy}>
                {busy ? <Spinner size={18} /> : <>{t(lang, 'payVerifyBtn')}<ChevronRight size={16} strokeWidth={2.6} /></>}
              </button>
              <button className="pp-link" onClick={() => { setStatus(null); setErr('') }}>
                {t(lang, 'payCancel')}
              </button>
            </div>
          )}

          {user && !loading && account && status?.kind === 'failed' && (
            <div className="pp-state pp-failed">
              <div className="pp-fail-ring"><X size={36} strokeWidth={2.4} /></div>
              <strong>{t(lang, 'payFailedTitle')}</strong>
              <span className="pp-state-sub">{t(lang, 'payFailedSub')}</span>
              {err && <div className="pp-err">{err}</div>}
              <button className="pp-cta pp-cta-primary" onClick={() => { setStatus(null); setErr('') }}>
                {t(lang, 'payTryAgain')}
              </button>
            </div>
          )}

          {user && !loading && account && !status && (
            <div className="pp-flow">
              <div className={`pp-acc ${isReal ? 'real' : ''}`}>
                <span className="pp-acc-ico">
                  {isReal ? <Landmark size={22} strokeWidth={2.1} /> : <Wallet size={22} strokeWidth={2.1} />}
                </span>
                <div className="pp-acc-txt">
                  <strong>{account.name}</strong>
                  <span>
                    {t(lang, isReal ? 'accReal' : 'accDemo')}
                    <i />·{t(lang, 'accAvailable')} <b>{fmtMoney(account.balance, lang)}</b> FCFA
                  </span>
                </div>
                {isReal && <span className="pp-acc-badge">SGI</span>}
              </div>

              <div className="pp-section-head">
                <span>{mode === 'deposit' ? t(lang, 'payAmountTitle') : t(lang, 'payAmountTitleWD')}</span>
                <em>FCFA</em>
              </div>

              <div className={`pp-amount ${amountValue.valid ? '' : (amt ? 'bad' : '')}`}>
                <span className="pp-amount-ccy">
                  {mode === 'deposit' ? <ArrowDownToLine size={17} strokeWidth={2.4} /> : <ArrowUpFromLine size={17} strokeWidth={2.4} />}
                  <i>FCFA</i>
                </span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={amt ? fmtInt(amt) : ''}
                  placeholder="0"
                  onChange={onAmount}
                  autoFocus
                />
              </div>

              <div className="pp-bounds">
                <span>
                  {amt && !amountValue.valid
                    ? <em className="bad">{t(lang, 'payMinMax')}</em>
                    : t(lang, 'payMinMax')}
                </span>
              </div>

              {mode === 'deposit' && (
                <>
                  <div className="pp-quick">
                    {QUICK.map(q => (
                      <button
                        key={q}
                        className={`pp-chip ${amountValue.v === q ? 'on' : ''} ${amountValue.v >= MIN && amountValue.v < q ? 'mid' : ''}`}
                        onClick={() => setAmt(String(q))}
                      >
                        <span>{fmtInt(q)}</span>
                      </button>
                    ))}
                  </div>

                  {isReal && (
                    <div className="pp-method">
                      <div className="pp-section-head">
                        <span>{t(lang, 'payMethod')}</span>
                      </div>
                      <div className="pp-method-card">
                        <span className="pp-method-ico"><CreditCard size={22} strokeWidth={2.1} /></span>
                        <div className="pp-method-txt">
                          <strong>{t(lang, 'payMethodCard')}</strong>
                          <span>{t(lang, 'payMethodCardSub')}</span>
                        </div>
                        <span className="pp-method-brands">
                          <em>VISA</em><em>MC</em><em>AMEX</em>
                        </span>
                        <CheckCircle2 size={18} strokeWidth={2.4} className="pp-method-ok" />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className={`pp-trust ${isReal && mode === 'deposit' ? '' : 'plain'}`}>
                <Lock size={13.5} strokeWidth={2.4} />
                <span>
                  {isReal && mode === 'deposit'
                    ? t(lang, 'paySecureBy').replace('{gateway}', 'Stripe')
                    : t(lang, 'payEncrypted')}
                </span>
              </div>

              {mode === 'withdraw' && (
                <div className="pp-note">
                  <Clock size={16} strokeWidth={2.2} />
                  <span>{t(lang, 'payWithdrawNote')}</span>
                </div>
              )}

              <button
                className="pp-cta pp-cta-primary"
                disabled={busy || !amountValue.valid}
                onClick={submit}
              >
                {busy ? (
                  <><Spinner size={18} />{status?.kind === 'pending' ? t(lang, 'payRedirecting') : t(lang, 'payProcessing')}</>
                ) : (
                  <>
                    <Lock size={15} strokeWidth={2.6} />
                    {amountValue.valid
                      ? (mode === 'deposit' ? t(lang, 'payNow') : t(lang, 'payWithdrawNow')).replace('{amount}', fmtInt(amountValue.v))
                      : (mode === 'deposit' ? t(lang, 'accDeposit') : t(lang, 'accWithdraw'))}
                  </>
                )}
              </button>

              <button className="pp-link center" onClick={() => router.push('/portfolio')}>
                {t(lang, 'payBack')}
              </button>
            </div>
          )}
        </div>
      </div>

      <BottomNav active="portfolio" />

      <style jsx>{`
        .pp-root {
          display: flex; flex-direction: column;
          height: 100vh; background: #07090d; color: #F7F8FA;
          font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;
          overflow: hidden;
          -webkit-tap-highlight-color: transparent;
        }
        .pp-safe {
          position: relative; z-index: 1;
          flex: 1; min-height: 0; overflow-y: auto;
          padding: 0 0 8px;
        }
        .pp-safe::-webkit-scrollbar { display: none; }
        .pp-aurora {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(720px 420px at 85% -8%, rgba(24,194,124,0.13), transparent 62%),
            radial-gradient(620px 420px at -12% 12%, rgba(76,141,255,0.13), transparent 62%),
            radial-gradient(520px 380px at 55% 108%, rgba(139,92,246,0.1), transparent 60%),
            #07090d;
        }

        .pp-top {
          position: relative; z-index: 2;
          display: grid; grid-template-columns: 44px 1fr 44px; align-items: center;
          padding: 14px 20px 8px;
          max-width: 480px; margin: 0 auto;
        }
        .pp-back {
          width: 42px; height: 42px; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.04);
          color: #E8EEF7; display: flex; align-items: center; justify-content: center;
          cursor: pointer; backdrop-filter: blur(10px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
          transition: transform 0.12s ease, background 0.15s ease;
        }
        .pp-back:active { transform: scale(0.94); background: rgba(255,255,255,0.08); }
        .pp-top-txt { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .pp-top-txt strong { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
        .pp-top-txt span { font-size: 11px; font-weight: 600; color: #5F6D85; }
        .pp-mode {
          width: 42px; height: 42px; border-radius: 14px; justify-self: end;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid; font-size: 15px;
        }
        .pp-mode.dep { color: #2ACB8A; background: rgba(24,194,124,0.08); border-color: rgba(24,194,124,0.22); }
        .pp-mode.wd { color: #8b9cf7; background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.22); }

        .pp-wrap { position: relative; z-index: 1; padding: 6px 20px 0; max-width: 480px; margin: 0 auto; }

        /* --- Etats pleine page (succès / attente / erreur) --- */
        .pp-state {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 64px 12px 20px; gap: 10px;
        }
        .pp-state > strong { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
        .pp-state-sub { font-size: 13px; font-weight: 500; color: #8C99AF; line-height: 1.55; max-width: 300px; }
        .pp-state-ico { color: #4C8DFF; }
        .pp-state-ico.warn { color: #F0A03D; }
        .pp-check-ring, .pp-clock-ring, .pp-fail-ring {
          width: 88px; height: 88px; border-radius: 50%; margin-bottom: 8px;
          display: flex; align-items: center; justify-content: center;
        }
        .pp-success .pp-check-ring {
          color: #2ACB8A;
          background: rgba(24,194,124,0.1);
          border: 1px solid rgba(24,194,124,0.3);
          box-shadow: 0 0 42px rgba(24,194,124,0.25), inset 0 1px 0 rgba(255,255,255,0.08);
          animation: ppPop 0.35s cubic-bezier(0.22, 1.2, 0.36, 1);
        }
        .pp-pending .pp-clock-ring {
          color: #7ab2ff; background: rgba(76,141,255,0.1);
          border: 1px solid rgba(76,141,255,0.3);
          box-shadow: 0 0 42px rgba(76,141,255,0.2);
        }
        .pp-failed .pp-fail-ring {
          color: #FDA4AF; background: rgba(244,63,94,0.1);
          border: 1px solid rgba(244,63,94,0.32);
          box-shadow: 0 0 42px rgba(244,63,94,0.18);
        }
        .pp-success-amt {
          display: flex; align-items: baseline; gap: 9px; margin: 14px 0 4px;
          padding: 14px 26px; border-radius: 18px;
          background: rgba(24,194,124,0.07); border: 1px solid rgba(24,194,124,0.22);
        }
        .pp-success-amt span { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; color: #2ACB8A; font-feature-settings: 'tnum'; }
        .pp-success-amt em { font-style: normal; font-size: 13px; font-weight: 800; color: rgba(42,203,138,0.75); }
        .pp-success-amt.pending { background: rgba(76,141,255,0.07); border-color: rgba(76,141,255,0.24); }
        .pp-success-amt.pending span { color: #7ab2ff; }

        @keyframes ppPop {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        /* --- Carte compte --- */
        .pp-acc {
          display: flex; align-items: center; gap: 13px;
          padding: 15px; border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
          backdrop-filter: blur(12px);
          animation: ppFadeUp 0.35s ease both;
        }
        @keyframes ppFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .pp-acc-ico {
          width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(76,141,255,0.12); color: #7ab2ff;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .pp-acc.real .pp-acc-ico { background: rgba(24,194,124,0.13); color: #2ACB8A; }
        .pp-acc-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .pp-acc-txt strong { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pp-acc-txt span { font-size: 11.5px; font-weight: 600; color: #8C99AF; display: flex; align-items: center; flex-wrap: wrap; }
        .pp-acc-txt span i { width: 3px; height: 3px; border-radius: 50%; background: #3D475C; margin: 0 7px; }
        .pp-acc-txt span b { color: #E8EEF7; font-weight: 700; }
        .pp-acc-badge {
          flex-shrink: 0; font-size: 9px; font-weight: 800; letter-spacing: 0.12em;
          padding: 4px 8px; border-radius: 7px;
          color: #2ACB8A; background: rgba(24,194,124,0.12); border: 1px solid rgba(24,194,124,0.25);
        }

        /* --- Montant --- */
        .pp-section-head {
          display: flex; align-items: center; justify-content: space-between;
          margin: 26px 2px 12px;
        }
        .pp-section-head span { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #8C99AF; }
        .pp-section-head em { font-style: normal; font-size: 11px; font-weight: 800; color: #3D475C; }

        .pp-amount {
          display: flex; align-items: center; gap: 4px;
          padding: 16px 18px; border-radius: 20px;
          background: rgba(255,255,255,0.045);
          border: 1.5px solid rgba(255,255,255,0.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 34px rgba(0,0,0,0.28);
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .pp-amount:focus-within { border-color: rgba(24,194,124,0.55); background: rgba(255,255,255,0.06); }
        .pp-amount.bad { border-color: rgba(244,63,94,0.55); }
        .pp-amount.bad:focus-within { border-color: rgba(244,63,94,0.7); }
        .pp-amount-ccy {
          display: flex; align-items: center; gap: 8px; padding-right: 14px;
          border-right: 1px solid rgba(255,255,255,0.1);
          color: #2ACB8A;
        }
        .pp-amount.bad .pp-amount-ccy { color: #FDA4AF; }
        .pp-amount-ccy i { font-style: normal; font-size: 14px; font-weight: 800; color: #E8EEF7; letter-spacing: 0.04em; }
        .pp-amount input {
          flex: 1; min-width: 0; margin-left: 14px;
          background: transparent; border: none; outline: none;
          color: #F7F8FA; font-size: 40px; font-weight: 800; letter-spacing: -0.03em;
          font-family: inherit; font-feature-settings: 'tnum';
        }
        .pp-amount input::placeholder { color: #3D475C; }

        .pp-bounds { margin: 9px 4px 0; font-size: 11.5px; font-weight: 600; color: #5F6D85; }
        .pp-bounds em.bad { color: #FDA4AF; font-style: normal; }

        .pp-quick {
          display: flex; gap: 8px; margin-top: 18px; overflow-x: auto;
          padding-bottom: 4px; scrollbar-width: none;
        }
        .pp-quick::-webkit-scrollbar { display: none; }
        .pp-chip {
          flex-shrink: 0; padding: 9px 15px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: #8C99AF; font-size: 12.5px; font-weight: 700;
          cursor: pointer; font-family: inherit; font-feature-settings: 'tnum';
          transition: all 0.15s ease;
        }
        .pp-chip span { color: inherit; }
        .pp-chip.on {
          background: linear-gradient(135deg, #18C27C, #00A843);
          border-color: transparent; color: #04120c;
          box-shadow: 0 6px 18px rgba(24,194,124,0.3);
        }
        .pp-chip.mid { border-color: rgba(24,194,124,0.4); color: #2ACB8A; }
        .pp-chip:active { transform: scale(0.95); }

        /* --- Moyen de paiement --- */
        .pp-method { margin-top: 4px; }
        .pp-method-card {
          display: flex; align-items: center; gap: 13px;
          padding: 15px; border-radius: 18px;
          border: 1px solid rgba(24,194,124,0.28);
          background: linear-gradient(135deg, rgba(24,194,124,0.09), rgba(24,194,124,0.02));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .pp-method-ico {
          width: 44px; height: 44px; border-radius: 13px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(24,194,124,0.13); color: #2ACB8A;
        }
        .pp-method-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .pp-method-txt strong { font-size: 14px; font-weight: 800; }
        .pp-method-txt span { font-size: 11.5px; font-weight: 600; color: #8C99AF; }
        .pp-method-brands { display: flex; gap: 4px; flex-shrink: 0; }
        .pp-method-brands em {
          font-style: normal; font-size: 8.5px; font-weight: 800; letter-spacing: 0.04em;
          padding: 3px 5px; border-radius: 5px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
          color: #9AA3B2;
        }
        .pp-method-ok { flex-shrink: 0; color: #2ACB8A; }

        .pp-trust {
          display: flex; align-items: center; justify-content: center; gap: 7px;
          margin: 16px 0 0; color: #5F6D85; font-size: 11px; font-weight: 600;
        }
        .pp-trust.plain { margin-top: 10px; }

        .pp-note {
          display: flex; align-items: flex-start; gap: 10px; margin-top: 18px;
          padding: 13px 14px; border-radius: 14px;
          border: 1px solid rgba(76,141,255,0.2); background: rgba(76,141,255,0.06);
          color: #9FB2CC; font-size: 12px; font-weight: 500; line-height: 1.6;
        }
        .pp-note svg { flex-shrink: 0; color: #7ab2ff; margin-top: 1px; }

        /* --- CTA --- */
        .pp-cta {
          width: 100%; display: flex; align-items: center; justify-content: center; gap: 9px;
          padding: 16px; border: none; border-radius: 16px;
          font-size: 15px; font-weight: 900; font-family: inherit; letter-spacing: 0;
        }
        .pp-cta-primary {
          margin-top: 22px;
          background: linear-gradient(135deg, #18C27C, #00A843);
          color: #04120c; cursor: pointer;
          box-shadow: 0 12px 30px rgba(24,194,124,0.28), inset 0 1px 0 rgba(255,255,255,0.35);
          transition: transform 0.12s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }
        .pp-cta-primary:active { transform: scale(0.985); }
        .pp-cta-primary:disabled { opacity: 0.45; cursor: default; transform: none; }
        .pp-cta-primary:not(:disabled):hover { box-shadow: 0 14px 40px rgba(24,194,124,0.36), inset 0 1px 0 rgba(255,255,255,0.35); }
        .pp-cta-primary svg { flex-shrink: 0; }

        .pp-link {
          margin-top: 14px; background: none; border: none; cursor: pointer;
          color: #8C99AF; font-size: 13px; font-weight: 700; font-family: inherit;
          display: flex; align-items: center; gap: 6px;
        }
        .pp-link.center { margin-left: auto; margin-right: auto; }
        .pp-link:hover { color: #E8EEF7; }

        .pp-err { margin-top: 4px; font-size: 12.5px; font-weight: 600; color: #FDA4AF; max-width: 300px; }

        .pp-loading-ring {
          display: flex; align-items: center; justify-content: center;
          width: 64px; height: 64px; border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
        }
      `}</style>
    </div>
  )
}