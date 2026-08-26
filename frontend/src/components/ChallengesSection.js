import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Trophy, Users, CalendarDays, Timer, Lock, ArrowUpRight,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { FEATURES } from '../lib/features'
import { getChallenges } from '../services/api'
import ServerDownArt from './ServerDownArt'

const fmtMoney = (n) => n == null ? '—' : Number(n).toLocaleString('fr-FR').replace(/[,.]\d+/, '').replace(/\s/g, ' ')

function fmtXof(n) {
  if (n == null) return '—'
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' k'
  return Number(n).toFixed(0)
}

function fmtDate(iso, lang) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysLeft(iso, lang) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return null
  const d = Math.ceil(diff / 86400000)
  return `${d} ${t(lang, 'chDaysLeft')}`
}

function StatusBadge({ status, lang, registrationOpen }) {
  const map = {
    live: { label: t(lang, 'chLive'), cls: 'live' },
    open: { label: t(lang, 'chOpen'), cls: 'open' },
    upcoming: registrationOpen
      ? { label: t(lang, 'chOpen'), cls: 'open' }
      : { label: t(lang, 'chUpcoming'), cls: 'upcoming' },
    ended: { label: t(lang, 'chEnded'), cls: 'ended' },
  }
  const s = map[status] || map.upcoming
  return <span className={`ch-status ${s.cls}`}><span className="dot" />{s.label}</span>
}

function periodText(c, lang) {
  const label = c.status === 'live' ? t(lang, 'chEnds') : t(lang, 'chStarts')
  return `${label} ${fmtDate(c.status === 'live' ? c.end_date : c.start_date, lang)}`
}

