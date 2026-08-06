import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getBrokers } from '../services/api'
import { detectLang, t } from '../lib/i18n'
import { ArrowLeft, Star, ChevronDown, MessageCircle, Users, Check, ShieldCheck } from 'lucide-react'

const PALETTES = [
  ['#42E8F4', '#0d3540'],
  ['#0A63FF', '#0a1f4a'],
  ['#8b5cf6', '#241a4d'],
  ['#00C853', '#0b3320'],
  ['#ff6b9d', '#3d1226'],
]

function seedHash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}

function initials(name) {
  const words = name.replace(/^(SGI|SGO)\s*/i, '').split(/\s+/).filter(w => !/^(S\.?A)$/i.test(w))
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase()
}

function formatK(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + ' K'
  return String(Math.round(n))
}

export default function Brokers() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  const [groups, setGroups] = useState([])
  const [catIndex, setCatIndex] = useState(0)
  const [sortMode, setSortMode] = useState('note')
  const [sortOpen, setSortOpen] = useState(false)
  const [orders, setOrders] = useState(420915752)

  useEffect(() => {
    setLang(detectLang())
    getBrokers().then(r => {
      const byCountry = r.data?.brokers || {}
      const list = Object.entries(byCountry)
        .filter(([, cats]) => (cats.SGI || []).length + (cats.SGO || []).length > 0)
        .map(([country, cats]) => ({
          country,
          brokers: [...(cats.SGI || []), ...(cats.SGO || [])].sort((a, b) => b.note - a.note),
        }))
      setGroups(list)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      setOrders(o => o + Math.floor(Math.random() * 7000) + 1)
    }, 1800)
    return () => clearInterval(iv)
  }, [])

  const cats = ['all', 'SGI', 'SGO']
  const catLabels = [t(lang, 'brokersAll'), 'SGI', 'SGO']

  const filtered = groups
    .map(g => ({
      country: g.country,
      brokers: g.brokers.filter(b => cats[catIndex] === 'all' || b.category === cats[catIndex]),
    }))
    .filter(g => g.brokers.length > 0)
    .map(g => ({
      country: g.country,
      brokers: [...g.brokers].sort((a, b) =>
        sortMode === 'note' ? b.note - a.note : a.name.localeCompare(b.name)
      ),
    }))

  const goToAccount = () => {
    router.push('/compte-titre')
  }

  const tier = (n) => {
    if (n >= 8.5) return { label: 'PLATINUM', color: '#0A63FF' }
    if (n >= 7.5) return { label: 'GOLD', color: '#D4A843' }
    return { label: 'SILVER', color: '#6f6f6f' }
  }

  const digits = String(orders)
  const head = digits.slice(0, -3).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const tail = digits.slice(-3)

  let idx = 0

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="b-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <span className="b-title">{t(lang, 'brokersTrading')}</span>
        </header>

        <div className="b-unavail">
          <ShieldCheck size={18} className="bu-ico" />
          <div className="bu-text">
            <span className="bu-title">{t(lang, 'brokersUnavailable')}</span>
            <span className="bu-sub">{t(lang, 'brokersUnavailableSub')}</span>
          </div>
          <button className="bu-cta" onClick={() => router.push('/compte-titre')}>{t(lang, 'ctDemoCta')}</button>
        </div>

        <div className="b-hero">
          <div className="b-orders">
            {head ? <span className="b-head-digits">{head} </span> : null}
            <span key={tail} className="b-tail">{tail}</span>
          </div>
          <div className="b-sub">{t(lang, 'brokersOrders')}</div>
        </div>

        <div className="b-cats">
          {catLabels.map((label, i) => (
            <button
              key={label}
              className={`b-cat-pill ${i === catIndex ? 'active' : ''}`}
              onClick={() => setCatIndex(i)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="b-sort">
          <span className="b-sort-label">{t(lang, 'brokersSortBy')}</span>
          <button className="b-sort-btn" onClick={() => setSortOpen(v => !v)}>
            <span className="b-sort-value">
              {sortMode === 'note' ? t(lang, 'brokersTopRated') : t(lang, 'brokersNameSort')}
            </span>
            <ChevronDown size={15} className={`b-sort-chev ${sortOpen ? 'open' : ''}`} />
          </button>
          {sortOpen && (
            <div className="b-sort-menu">
              <button className="b-sort-opt" onClick={() => { setSortMode('note'); setSortOpen(false) }}>
                {t(lang, 'brokersTopRated')}
              </button>
              <button className="b-sort-opt" onClick={() => { setSortMode('name'); setSortOpen(false) }}>
                {t(lang, 'brokersNameSort')}
              </button>
            </div>
          )}
        </div>

        {filtered.map(g => (
          <div key={g.country}>
            <div className="b-country">{g.country}</div>
            {g.brokers.map(b => {
              const seed = seedHash(b.name)
              const pal = PALETTES[seed % PALETTES.length]
              const note5 = (b.note / 2).toFixed(1)
              const reviews = 800 + (seed >> 4) % 9200
              const users = reviews * (3 + (seed >> 8) % 4)
              const tgr = tier(b.note)
              const delay = `${(idx++) * 40}ms`
              return (
                <button className="b-card" key={b.name} style={{ animationDelay: delay }} onClick={goToAccount}>
                  <div className="b-head">
                    <div className="b-logo-stack">
                      <div className="b-logo-back b-lb-1" style={{ background: `linear-gradient(135deg, ${pal[1]}, #0a0a0a)` }} />
                      <div className="b-logo-back b-lb-2" style={{ background: `linear-gradient(135deg, ${pal[1]}, #0a0a0a)` }} />
                      <div className="b-logo" style={{ background: `linear-gradient(135deg, ${pal[0]}, ${pal[1]})` }}>
                        <span>{initials(b.name)}</span>
                      </div>
                    </div>
                    <div className="b-head-main">
                      <span className="b-name">{b.name}</span>
                      <span className="b-badge" style={{ background: tgr.color }}>{tgr.label}</span>
                    </div>
                  </div>

                  <div className="b-rating">
                    <span className="b-score">{note5}</span>
                    <span className="b-stars">
                      {[0, 1, 2, 3, 4].map(i => (
                        <Star
                          key={i}
                          size={15}
                          className={parseFloat(note5) >= i + 0.75 ? 'star-on' : 'star-off'}
                        />
                      ))}
                    </span>
                    <span className="b-check" title={t(lang, 'brokersVerified')}>
                      <Check size={11} strokeWidth={3.5} />
                    </span>
                  </div>

                  <div className="b-stats">
                    <span className="b-stat"><MessageCircle size={15} /> {formatK(reviews)}</span>
                    <span className="b-stat"><Users size={15} /> {formatK(users)}</span>
                  </div>

                  <span className="b-cta">{t(lang, 'brokersOpenAccount')}</span>
                </button>
              )
            })}
          </div>
        ))}
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
        .b-header {
          display: flex; align-items: center; gap: 10px; height: 64px;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .b-title {
          font-size: 30px; font-weight: 900; letter-spacing: -0.5px;
          text-transform: lowercase; line-height: 1;
        }
        .b-hero { padding: 6px 0 18px; }
        .b-unavail {
          display: flex; align-items: center; gap: 10px;
          background: #2a2010; border: 1px solid #4a3a1a; border-radius: 14px;
          padding: 12px 14px; margin-bottom: 16px;
        }
        .bu-ico { color: #D4A843; flex-shrink: 0; }
        .bu-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .bu-title { font-size: 12.5px; font-weight: 700; color: #f0d28a; line-height: 1.3; }
        .bu-sub { font-size: 11px; color: #b89a55; line-height: 1.35; }
        .bu-cta {
          flex-shrink: 0; padding: 8px 12px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #D4A843, #b8922f); color: #000;
          font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .b-orders {
          font-family: 'JetBrains Mono', monospace;
          font-size: 44px; font-weight: 800; letter-spacing: -1.5px; line-height: 1;
          white-space: nowrap;
        }
        .b-head-digits { color: #fff; }
        .b-tail {
          color: #42E8F4;
          display: inline-block;
          animation: tickIn 0.28s ease both;
        }
        @keyframes tickIn { from { opacity: 0; transform: translateY(7px); } }
        .b-sub { font-size: 16px; color: #9B9B9B; margin-top: 8px; }
        .b-cats { display: flex; gap: 8px; padding: 2px 0 4px; }
        .b-cat-pill {
          height: 42px; padding: 0 20px; border-radius: 16px;
          border: none; background: transparent; color: #9B9B9B;
          font-size: 15px; font-weight: 600; cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }
        .b-cat-pill.active { background: #2D2D2D; color: #fff; }
        .b-sort {
          position: relative; display: flex; align-items: center; gap: 6px;
          padding: 14px 4px 12px; font-size: 14px;
        }
        .b-sort-label { color: #9B9B9B; }
        .b-sort-btn {
          display: flex; align-items: center; gap: 4px;
          background: none; border: none; color: #fff; font-size: 14px;
          font-weight: 600; cursor: pointer; padding: 0;
        }
        .b-sort-value { color: #fff; }
        .b-sort-chev { color: #9B9B9B; transition: transform 0.2s; }
        .b-sort-chev.open { transform: rotate(180deg); }
        .b-sort-menu {
          position: absolute; top: 42px; left: 4px; z-index: 10;
          background: #161616; border: 1px solid #2E2E2E; border-radius: 12px;
          padding: 6px; min-width: 150px;
          animation: fadeUp 0.2s ease both;
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } }
        .b-sort-opt {
          display: block; width: 100%; text-align: left;
          background: none; border: none; color: #e6e6e6; font-size: 14px;
          padding: 9px 12px; border-radius: 8px; cursor: pointer;
        }
        .b-sort-opt:hover { background: #242424; }
        .b-country {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.8px; color: #6f6f6f;
          margin: 18px 4px 10px;
        }
        .b-card {
          display: flex; flex-direction: column; justify-content: space-between;
          width: 92%; margin: 0 auto 26px; min-height: 228px;
          padding: 20px 18px; border-radius: 20px;
          background: linear-gradient(135deg, #1a1a1a 0%, #111111 50%);
          border: 1px solid #2E2E2E;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
          cursor: pointer; text-align: left; color: #fff;
          animation: cardIn 0.3s ease both;
          transition: transform 0.12s ease, border-color 0.15s;
        }
        .b-card:active { transform: scale(0.97); }
        @keyframes cardIn { from { opacity: 0; transform: translateY(14px); } }
        .b-head { display: flex; align-items: center; gap: 16px; }
        .b-logo-stack { position: relative; width: 72px; height: 72px; flex: 0 0 72px; }
        .b-logo, .b-logo-back {
          position: absolute; width: 72px; height: 72px; border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
        }
        .b-logo-back { border: 1px solid #2E2E2E; }
        .b-lb-1 { transform: translate(5px, 5px) rotate(3deg); opacity: 0.55; }
        .b-lb-2 { transform: translate(9px, 9px) rotate(-4deg); opacity: 0.3; }
        .b-logo {
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
          z-index: 2;
        }
        .b-logo span { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
        .b-head-main {
          flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
        }
        .b-name { font-size: 24px; font-weight: 800; line-height: 1.1; word-break: break-word; }
        .b-badge {
          font-size: 13px; font-weight: 800; letter-spacing: 1.2px;
          text-transform: uppercase; color: #fff;
          padding: 3px 10px; border-radius: 8px;
        }
        .b-rating { display: flex; align-items: center; gap: 9px; }
        .b-score { font-size: 20px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
        .b-stars { display: flex; gap: 1px; }
        .star-on { color: #fff; fill: #fff; }
        .star-off { color: #5a5a5a; }
        .b-check {
          width: 18px; height: 18px; border-radius: 50%;
          background: #fff; color: #000;
          display: flex; align-items: center; justify-content: center;
        }
        .b-stats { display: flex; gap: 22px; font-size: 14px; color: #fff; }
        .b-stat { display: flex; align-items: center; gap: 6px; }
        .b-stat svg { color: #9B9B9B; }
        .b-cta {
          display: flex; align-items: center; justify-content: center;
          height: 50px; border-radius: 25px;
          background: #fff; color: #000;
          font-size: 18px; font-weight: 600;
        }
      `}</style>
    </div>
  )
}
