import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import { activateDemoAccount, getPortfolio } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import { ArrowLeft, ShieldCheck, Wallet, CheckCircle2, ArrowRight } from 'lucide-react'

const fmtXof = (n) => n == null ? '—' : n.toLocaleString('fr-FR').replace(/,/g, ' ')

export default function CompteTitre() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [lang, setLang] = useState('fr')
  const [demo, setDemo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLang(detectLang())
    if (user) {
      getPortfolio()
        .then(r => {
          const d = r.data || {}
          if (d.demo_limit != null) {
            setDemo(d)
            setActivated(true)
          }
        })
        .catch(() => {})
    }
  }, [user])

  if (authLoading) {
    return (
      <div className="mobile-root center">
        <div className="loading">{t(lang, 'loading')}</div>
        <style jsx>{`
          .mobile-root { display: flex; align-items: center; justify-content: center; height: 100vh; background: #000; color: #fff; }
          .loading { color: #a3a3a3; font-size: 14px; }
        `}</style>
      </div>
    )
  }

  if (!user) {
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
          <div className="login-prompt">
            <ShieldCheck size={34} className="lp-ico" />
            <span className="lp-title">{t(lang, 'ctLoginRequired')}</span>
            <button className="lp-btn" onClick={() => router.push('/login?next=/compte-titre')}>
              {t(lang, 'ctGoLogin')}
            </button>
          </div>
        </div>
        <style jsx>{`
          .mobile-root { display: flex; flex-direction: column; height: 100vh; background: #000; color: #fff; font-family: Inter, -apple-system, sans-serif; }
          .safe-area { flex: 1; padding: 0 16px; }
          .br-header { display: flex; align-items: center; justify-content: space-between; height: 60px; }
          .icon-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%; }
          .br-title { display: flex; align-items: center; text-align: center; }
          .br-name { font-size: 17px; font-weight: 700; }
          .spacer { opacity: 0; }
          .login-prompt { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: 60px; text-align: center; }
          .lp-ico { color: #D4A843; }
          .lp-title { font-size: 15px; font-weight: 600; color: #e8e8e8; }
          .lp-btn {
            margin-top: 6px; padding: 12px 28px; border-radius: 14px; border: none; cursor: pointer;
            background: linear-gradient(135deg, #D4A843, #b8922f); color: #000;
            font-size: 14px; font-weight: 700;
          }
        `}</style>
      </div>
    )
  }

  const activate = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await activateDemoAccount()
      setDemo(r.data)
      setActivated(true)
    } catch (err) {
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally {
      setBusy(false)
    }
  }

  const limit = demo?.demo_limit ?? 100000000
  const used = demo?.demo_used ?? 0
  const remaining = demo?.demo_remaining ?? Math.max(limit - used, 0)
  const usedPct = Math.min((used / limit) * 100, 100)

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="br-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div className="br-title">
            <span className="br-name">{t(lang, 'ctTitle')}</span>
          </div>
          <div className="icon-btn spacer" />
        </header>

        <div className="unavail">
          <ShieldCheck size={20} className="un-ico" />
          <div className="un-text">
            <span className="un-title">{t(lang, 'brokersUnavailable')}</span>
            <span className="un-sub">{t(lang, 'brokersUnavailableSub')}</span>
          </div>
        </div>

        <div className="demo-card">
          <div className="dc-top">
            <span className="dc-badge">{t(lang, 'ctDemoBadge')}</span>
            {activated && <span className="dc-on"><CheckCircle2 size={13} /> {t(lang, 'ctDemoActive')}</span>}
          </div>
          <span className="dc-title">{t(lang, 'ctDemoTitle')}</span>
          <div className="dc-limit">
            <Wallet size={18} className="dc-ico" />
            <span>{fmtXof(limit)} <span className="dc-currency">FCFA</span></span>
          </div>
          <span className="dc-sub">{t(lang, 'ctDemoSub')}</span>

          {activated && (
            <>
              <div className="dc-meter">
                <div className="dm-track"><div className="dm-fill" style={{ width: `${usedPct}%` }} /></div>
                <div className="dm-labels">
                  <span>{t(lang, 'ctDemoUsed')} : <b>{fmtXof(used)}</b></span>
                  <span>{t(lang, 'ctDemoRemaining')} : <b>{fmtXof(remaining)}</b></span>
                </div>
              </div>
              <button className="dc-btn" onClick={() => router.push('/portfolio')}>
                {t(lang, 'ctDemoPortfolio')} <ArrowRight size={16} />
              </button>
            </>
          )}

          {!activated && (
            <button className="dc-btn" onClick={activate} disabled={busy}>
              {busy ? t(lang, 'ctSubmitBusy') : <><Wallet size={16} /> {t(lang, 'ctDemoActivate')}</>}
            </button>
          )}

          {error && <div className="ct-error">{error}</div>}
        </div>

        <span className="ct-foot">{t(lang, 'ctNote')}</span>
      </div>

      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 20px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .br-header { display: flex; align-items: center; justify-content: space-between; height: 60px; }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .spacer { opacity: 0; }
        .br-title { display: flex; align-items: center; text-align: center; }
        .br-name { font-size: 17px; font-weight: 700; }

        .unavail {
          display: flex; align-items: flex-start; gap: 10px;
          background: #2a2010; border: 1px solid #4a3a1a; border-radius: 14px;
          padding: 12px 14px; margin-bottom: 16px;
        }
        .un-ico { color: #D4A843; flex-shrink: 0; margin-top: 1px; }
        .un-text { display: flex; flex-direction: column; gap: 2px; }
        .un-title { font-size: 12.5px; font-weight: 700; color: #f0d28a; line-height: 1.3; }
        .un-sub { font-size: 11px; color: #b89a55; line-height: 1.35; }

        .demo-card {
          display: flex; flex-direction: column; gap: 12px;
          background: linear-gradient(160deg, #15170f, #10120b);
          border: 1px solid #3a3a24; border-radius: 20px;
          padding: 20px; margin-top: 6px;
        }
        .dc-top { display: flex; align-items: center; justify-content: space-between; }
        .dc-badge {
          font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
          background: #2a2010; color: #D4A843; border: 1px solid #4a3a1a;
          padding: 3px 9px; border-radius: 6px;
        }
        .dc-on {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 700; color: #00C853;
        }
        .dc-title { font-size: 15px; font-weight: 700; color: #f0d28a; }
        .dc-limit {
          display: flex; align-items: baseline; gap: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 34px; font-weight: 800; letter-spacing: -0.5px; color: #fff; line-height: 1.1;
        }
        .dc-ico { align-self: center; color: #D4A843; }
        .dc-currency { font-size: 13px; font-weight: 600; color: #9a8b5f; }
        .dc-sub { font-size: 12px; color: #a3a3a3; line-height: 1.45; }

        .dc-meter { display: flex; flex-direction: column; gap: 7px; }
        .dm-track {
          height: 8px; border-radius: 5px; background: #23231a; overflow: hidden;
        }
        .dm-fill {
          height: 100%; border-radius: 5px;
          background: linear-gradient(90deg, #D4A843, #b8922f);
          transition: width 0.4s ease;
        }
        .dm-labels {
          display: flex; justify-content: space-between; gap: 8px;
          font-size: 11px; color: #8a8a8a;
        }
        .dm-labels b { color: #e8e8e8; font-family: 'JetBrains Mono', monospace; font-weight: 600; }

        .dc-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 14px; border-radius: 14px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #D4A843, #b8922f); color: #000;
          font-size: 15px; font-weight: 700; font-family: inherit;
          transition: opacity 160ms ease-out, transform 160ms ease-out;
        }
        .dc-btn:active { opacity: 0.9; transform: scale(0.98); }
        .dc-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .ct-error { background: #2a1212; border: 1px solid #5a1f1f; color: #ff8a8a; font-size: 12px; padding: 10px 12px; border-radius: 10px; }
        .ct-foot { display: block; text-align: center; font-size: 11px; color: #6f6f6f; margin-top: 16px; line-height: 1.5; }
      `}</style>
    </div>
  )
}
