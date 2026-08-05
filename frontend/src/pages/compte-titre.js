import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import { openBrokerAccount, getBrokers } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import { ArrowLeft, ShieldCheck, Landmark, Star, CheckCircle2, FileText, PhoneCall, CalendarCheck } from 'lucide-react'

export default function CompteTitre() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [lang, setLang] = useState('fr')
  const [broker, setBroker] = useState(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [idType, setIdType] = useState('cni')
  const [idNumber, setIdNumber] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const brokerName = typeof router.query.broker === 'string' ? router.query.broker : ''
  const brokerType = typeof router.query.type === 'string' ? router.query.type : 'SGI'

  useEffect(() => {
    setLang(detectLang())
    if (!brokerName) return
    getBrokers().then(r => {
      const byCountry = r.data?.brokers || {}
      for (const [country, cats] of Object.entries(byCountry)) {
        for (const cat of ['SGI', 'SGO']) {
          const found = (cats[cat] || []).find(b => b.name === brokerName)
          if (found) { setBroker({ ...found, country }); return }
        }
      }
    }).catch(() => {})
  }, [brokerName])

  useEffect(() => {
    if (user) {
      if (!fullName) setFullName(user.name || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <button className="lp-btn" onClick={() => router.push(`/login?next=${encodeURIComponent(`/compte-titre?broker=${encodeURIComponent(brokerName)}&type=${brokerType}`)}`)}>
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

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const r = await openBrokerAccount({
        broker_name: brokerName,
        full_name: fullName.trim(),
        phone: phone.trim(),
        id_type: idType,
        id_number: idNumber.trim(),
      })
      setDone(r.data.account)
    } catch (err) {
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally {
      setBusy(false)
    }
  }

  const noteColor = (n) => {
    if (n >= 8.5) return '#00C853'
    if (n >= 7.5) return '#D4A843'
    return '#FF9800'
  }

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="br-header">
          <button className="icon-btn" onClick={() => (done ? router.push('/brokers') : router.back())}>
            <ArrowLeft size={20} />
          </button>
          <div className="br-title">
            <span className="br-name">{t(lang, 'ctTitle')}</span>
            <span className="br-sub"><ShieldCheck size={11} /> {t(lang, 'brokersHero')}</span>
          </div>
          <div className="icon-btn spacer" />
        </header>

        {done ? (
          <div className="success">
            <CheckCircle2 size={52} className="ok-ico" />
            <span className="ok-title">{t(lang, 'ctSuccess')}</span>
            <span className="ok-sub">
              {t(lang, 'ctSuccessSub').replace('{broker}', brokerName)}
            </span>
            <div className="ok-broker">
              <span className="ok-badge">{done.broker_category}</span>
              <span className="ok-name">{done.broker_name}</span>
              <span className="ok-status">{t(lang, 'ctStatusSent')}</span>
            </div>
            <div className="steps">
              <div className="step-title">{t(lang, 'ctNextSteps')}</div>
              <div className="step"><FileText size={16} className="st-ico" />{t(lang, 'ctStep1')}</div>
              <div className="step"><PhoneCall size={16} className="st-ico" />{t(lang, 'ctStep2')}</div>
              <div className="step"><CalendarCheck size={16} className="st-ico" />{t(lang, 'ctStep3')}</div>
            </div>
            <button className="back-btn" onClick={() => router.push('/brokers')}>{t(lang, 'ctBack')}</button>
          </div>
        ) : (
          <form className="ct-form" onSubmit={submit}>
            {broker ? (
              <div className="broker-banner">
                <div className="bb-left">
                  <span className="bb-badge">{broker.category}</span>
                  <span className="bb-name">{broker.name}</span>
                  <span className="bb-meta"><Landmark size={11} /> {broker.city} · {broker.country} · {t(lang, 'ctSince')} {broker.founded}</span>
                </div>
                <div className="bb-note">
                  <span className="bb-star"><Star size={12} fill="currentColor" /></span>
                  <span className="bb-value" style={{ color: noteColor(broker.note) }}>{broker.note}</span>
                  <span className="bb-max">/10</span>
                </div>
              </div>
            ) : (
              <div className="broker-banner ghost">{t(lang, 'loading')}…</div>
            )}

            <div className="form-title">{t(lang, 'ctFormTitle')}</div>

            <label className="fld">
              <span className="fld-label">{t(lang, 'ctFullName')}</span>
              <input className="fld-input" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </label>

            <label className="fld">
              <span className="fld-label">{t(lang, 'ctPhone')}</span>
              <input className="fld-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+225 07 00 00 00 00" required />
            </label>

            <label className="fld">
              <span className="fld-label">{t(lang, 'ctEmail')}</span>
              <input className="fld-input" type="email" value={user.email} disabled />
            </label>

            <label className="fld">
              <span className="fld-label">{t(lang, 'ctIdType')}</span>
              <select className="fld-input" value={idType} onChange={e => setIdType(e.target.value)}>
                <option value="cni">{t(lang, 'ctIdCni')}</option>
                <option value="passeport">{t(lang, 'ctIdPassport')}</option>
                <option value="ninea">{t(lang, 'ctIdNinea')}</option>
                <option value="npi">{t(lang, 'ctIdNpi')}</option>
              </select>
            </label>

            <label className="fld">
              <span className="fld-label">{t(lang, 'ctIdNumber')}</span>
              <input className="fld-input" value={idNumber} onChange={e => setIdNumber(e.target.value)} required />
            </label>

            {error && <div className="ct-error">{error}</div>}

            <button className="ct-submit" disabled={busy || !broker}>
              {busy ? t(lang, 'ctSubmitBusy') : t(lang, 'ctSubmit')}
            </button>
            <span className="ct-note">{t(lang, 'authNote')}</span>
          </form>
        )}
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
        .br-title { display: flex; flex-direction: column; align-items: center; gap: 1px; text-align: center; }
        .br-name { font-size: 17px; font-weight: 700; }
        .br-sub { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #a3a3a3; max-width: 200px; }

        .broker-banner {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          background: linear-gradient(135deg, #141414, #1a1a1a);
          border: 1px solid #2a2a2a; border-radius: 18px; padding: 16px; margin-bottom: 18px;
        }
        .broker-banner.ghost { color: #6f6f6f; justify-content: center; }
        .bb-left { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .bb-badge {
          align-self: flex-start; font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
          background: #2a2010; color: #D4A843; border: 1px solid #4a3a1a;
          padding: 2px 7px; border-radius: 5px;
        }
        .bb-name { font-size: 15px; font-weight: 700; line-height: 1.3; }
        .bb-meta { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #8a8a8a; }
        .bb-note {
          display: flex; flex-direction: column; align-items: center; gap: 1px;
          background: #1c1c1c; border: 1px solid #2a2a2a; border-radius: 12px; padding: 8px 10px;
        }
        .bb-star { color: #D4A843; }
        .bb-value { font-size: 18px; font-weight: 800; font-family: 'JetBrains Mono', monospace; line-height: 1; }
        .bb-max { font-size: 9px; color: #6f6f6f; }

        .form-title { font-size: 14px; font-weight: 700; margin: 4px 2px 12px; }
        .ct-form { display: flex; flex-direction: column; gap: 12px; }
        .fld { display: flex; flex-direction: column; gap: 6px; }
        .fld-label { font-size: 11px; font-weight: 600; color: #a3a3a3; text-transform: uppercase; letter-spacing: 0.4px; }
        .fld-input {
          background: #141414; border: 1px solid #2a2a2a; border-radius: 12px;
          color: #fff; font-size: 14px; padding: 12px 14px; outline: none; width: 100%;
          font-family: Inter, sans-serif;
        }
        .fld-input:focus { border-color: #D4A843; }
        .fld-input:disabled { color: #6f6f6f; }
        select.fld-input { appearance: none; }

        .ct-error { background: #2a1212; border: 1px solid #5a1f1f; color: #ff8a8a; font-size: 12px; padding: 10px 12px; border-radius: 10px; }
        .ct-submit {
          margin-top: 6px; padding: 14px; border-radius: 14px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #D4A843, #b8922f); color: #000;
          font-size: 15px; font-weight: 700;
        }
        .ct-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .ct-note { font-size: 11px; color: #6f6f6f; text-align: center; }

        .success { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 26px; text-align: center; }
        .ok-ico { color: #00C853; }
        .ok-title { font-size: 19px; font-weight: 800; }
        .ok-sub { font-size: 13px; color: #a3a3a3; line-height: 1.5; max-width: 300px; }
        .ok-broker {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          background: #141414; border: 1px solid #232323; border-radius: 16px;
          padding: 14px 22px; margin-top: 6px; width: 100%;
        }
        .ok-badge {
          font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
          background: #2a2010; color: #D4A843; border: 1px solid #4a3a1a;
          padding: 2px 7px; border-radius: 5px;
        }
        .ok-name { font-size: 14px; font-weight: 700; }
        .ok-status { font-size: 12px; color: #00C853; font-weight: 600; }
        .steps { display: flex; flex-direction: column; gap: 10px; width: 100%; margin-top: 10px; }
        .step-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #D4A843; text-align: left; }
        .step {
          display: flex; align-items: center; gap: 10px;
          background: #141414; border: 1px solid #232323; border-radius: 12px;
          padding: 12px 14px; font-size: 12.5px; color: #d6d6d6; text-align: left; line-height: 1.4;
        }
        .st-ico { color: #D4A843; flex: 0 0 auto; }
        .back-btn {
          margin-top: 14px; padding: 13px 30px; border-radius: 14px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #D4A843, #b8922f); color: #000;
          font-size: 14px; font-weight: 700;
        }
      `}</style>
    </div>
  )
}
