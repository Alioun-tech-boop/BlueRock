import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import DataErrorState from '../components/DataErrorState'
import { getSimulationPatrimoine } from '../services/api'
import { t, detectLang } from '../lib/i18n'
import { ChevronLeft, TrendingUp, Coins } from 'lucide-react'

const CHIPS = [100000, 500000, 1000000, 5000000, 10000000]

function fmtFCFA(n) {
  if (!Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA'
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function horizonLabel(lang, months) {
  if (months % 12 === 0) {
    const y = months / 12
    return lang === 'fr' ? (y === 1 ? '1 an' : `${y} ans`) : (y === 1 ? '1 year' : `${y} years`)
  }
  return lang === 'fr' ? `${months} mois` : `${months} months`
}

export default function Patrimoine() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  const [amount, setAmount] = useState('1000000')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const mounted = useRef(true)

  const load = () => {
    setLoading(true)
    setError(false)
    getSimulationPatrimoine()
      .then(r => { if (mounted.current) setData(r.data) })
      .catch(() => { if (mounted.current) setError(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
  }

  useEffect(() => {
    // Retiré temporairement — redirige vers le menu
    router.replace('/menu')
  }, [router])

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    load()
    return () => { mounted.current = false }
  }, [])

  const parsed = Math.max(0, parseInt(amount.replace(/\D/g, '') || '0', 10))
  const horizons = data && data.horizons ? data.horizons : []

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="pg-header">
          <button className="back-btn" onClick={() => router.push('/menu')} aria-label={t(lang, 'back')}>
            <ChevronLeft size={22} />
          </button>
          <div className="pg-title-wrap">
            <div className="pg-title"><TrendingUp size={18} color="#18C27C" /> {t(lang, 'simTitle')}</div>
            <div className="pg-sub">{t(lang, 'simSub')}</div>
          </div>
        </header>

        <div className="sim-card amount-card">
          <div className="sim-label">{t(lang, 'simAmount')}</div>
          <div className="sim-input-row">
            <Coins size={22} color="#2ACB8A" />
            <input
              className="sim-input"
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="1 000 000"
            />
          </div>
          <div className="sim-chips">
            {CHIPS.map(c => (
              <button
                key={c}
                className={`sim-chip ${parsed === c ? 'on' : ''}`}
                onClick={() => setAmount(String(c))}
              >
                {fmtFCFA(c)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="sim-card">
            <div className="sk-lines">
              <div className="sk sk-l" />
              <div className="sk sk-m" />
              <div className="sk sk-s" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <TriLoader compact />
            </div>
          </div>
        ) : error ? (
          <DataErrorState lang={lang} size={150} retry={load} />
        ) : (
          <>
            <div className="card-title-inline">{t(lang, 'simResults')} · {t(lang, 'simValueToday')}</div>

            {horizons.length === 0 ? (
              <div className="empty-box">
                <div className="empty-title">{t(lang, 'simNoData')}</div>
              </div>
            ) : (
              horizons.map(h => {
                const value = parsed * h.growth
                const gain = value - parsed
                const up = gain >= 0
                return (
                  <div key={h.key} className="sim-card horizon-card">
                    <div className="h-top">
                      <span className="h-name">{t(lang, 'simHorizon').replace('{n}', horizonLabel(lang, h.months))}</span>
                      <span className={`h-pct ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{h.pct.toFixed(1)} %</span>
                    </div>
                    <div className="h-date">
                      {t(lang, 'simFrom')} {fmtDate(h.start_date)} → {fmtDate(h.end_date)}
                    </div>
                    <div className="h-grid">
                      <div className="h-stat">
                        <span className="stat-l">{t(lang, 'simValueToday')}</span>
                        <b className="h-val">{fmtFCFA(value)}</b>
                      </div>
                      <div className="h-stat">
                        <span className="stat-l">{t(lang, 'simGain')}</span>
                        <b className={`h-val ${up ? 'green' : 'red'}`}>{up ? '+' : ''}{fmtFCFA(gain)}</b>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}

        <p className="sim-hint">{t(lang, 'simHint')}</p>
        <div className="footer-note">Bluerock © 2026</div>

        <BottomNav active="portfolio" />
      </div>
      <style jsx>{`
        .pg-header { display: flex; align-items: center; gap: 10px; height: 64px; flex-shrink: 0; }
        .back-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 4px; display: flex; }
        .pg-title-wrap { flex: 1; min-width: 0; }
        .pg-title {
          display: flex; align-items: center; gap: 6px; font-size: 18px; font-weight: 600;
          color: #F7F8FA; letter-spacing: -0.01em; font-family: Inter, sans-serif;
        }
        .pg-sub { font-size: 12.5px; color: #8C99AF; margin-top: 2px; line-height: 1.4; }
        .card-title-inline {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 800; color: #9FACBF; letter-spacing: 0.05em;
          text-transform: uppercase; margin: 20px 2px 4px; font-family: Inter, sans-serif;
        }
        .empty-box {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 36px 16px; text-align: center; margin-top: 12px;
          background: #111214; border: 1px solid #22262D; border-radius: 18px;
        }
        .empty-title { font-size: 15px; font-weight: 600; color: #8C99AF; }
        .stat-l {
          font-size: 10.5px; font-weight: 700; color: #8C99AF;
          letter-spacing: 0.05em; text-transform: uppercase; font-family: Inter, sans-serif;
        }
        .sim-card {
          background: #111214; border: 1px solid #22262D; border-radius: 18px;
          padding: 18px; margin-top: 12px;
        }
        .sim-label {
          font-size: 11px; font-weight: 800; color: #9FACBF;
          letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px;
          font-family: Inter, sans-serif;
        }
        .sim-input-row {
          display: flex; align-items: center; gap: 12px;
          background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 15px; padding: 4px 16px;
        }
        .sim-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-size: 30px; font-weight: 800; color: #F7F8FA;
          font-variant-numeric: tabular-nums; letter-spacing: -0.03em;
          font-family: Inter, sans-serif; padding: 12px 0; min-width: 0;
        }
        .sim-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .sim-chip {
          border: 1px solid #262B33; background: rgba(255,255,255,0.03);
          color: #AEB9CC; font-size: 12px; font-weight: 600; font-family: inherit;
          padding: 7px 13px; border-radius: 999px; cursor: pointer;
          transition: all .15s ease;
        }
        .sim-chip.on {
          color: #0F0F0F; background: #2ACB8A; border-color: #2ACB8A; font-weight: 700;
        }
        .sk-lines { display: flex; flex-direction: column; gap: 12px; }
        .sk { border-radius: 8px; background: #1B1D22; animation: skPulse 1.2s ease-in-out infinite; }
        .sk-l { height: 20px; width: 55%; }
        .sk-m { height: 16px; width: 80%; }
        .sk-s { height: 14px; width: 35%; }
        @keyframes skPulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }

        .horizon-card .h-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .h-name {
          font-size: 16px; font-weight: 700; color: #F7F8FA; letter-spacing: -0.01em;
          font-family: Inter, sans-serif;
        }
        .h-pct {
          flex-shrink: 0; font-size: 13px; font-weight: 800; padding: 6px 12px; border-radius: 999px;
          font-variant-numeric: tabular-nums; font-family: Inter, sans-serif;
        }
        .h-pct.up { color: #2ACB8A; background: rgba(42,203,138,0.12); border: 1px solid rgba(42,203,138,0.32); }
        .h-pct.down { color: #F04438; background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.3); }
        .h-date { font-size: 12px; color: #8C99AF; margin-top: 5px; font-variant-numeric: tabular-nums; }
        .h-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
        .h-stat {
          display: flex; flex-direction: column; gap: 3px;
          background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.05);
          border-radius: 13px; padding: 11px 13px;
        }
        .h-val {
          font-size: 15px; font-weight: 700; color: #F7F8FA;
          font-variant-numeric: tabular-nums; font-family: Inter, sans-serif; letter-spacing: -0.01em;
        }
        .h-val.green { color: #2ACB8A; }
        .h-val.red { color: #F04438; }
        .sim-hint {
          margin: 16px 4px 0; font-size: 12px; line-height: 1.55; color: #7B879E;
        }
        .footer-note { text-align: center; font-size: 11px; color: #555; padding: 16px 0 12px; }
      `}</style>
    </div>
  )
}
