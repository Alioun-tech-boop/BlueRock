import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Trophy, Users, CalendarDays, Timer, Lock,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { FEATURES } from '../lib/features'
import { getChallenges } from '../services/api'

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
  const mounted = useRef(true)

  const load = useCallback(() => {
    getChallenges()
      .then(r => {
        if (!mounted.current) return
        setChallenges(r.data.challenges || [])
      })
      .catch(() => {})
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

        {sorted.map(c => (
          <ChallengeCard
            key={c.id} c={c} lang={lang}
            onOpen={() => router.push(`/challenges?id=${c.id}`)}
          />
        ))}
        {challenges.length === 0 && (
          <div className="ch-empty">
            <Trophy size={30} />
            <span>{t(lang, 'chNoChallenges')}</span>
          </div>
        )}
      </div>

      <style jsx global>{`
        .ch-root { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }
        .ch-intro { display: flex; flex-direction: column; gap: 4px; padding: 4px 2px 2px; }
        .ch-intro-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: #F8F8FA; letter-spacing: 0;  }
        .ch-intro-sub { font-size: 14px; color: #9AA3B2; line-height: 1.35; }
        .ch-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 0; color: #6B7A94; font-size: 14px; }

        .ch-card {
          display: flex; flex-direction: column; gap: 14px;
          background: linear-gradient(160deg, #161616, #101010);
          border: 1px solid #232323; border-radius: 22px;
          padding: 22px; text-align: left; cursor: pointer;
          font-family: inherit; color: #fff;
          box-shadow: 0 10px 34px rgba(0,0,0,0.45);
          transition: opacity 150ms ease-out, transform 150ms ease-out;
        }
        .ch-card:active { opacity: 0.85; transform: scale(0.985); }
        .ch-card.featured {
          background: linear-gradient(160deg, rgba(24,194,124,0.09), rgba(139,92,246,0.05));
          border-color: rgba(24,194,124,0.4);
          box-shadow: 0 14px 40px rgba(0,0,0,0.5);
        }
        .ch-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .ch-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: uppercase; padding: 5px 10px; border-radius: 999px; }
        .ch-status .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .ch-status.live { color: #18C27C; background: rgba(24,194,124,0.12); }
        .ch-status.live .dot { animation: chPulse 1.4s ease-in-out infinite; }
        .ch-status.open { color: #a78bfa; background: rgba(139,92,246,0.12); }
        .ch-status.upcoming { color: #4ea8ff; background: rgba(78,168,255,0.12); }
        .ch-status.ended { color: #9AA3B2; background: #1a1a1a; }
        @keyframes chPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .ch-pool {
          display: flex; align-items: center; gap: 6px;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 18px; font-weight: 600;
          color: #8E95A3; 
          white-space: nowrap;
        }
        .ch-name { font-size: 18px; font-weight: 600; color: #F8F8FA; line-height: 1.25; letter-spacing: 0;  }
        .ch-tagline { font-size: 14px; color: #9AA3B2; line-height: 1.355; }
        .ch-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .ch-chip {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: #9AA3B2; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          background: #161616; border: 1px solid #262626; border-radius: 12px; padding: 8px 12px;
        }
        .ch-chip svg { color: #6f6f6f; }
        .ch-chip.live-chip { color: #18C27C; border-color: rgba(24,194,124,0.35); background: rgba(24,194,124,0.07); }
        .ch-chip.live-chip svg { color: #18C27C; }
        .ch-chip.unavail-chip { color: #f0a0a0; border-color: rgba(240,68,56,0.35); background: rgba(240,68,56,0.07); }
        .ch-chip.unavail-chip svg { color: #F04438; }
        .ch-see-more {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600; color: #a78bfa;
          letter-spacing: 0;
        }
      `}</style>
    </>
  )
}

function ChallengeCard({ c, lang, onOpen }) {
  const countdown = c.status === 'live' ? daysLeft(c.end_date, lang) : null
  return (
    <button
      className={`ch-card${c.is_featured || c.status === 'live' ? ' featured' : ''}`}
      onClick={onOpen}
    >
      <div className="ch-card-top">
        <StatusBadge status={c.status} lang={lang} registrationOpen={c.registration_open} />
        <span className="ch-pool"><Trophy size={15} /> {fmtXof(c.prize_pool)} FCFA</span>
      </div>
      <div className="ch-name">{c.name}</div>
      <div className="ch-tagline">{c.tagline}</div>
      <div className="ch-chips">
        <span className="ch-chip"><Users size={14} /> {c.participants_count}</span>
        <span className="ch-chip"><CalendarDays size={14} /> {periodText(c, lang)}</span>
        {c.entry_fee > 0 && <span className="ch-chip live-chip"><Trophy size={14} /> {t(lang, 'ch2Fee').replace('{fee}', fmtXof(c.entry_fee))}</span>}
        {c.entry_fee > 0 && !FEATURES.paidChallenges && <span className="ch-chip unavail-chip"><Lock size={14} /> {t(lang, 'ftUnavailableTitle')}</span>}
        {countdown && <span className="ch-chip live-chip"><Timer size={14} /> {countdown}</span>}
      </div>
      <span className="ch-see-more">{t(lang, 'chSeeMore')} ↑</span>
    </button>
  )
}