export default function ChallengesSection({ lang, user }) {
  const router = useRouter()
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(() => {
    setLoading(true)
    setFailed(false)
    getChallenges()
      .then(r => {
        if (!mounted.current) return
        setChallenges(r.data.challenges || [])
      })
      .catch(() => { if (mounted.current) setFailed(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    const iv = setInterval(load, 30000)
    return () => { mounted.current = false; clearInterval(iv) }
  }, [load])

  const sorted = [...challenges].sort((a, b) =>
    (a.is_featured || a.status === 'live' ? 0 : 1) - (b.is_featured || b.status === 'live' ? 0 : 1))

  return (
    <>
      <div className="ch-root">
        <div className="ch-intro">
          <div className="ch-intro-title">
            <Trophy size={18} color="#18C27C" />
            <span>{t(lang, 'chTitle')}</span>
          </div>
          <span className="ch-intro-sub">{t(lang, 'chSub')}</span>
        </div>

        {loading && challenges.length === 0 ? (
          <div className="ch-skel" aria-busy="true">
            {[0, 1, 2].map(i => (
              <div className="ch-card ch-skel-btn" key={i}>
                <div className="ch-skel-row">
                  <div className="sk-ch sk-badge" />
                  <div className="sk-ch sk-pill" />
                </div>
                <div className="sk-ch sk-title" />
                <div className="sk-ch sk-line" style={{ width: '88%' }} />
                <div className="sk-ch sk-line" style={{ width: '62%' }} />
                <div className="sk-ch sk-last" />
              </div>
            ))}
          </div>
        ) : failed && challenges.length === 0 ? (
          <div className="ch-off">
            <ServerDownArt size={170} />
            <span className="ch-off-t">{t(lang, 'loadError')}</span>
            <button className="ch-retry" onClick={load}>{t(lang, 'retry')}</button>
          </div>
        ) : challenges.length === 0 ? (
          <div className="ch-empty">
            <Trophy size={30} />
            <span>{t(lang, 'chNoChallenges')}</span>
          </div>
        ) : (
          sorted.map((c, i) => (
            <ChallengeCard
              key={c.id} c={c} lang={lang} index={i}
              onOpen={() => router.push(`/challenges?id=${c.id}`)}
            />
          ))
        )}
      </div>

      <style jsx global>{`
        .ch-root { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }
        .ch-intro { display: flex; flex-direction: column; gap: 4px; padding: 4px 2px 2px; }
        .ch-intro-title {
          display: flex; align-items: center; gap: 8px;
          font-family: 'Plus Jakarta Sans', Inter, sans-serif;
          font-size: 17px; font-weight: 700; color: #F8F8FA; letter-spacing: -0.01em;
        }
        .ch-intro-sub { font-size: 13.5px; color: #9AA3B2; line-height: 1.45; }
        .ch-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 0; color: #6B7A94; font-size: 14px; }

        .ch-skel { display: flex; flex-direction: column; gap: 16px; }
        .ch-skel-btn { cursor: default; min-height: 190px; justify-content: space-between; pointer-events: none; }
        .ch-skel-row { display: flex; align-items: center; justify-content: space-between; }
        .sk-ch { position: relative; overflow: hidden; border-radius: 8px;
          background: rgba(255,255,255,0.07); height: 13px; }
        .sk-ch::after { content: ''; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
          animation: chSkShimmer 1.5s ease-in-out infinite; transform: translateX(-100%); }
        @keyframes chSkShimmer { to { transform: translateX(100%); } }
        .sk-badge { width: 92px; height: 22px; border-radius: 999px; }
        .sk-pill { width: 64px; height: 20px; border-radius: 8px; }
        .sk-title { height: 20px; width: 62%; }
        .sk-line { height: 12px; }
        .sk-last { height: 18px; width: 108px; border-radius: 10px; align-self: flex-end; }

        .ch-off { display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 42px 0 26px; text-align: center; animation: fadeUp 0.35s ease both; }
        .ch-off-t { font-size: 13.5px; font-weight: 500; color: #9AA3B2; line-height: 1.5; max-width: 300px; }
        .ch-retry {
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer; font-family: inherit;
          font-size: 14px; font-weight: 700; color: #0b1f14;
          background: linear-gradient(145deg, #3ef191, #1ED760 55%, #12b855);
          border-radius: 15px; padding: 12px 30px;
          box-shadow: 0 10px 26px rgba(29,185,84,0.35), inset 0 1px 0 rgba(255,255,255,0.45);
          transition: transform 0.14s ease-out, filter 0.14s;
        }
        .ch-retry:active { transform: translateY(1.5px) scale(0.985); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        .ch-card {
          position: relative;
          display: flex; flex-direction: column; gap: 15px;
          padding: 24px 22px 20px;
          border-radius: 26px;
          text-align: left; cursor: pointer;
          font-family: inherit; color: #fff;
          background:
            radial-gradient(120% 90% at 100% -10%, rgba(76, 141, 255, 0.10), transparent 55%),
            linear-gradient(168deg, #17181d 0%, #0f1014 55%, #0c0d11 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 24px 48px -28px rgba(0, 0, 0, 0.75),
            0 6px 16px -8px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          animation: chCardIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
          transition: transform 0.18s ease-out, border-color 0.18s ease, box-shadow 0.3s ease;
        }
        @keyframes chCardIn {
          from { opacity: 0; transform: translateY(14px) scale(0.985); }
          to { opacity: 1; transform: none; }
        }
        .ch-card::before {
          content: '';
          position: absolute; inset: 0 0 auto 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
        }
        .ch-card::after {
          content: '';
          position: absolute; top: -55%; right: -20%; width: 75%; height: 150%;
          background: radial-gradient(circle, rgba(24, 194, 124, 0.16), transparent 66%);
          pointer-events: none;
        }
        .ch-card:active { transform: scale(0.982); }
        .ch-card.featured {
          background:
            radial-gradient(120% 90% at 100% -10%, rgba(24, 194, 124, 0.16), transparent 55%),
            radial-gradient(120% 100% at 0% 110%, rgba(139, 92, 246, 0.10), transparent 55%),
            linear-gradient(168deg, #101a14 0%, #0e1013 60%, #0b0d10 100%);
          border-color: rgba(24, 194, 124, 0.38);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            0 0 0 1px rgba(24, 194, 124, 0.12),
            0 0 64px -18px rgba(24, 194, 124, 0.40),
            0 24px 48px -28px rgba(0, 0, 0, 0.75);
        }
        .ch-card.featured::after {
          background: radial-gradient(circle, rgba(24, 194, 124, 0.24), transparent 66%);
        }
        .ch-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ch-status {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: Inter, sans-serif;
          font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
          padding: 6px 12px 5px; border-radius: 999px;
          backdrop-filter: blur(8px);
        }
        .ch-status .dot {
          width: 6px; height: 6px; border-radius: 50%; background: currentColor;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.07);
        }
        .ch-status.live { color: #2fd98a; background: rgba(24, 194, 124, 0.14); }
        .ch-status.live .dot { animation: chPulse 1.4s ease-in-out infinite; }
        .ch-status.open { color: #b48cff; background: rgba(139, 92, 246, 0.14); }
        .ch-status.upcoming { color: #64b5ff; background: rgba(78, 150, 255, 0.14); }
        .ch-status.ended { color: #8b94a3; background: rgba(255, 255, 255, 0.05); }
        @keyframes chPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .ch-pool {
          display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
        }
        .ch-pool-eyebrow {
          font-family: Inter, sans-serif;
          font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
          color: #8B93A1;
        }
        .ch-pool-row {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'Plus Jakarta Sans', Inter, sans-serif;
          font-variant-numeric: tabular-nums;
          font-size: 20px; font-weight: 700; letter-spacing: -0.02em;
          color: #F5F7FA;
        }
        .ch-pool-row svg { color: #2fd98a; }
        .ch-pool-cur { font-size: 12px; font-weight: 600; color: #8B93A1; letter-spacing: 0; margin-top: 3px; }
        .ch-name {
          font-family: 'Plus Jakarta Sans', Inter, sans-serif;
          font-size: 20px; font-weight: 700; letter-spacing: -0.022em;
          color: #FFFFFF; line-height: 1.22;
        }
        .ch-tagline { font-size: 13.5px; color: #9CA3B0; line-height: 1.5; }
        .ch-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .ch-chip {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: #B9C0CC;
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px; padding: 7px 11px;
        }
        .ch-chip svg { color: #7C8694; }
        .ch-chip.live-chip {
          color: #4fe0a0; border-color: rgba(24, 194, 124, 0.30);
          background: rgba(24, 194, 124, 0.09);
        }
        .ch-chip.live-chip svg { color: #2fd98a; }
        .ch-chip.unavail-chip {
          color: #ff9d92; border-color: rgba(240, 68, 56, 0.32);
          background: rgba(240, 68, 56, 0.09);
        }
        .ch-chip.unavail-chip svg { color: #F04438; }
        .ch-see-more {
          display: inline-flex; align-items: center; gap: 5px;
          font-family: 'Plus Jakarta Sans', Inter, sans-serif;
          font-size: 13px; font-weight: 600; color: #b48cff; letter-spacing: 0;
          transition: gap 0.2s ease;
          align-self: flex-start;
        }
        .ch-card:active .ch-see-more { gap: 9px; }
      `}</style>
    </>
  )
}

function ChallengeCard({ c, lang, onOpen, index = 0 }) {
  const countdown = c.status === 'live' ? daysLeft(c.end_date, lang) : null
  return (
    <button
      className={`ch-card${c.is_featured || c.status === 'live' ? ' featured' : ''}`}
      onClick={onOpen}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="ch-card-top">
        <StatusBadge status={c.status} lang={lang} registrationOpen={c.registration_open} />
        <span className="ch-pool">
          <span className="ch-pool-eyebrow">{lang === 'en' ? 'Prize pool' : 'Cagnotte'}</span>
          <span className="ch-pool-row">
            <Trophy size={16} strokeWidth={2.2} /> {fmtXof(c.prize_pool)}
            <span className="ch-pool-cur">FCFA</span>
          </span>
        </span>
      </div>
      <div className="ch-name">{c.name}</div>
      <div className="ch-tagline">{c.tagline}</div>
      <div className="ch-chips">
        <span className="ch-chip"><Users size={13.5} /> {c.participants_count}</span>
        <span className="ch-chip"><CalendarDays size={13.5} /> {periodText(c, lang)}</span>
        {c.entry_fee > 0 && <span className="ch-chip live-chip"><Trophy size={13.5} /> {t(lang, 'ch2Fee').replace('{fee}', fmtXof(c.entry_fee))}</span>}
        {c.entry_fee > 0 && !FEATURES.paidChallenges && <span className="ch-chip unavail-chip"><Lock size={13.5} /> {t(lang, 'ftUnavailableTitle')}</span>}
        {countdown && <span className="ch-chip live-chip"><Timer size={13.5} /> {countdown}</span>}
      </div>
      <span className="ch-see-more">{t(lang, 'chSeeMore')} <ArrowUpRight size={14} strokeWidth={2.4} /></span>
    </button>
  )
}
