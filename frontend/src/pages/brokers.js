import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getBrokers } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import { ArrowLeft, ShieldCheck, Landmark, Star, ChevronRight, Building2 } from 'lucide-react'

export default function Brokers() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  const [groups, setGroups] = useState([])
  const [activeCountry, setActiveCountry] = useState(null)

  useEffect(() => {
    setLang(detectLang())
    getBrokers().then(r => {
      const byCountry = r.data?.brokers || {}
      const list = Object.entries(byCountry)
        .filter(([, cats]) => (cats.SGI || []).length + (cats.SGO || []).length > 0)
        .map(([country, cats]) => ({ country, sgi: cats.SGI || [], sgo: cats.SGO || [] }))
      setGroups(list)
      if (list.length) setActiveCountry(list[0].country)
    }).catch(() => {})
  }, [])

  const active = groups.find(g => g.country === activeCountry)

  const goToAccount = (b) => {
    router.push(`/compte-titre?broker=${encodeURIComponent(b.name)}&type=${b.category}`)
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
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div className="br-title">
            <span className="br-name">{t(lang, 'brokers')}</span>
            <span className="br-sub"><ShieldCheck size={11} /> {t(lang, 'brokersHero')}</span>
          </div>
          <div className="icon-btn spacer" />
        </header>

        <div className="country-nav">
          {groups.map(g => (
            <button
              key={g.country}
              className={`country-pill ${g.country === activeCountry ? 'active' : ''}`}
              onClick={() => setActiveCountry(g.country)}
            >
              {g.country}
            </button>
          ))}
        </div>

        {active && (
          <div className="br-content">
            {active.sgi.length > 0 && (
              <>
                <div className="br-cat"><Landmark size={13} /> {t(lang, 'brokersSgi')}</div>
                <div className="br-cards">
                  {active.sgi.map(b => (
                    <button className="br-card" key={b.name} onClick={() => goToAccount(b)}>
                      <div className="bc-main">
                        <span className="bc-badge sgi">SGI</span>
                        <span className="bc-name">{b.name}</span>
                        <span className="bc-meta">
                          <Building2 size={11} /> {b.city} · {t(lang, 'ctSince')} {b.founded}
                        </span>
                        <span className="bc-desc">{b.description}</span>
                      </div>
                      <div className="bc-note">
                        <span className="bn-star"><Star size={13} fill="currentColor" /></span>
                        <span className="bn-value" style={{ color: noteColor(b.note) }}>{b.note}</span>
                        <span className="bn-max">/10</span>
                      </div>
                      <ChevronRight size={18} className="bc-chevron" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {active.sgo.length > 0 && (
              <>
                <div className="br-cat sgo"><Landmark size={13} /> {t(lang, 'brokersSgo')}</div>
                <div className="br-cards">
                  {active.sgo.map(b => (
                    <button className="br-card" key={b.name} onClick={() => goToAccount(b)}>
                      <div className="bc-main">
                        <span className="bc-badge sgo">SGO</span>
                        <span className="bc-name">{b.name}</span>
                        <span className="bc-meta">
                          <Building2 size={11} /> {b.city} · {t(lang, 'ctSince')} {b.founded}
                        </span>
                        <span className="bc-desc">{b.description}</span>
                      </div>
                      <div className="bc-note">
                        <span className="bn-star"><Star size={13} fill="currentColor" /></span>
                        <span className="bn-value" style={{ color: noteColor(b.note) }}>{b.note}</span>
                        <span className="bn-max">/10</span>
                      </div>
                      <ChevronRight size={18} className="bc-chevron" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <BottomNav active="explorer" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .br-header {
          display: flex; align-items: center; justify-content: space-between; height: 60px;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .spacer { opacity: 0; }
        .br-title { display: flex; flex-direction: column; align-items: center; gap: 1px; text-align: center; }
        .br-name { font-size: 17px; font-weight: 700; }
        .br-sub { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #a3a3a3; max-width: 220px; }
        .country-nav {
          display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 12px;
          position: sticky; top: 0; background: #000; z-index: 5;
        }
        .country-nav::-webkit-scrollbar { display: none; }
        .country-pill {
          flex: 0 0 auto; padding: 8px 14px; border-radius: 20px;
          background: #161616; border: 1px solid #262626;
          color: #bdbdbd; font-size: 13px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
        }
        .country-pill.active {
          background: linear-gradient(135deg, #D4A843, #b8922f);
          color: #000; border-color: transparent;
        }
        .br-cat {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 600; color: #a3a3a3;
          text-transform: uppercase; letter-spacing: 0.4px;
          margin: 14px 2px 8px;
        }
        .br-cat svg { color: #D4A843; }
        .br-cat.sgo svg { color: #7aa2d0; }
        .br-cards { display: flex; flex-direction: column; gap: 10px; }
        .br-card {
          display: flex; align-items: center; gap: 12px;
          background: #141414; border: 1px solid #232323;
          border-radius: 16px; padding: 14px 14px;
          cursor: pointer; text-align: left; width: 100%;
          transition: border-color 0.15s, transform 0.1s;
        }
        .br-card:active { transform: scale(0.985); border-color: #D4A843; }
        .bc-main { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .bc-badge {
          align-self: flex-start; font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
          padding: 2px 7px; border-radius: 5px;
        }
        .bc-badge.sgi { background: #2a2010; color: #D4A843; border: 1px solid #4a3a1a; }
        .bc-badge.sgo { background: #10233b; color: #7aa2d0; border: 1px solid #1c3a5f; }
        .bc-name { font-size: 14px; font-weight: 700; color: #fff; line-height: 1.3; }
        .bc-meta {
          display: flex; align-items: center; gap: 4px;
          font-size: 11px; color: #8a8a8a;
        }
        .bc-desc { font-size: 11px; color: #6f6f6f; }
        .bc-note {
          display: flex; flex-direction: column; align-items: center; gap: 1px;
          background: #1c1c1c; border: 1px solid #2a2a2a;
          border-radius: 12px; padding: 8px 10px; min-width: 52px;
        }
        .bn-star { color: #D4A843; }
        .bn-value { font-size: 17px; font-weight: 800; font-family: 'JetBrains Mono', monospace; line-height: 1; }
        .bn-max { font-size: 9px; color: #6f6f6f; }
        .bc-chevron { color: #4a4a4a; flex: 0 0 auto; }
      `}</style>
    </div>
  )
}
