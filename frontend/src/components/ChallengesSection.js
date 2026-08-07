import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Trophy, Flame, Users, CalendarDays, Medal, Timer, Wallet, RefreshCw,
  Crown, CheckCircle2, LogIn, X, TrendingUp,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { getChallenges, joinChallenge, leaveChallenge, getChallengeLeaderboard } from '../services/api'

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

function StatusBadge({ status, lang }) {
  const map = {
    live: { label: t(lang, 'chLive'), cls: 'live' },
    open: { label: t(lang, 'chOpen'), cls: 'open' },
    upcoming: { label: t(lang, 'chUpcoming'), cls: 'upcoming' },
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
  const [detail, setDetail] = useState(null)
  const [lb, setLb] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const load = useCallback(() => {
    getChallenges()
      .then(r => {
        if (!mounted.current) return
        setChallenges(r.data.challenges || [])
        setError('')
      })
      .catch(() => { if (mounted.current) setError(t(lang, 'loadError')) })
  }, [lang])

  const loadLb = useCallback((id) => {
    if (!id) return
    getChallengeLeaderboard(id)
      .then(r => { if (mounted.current) setLb(prev => ({ ...prev, [id]: r.data.leaderboard || [] })) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    return () => { mounted.current = false }
  }, [load])

  useEffect(() => { if (detail) loadLb(detail.id) }, [detail, loadLb])

  const refreshAll = async (id) => {
    try {
      const r = await getChallenges()
      if (!mounted.current) return
      const list = r.data.challenges || []
      setChallenges(list)
      if (id) {
        const upd = list.find(x => x.id === id)
        if (upd) setDetail(upd)
      }
    } catch {}
  }

  const doJoin = async (c) => {
    if (!user) {
      router.push('/login?next=/community')
      return
    }
    setBusy(true)
    setError('')
    try {
      await joinChallenge(c.id)
      await refreshAll(c.id)
      loadLb(c.id)
    } catch (err) {
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally {
      setBusy(false)
    }
  }

  const doLeave = async (c) => {
    setBusy(true)
    setError('')
    try {
      await leaveChallenge(c.id)
      await refreshAll(c.id)
      loadLb(c.id)
    } catch (err) {
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally {
      setBusy(false)
    }
  }

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

        {error && (
          <div className="ch-error">
            <span>{error}</span>
            <button onClick={() => { setError(''); load() }}><RefreshCw size={12} /></button>
          </div>
        )}

        {sorted.map(c => (
          <ChallengeCard
            key={c.id} c={c} lang={lang}
            onOpen={() => setDetail(c)}
          />
        ))}

        {challenges.length === 0 && !error && (
          <div className="ch-empty">
            <Trophy size={30} />
            <span>{t(lang, 'chNoChallenges')}</span>
          </div>
        )}
      </div>

      {detail && (
        <ChallengeDetailSheet
          c={detail}
          lang={lang}
          user={user}
          busy={busy}
          lb={lb[detail.id]}
          onJoin={() => doJoin(detail)}
          onLeave={() => doLeave(detail)}
          onClose={() => setDetail(null)}
        />
      )}

      <style jsx global>{`
        .ch-root { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }
        .ch-intro { display: flex; flex-direction: column; gap: 4px; padding: 4px 2px 2px; }
        .ch-intro-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: #F8F8FA; letter-spacing: 0.25px;  }
        .ch-intro-sub { font-size: 14px; color: #9AA3B2; line-height: 1.35; }
        .ch-error {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(240,68,56,0.08); border: 1px solid rgba(240,68,56,0.3);
          border-radius: 14px; padding: 12px 14px; font-size: 13px; color: #ff9d9d;
        }
        .ch-error button { background: rgba(240,68,56,0.2); border: none; border-radius: 8px; color: #ff9d9d; padding: 4px 8px; cursor: pointer; display: flex; }
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
          box-shadow: 0 0 34px rgba(24,194,124,0.12), 0 14px 40px rgba(0,0,0,0.5);
        }
        .ch-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .ch-status { display: inline-flex; align-items: center; gap: 7px; font-size: 16px; font-weight: 500; letter-spacing: 0.25px; text-transform: uppercase; padding: 6px 12px; border-radius: 999px; }
        .ch-status .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
        .ch-status.live { color: #18C27C; background: rgba(24,194,124,0.12); box-shadow: 0 0 12px rgba(24,194,124,0.25); }
        .ch-status.live .dot { animation: chPulse 1.4s ease-in-out infinite; }
        .ch-status.open { color: #a78bfa; background: rgba(139,92,246,0.12); }
        .ch-status.upcoming { color: #4ea8ff; background: rgba(78,168,255,0.12); }
        .ch-status.ended { color: #9AA3B2; background: #1a1a1a; }
        @keyframes chPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .ch-pool {
          display: flex; align-items: center; gap: 6px;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 18px; font-weight: 700;
          color: #8E95A3; 
          white-space: nowrap;
        }
        .ch-name { font-size: 18px; font-weight: 700; color: #F8F8FA; line-height: 1.25; letter-spacing: 0.25px;  }
        .ch-tagline { font-size: 14px; color: #9AA3B2; line-height: 1.355; }
        .ch-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .ch-chip {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: #9AA3B2; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums;
          background: #161616; border: 1px solid #262626; border-radius: 12px; padding: 8px 12px;
        }
        .ch-chip svg { color: #6f6f6f; }
        .ch-chip.live-chip { color: #18C27C; border-color: rgba(24,194,124,0.35); background: rgba(24,194,124,0.07); box-shadow: 0 0 10px rgba(24,194,124,0.15); }
        .ch-chip.live-chip svg { color: #18C27C; }
        .ch-see-more {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 700; color: #a78bfa;
          letter-spacing: 0.25px;
        }

        .chd-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.72);
          z-index: 95; display: flex; align-items: flex-end; justify-content: center;
        }
        .chd-sheet {
          width: 100%; max-width: 480px; max-height: 90vh;
          background: #101010; border: 1px solid #1f1f1f; border-bottom: none;
          border-radius: 24px 24px 0 0;
          display: flex; flex-direction: column;
          animation: chdUp 0.24s ease;
        }
        @keyframes chdUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .chd-scroll { overflow-y: auto; padding: 20px 22px 28px; display: flex; flex-direction: column; gap: 18px; }
        .chd-scroll::-webkit-scrollbar { display: none; }
        .chd-head { display: flex; align-items: center; gap: 12px; }
        .chd-ico {
          width: 48px; height: 48px; border-radius: 16px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(24,194,124,0.12); color: #18C27C;
          box-shadow: 0 0 16px rgba(24,194,124,0.25);
        }
        .chd-ico.flame { background: rgba(240,68,56,0.12); color: #F04438; box-shadow: 0 0 16px rgba(240,68,56,0.25); }
        .chd-ico.ended { background: rgba(163,163,163,0.1); color: #9AA3B2; box-shadow: none; }
        .chd-head-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .chd-name { font-size: 18px; font-weight: 700; color: #F8F8FA; line-height: 1.25; }
        .chd-close {
          width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
          background: #1a1a1a; border: 1px solid #2a2a2a; color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .chd-tagline { font-size: 14px; color: #9AA3B2; line-height: 1.355; margin-top: -6px; }
        .chd-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .chd-stat {
          background: #141414; border: 1px solid #1f1f1f; border-radius: 16px;
          padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;
        }
        .chd-stat.full { grid-column: 1 / -1; }
        .chd-stat-l { font-size: 14px; color: #9AA3B2; display: flex; align-items: center; gap: 6px; }
        .chd-stat-v { font-size: 18px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; color: #8E95A3; }
        .chd-stat-v.green { color: #18C27C;  }
        .chd-stat-v.violet { color: #a78bfa;  }
        .chd-stat-v.red { color: #F04438;  }

        .chd-myperf {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: rgba(24,194,124,0.07); border: 1px solid rgba(24,194,124,0.22);
          border-radius: 14px; padding: 13px 16px;
          box-shadow: 0 0 16px rgba(24,194,124,0.08);
        }
        .chd-myperf .mp-label { font-size: 14px; color: #9AA3B2; display: flex; align-items: center; gap: 7px; }
        .chd-myperf .mp-val { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 16px; font-weight: 500; }
        .chd-myperf .mp-val.up { color: #18C27C;  }
        .chd-myperf .mp-val.down { color: #F04438;  }

        .chd-actions { display: flex; gap: 10px; }
        .chd-btn {
          flex: 1; height: 54px; border-radius: 16px; border: none; cursor: pointer;
          font-family: inherit; font-size: 15px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: opacity 150ms ease-out, transform 150ms ease-out;
        }
        .chd-btn:active { opacity: 0.9; transform: scale(0.98); }
        .chd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .chd-btn.join { background: linear-gradient(135deg, #18C27C, #00A843); color: #00130a; box-shadow: 0 0 22px rgba(24,194,124,0.35); }
        .chd-btn.in { background: rgba(24,194,124,0.12); color: #18C27C; border: 1px solid rgba(24,194,124,0.35); box-shadow: 0 0 16px rgba(24,194,124,0.15); }
        .chd-btn.leave {
          flex: 0 0 auto; width: 54px; background: #1a1a1a; color: #ff9d9d;
          border: 1px solid #3a2424;
        }
        .chd-btn.login { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; box-shadow: 0 0 22px rgba(139,92,246,0.35); }

        .chd-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.25px; color: #F2F4F7; display: flex; align-items: center; gap: 7px; }
        .chd-prizes { display: flex; gap: 10px; }
        .chd-prize {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
          background: #141414; border: 1px solid #232323; border-radius: 16px; padding: 16px 10px;
        }
        .chd-prize.rank1 { border-color: rgba(24,194,124,0.35); background: rgba(24,194,124,0.06); box-shadow: 0 0 18px rgba(24,194,124,0.12); }
        .chd-prize .p-medal { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.25px; color: #a78bfa; }
        .chd-prize .p-medal.silver { color: #b8c0cc; }
        .chd-prize .p-medal.bronze { color: #cd8f5f; }
        .chd-prize .p-amount { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 18px; font-weight: 700; color: #8E95A3;  }
        .chd-prize .p-note { font-size: 10.5px; color: #9AA3B2; }

        .chd-rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .chd-rules li {
          position: relative; padding-left: 18px;
          font-size: 14px; color: #9AA3B2; line-height: 1.35;
        }
        .chd-rules li::before {
          content: ''; position: absolute; left: 0; top: 7px;
          width: 8px; height: 8px; border-radius: 3px;
          background: #18C27C; box-shadow: 0 0 8px rgba(24,194,124,0.5);
        }

        .chd-lb { display: flex; flex-direction: column; }
        .chd-lb-row { display: flex; align-items: center; gap: 12px; padding: 10px 2px; border-bottom: 1px solid #1d1d1d; }
        .chd-lb-row.me { background: rgba(24,194,124,0.06); border-radius: 12px; padding: 10px 12px; }
        .lb-rank { width: 30px; text-align: center; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 14px; font-weight: 700; }
        .lb-rank.r1 { color: #18C27C;  }
        .lb-rank.r2 { color: #b8c0cc; }
        .lb-rank.r3 { color: #cd8f5f; }
        .lb-rank.other { color: #9AA3B2; }
        .lb-avatar { width: 32px; height: 32px; border-radius: 50%; background: #222; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .lb-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .lb-handle { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; color: #F8F8FA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lb-handle.me { color: #18C27C; }
        .lb-value { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 12px; color: #9AA3B2; white-space: nowrap; }
        .lb-perf { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-size: 16px; font-weight: 500; width: 80px; text-align: right; white-space: nowrap; }
        .lb-perf.up { color: #18C27C;  }
        .lb-perf.down { color: #F04438; }
        .lb-perf.flat { color: #9AA3B2; }
        .chd-lb-empty { font-size: 13px; color: #6B7A94; padding: 16px 0; text-align: center; }

        .chd-winners { display: flex; flex-direction: column; gap: 8px; }
        .chd-winner { display: flex; align-items: center; gap: 12px; font-size: 13.5px; }
        .chd-winner .w-rank { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; font-weight: 700; width: 24px; color: #18C27C; }
        .chd-winner .w-handle { flex: 1; font-weight: 600; color: #F8F8FA; }
        .chd-winner .w-perf { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; color: #18C27C; font-size: 16px; font-weight: 500; }
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
        <StatusBadge status={c.status} lang={lang} />
        <span className="ch-pool"><Trophy size={15} /> {fmtXof(c.prize_pool)} FCFA</span>
      </div>
      <div className="ch-name">{c.name}</div>
      <div className="ch-tagline">{c.tagline}</div>
      <div className="ch-chips">
        <span className="ch-chip"><Users size={14} /> {c.participants_count}</span>
        <span className="ch-chip"><CalendarDays size={14} /> {periodText(c, lang)}</span>
        {countdown && <span className="ch-chip live-chip"><Timer size={14} /> {countdown}</span>}
      </div>
      <span className="ch-see-more">{t(lang, 'chSeeMore')} ↑</span>
    </button>
  )
}

function ChallengeDetailSheet({ c, lang, user, busy, lb, onJoin, onLeave, onClose }) {
  const isOpen = c.status === 'live' || c.status === 'open'
  const isEnded = c.status === 'ended'
  const perfUp = (c.my_perf ?? 0) >= 0
  const countdown = c.status === 'live' ? daysLeft(c.end_date, lang) : null

  const lbSorted = lb || []
  const meRow = lbSorted.find(r => r.is_me)

  return (
    <div className="chd-overlay" onClick={onClose}>
      <div className="chd-sheet" onClick={e => e.stopPropagation()}>
        <div className="chd-scroll">
          <div className="chd-head">
            <span className={`chd-ico${c.status === 'upcoming' ? ' flame' : c.status === 'ended' ? ' ended' : ''}`}>
              {c.status === 'ended' ? <Crown size={22} /> : c.status === 'upcoming' ? <Flame size={22} /> : <Trophy size={22} />}
            </span>
            <div className="chd-head-text">
              <span className="chd-name">{c.name}</span>
              <StatusBadge status={c.status} lang={lang} />
            </div>
            <button className="chd-close" onClick={onClose} aria-label="close"><X size={18} /></button>
          </div>

          <div className="chd-tagline">{c.tagline}</div>

          <div className="chd-stats">
            <div className="chd-stat">
              <span className="chd-stat-l"><Trophy size={13} /> {t(lang, 'chPrizePool')}</span>
              <span className="chd-stat-v green">{fmtMoney(c.prize_pool)} FCFA</span>
            </div>
            <div className="chd-stat">
              <span className="chd-stat-l"><Wallet size={13} /> {t(lang, 'chCapital')}</span>
              <span className="chd-stat-v">{fmtMoney(c.starting_capital)}</span>
            </div>
            <div className="chd-stat">
              <span className="chd-stat-l"><Users size={13} /> {t(lang, 'chParticipants')}</span>
              <span className="chd-stat-v">{c.participants_count}{c.max_participants > 0 ? ` / ${c.max_participants}` : ''}</span>
            </div>
            <div className="chd-stat">
              <span className="chd-stat-l"><CalendarDays size={13} /> {t(lang, 'chPeriod')}</span>
              <span className="chd-stat-v violet">{fmtDate(c.start_date, lang)} ↑ {fmtDate(c.end_date, lang)}</span>
            </div>
            {countdown && (
              <div className="chd-stat full">
                <span className="chd-stat-l"><Timer size={13} /> {t(lang, 'chEnds')}</span>
                <span className="chd-stat-v green">{countdown}</span>
              </div>
            )}
          </div>

          <div className="chd-prizes">
            {(c.prizes || []).map(p => (
              <div key={p.rank} className={`chd-prize${p.rank === 1 ? ' rank1' : ''}`}>
                <span className={`p-medal${p.rank === 2 ? ' silver' : p.rank === 3 ? ' bronze' : ''}`}>
                  <Medal size={13} /> {p.label}
                </span>
                <span className="p-amount">{fmtXof(p.amount)}</span>
                <span className="p-note">FCFA</span>
              </div>
            ))}
          </div>

          {c.my_perf != null && (
            <div className="chd-myperf">
              <span className="mp-label"><TrendingUp size={14} /> {t(lang, 'chMyPerf')}</span>
              <span className={`mp-val ${perfUp ? 'up' : 'down'}`}>
                {perfUp ? '+' : ''}{c.my_perf.toFixed(2)}%
              </span>
            </div>
          )}

          {isOpen && !user && (
            <div className="chd-actions">
              <button className="chd-btn login" onClick={onJoin}>
                <LogIn size={17} /> {t(lang, 'chLoginToJoin')}
              </button>
            </div>
          )}

          {isOpen && user && (
            <div className="chd-actions">
              {c.joined ? (
                <>
                  <button className="chd-btn in" disabled>
                    <CheckCircle2 size={17} /> {t(lang, 'chJoined')}
                  </button>
                  <button className="chd-btn leave" onClick={onLeave} disabled={busy} title={t(lang, 'chLeave')}>
                    <X size={16} />
                  </button>
                </>
              ) : (
                <button className="chd-btn join" onClick={onJoin} disabled={busy}>
                  <Trophy size={17} /> {t(lang, 'chJoin')}
                </button>
              )}
            </div>
          )}

          {(c.rules || []).length > 0 && (
            <>
              <div className="chd-title"><Trophy size={12} /> {t(lang, 'chRules')}</div>
              <ul className="chd-rules">
                {c.rules.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}

          {isEnded && (c.winners || []).length > 0 && (
            <>
              <div className="chd-title"><Crown size={12} /> {t(lang, 'chWinners')}</div>
              <div className="chd-winners">
                {c.winners.map(w => (
                  <div key={w.rank} className="chd-winner">
                    <span className="w-rank">#{w.rank}</span>
                    <span className="w-handle">{w.handle}</span>
                    <span className="w-perf">+{w.perf}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(isOpen || isEnded) && (
            <>
              <div className="chd-title"><Crown size={12} /> {t(lang, 'chLeaderboard')}</div>
              {lbSorted.length === 0 ? (
                <div className="chd-lb-empty">{t(lang, 'chEmptyLb')}</div>
              ) : (
                <div className="chd-lb">
                  {lbSorted.slice(0, 10).map(r => (
                    <div key={r.rank} className={`chd-lb-row${r.is_me ? ' me' : ''}`}>
                      <span className={`lb-rank${r.rank <= 3 ? ` r${r.rank}` : ' other'}`}>{r.rank}</span>
                      <span className="lb-avatar">
                        {r.avatar ? <img src={r.avatar} alt="" /> : <span>{r.handle?.[0]}</span>}
                      </span>
                      <span className={`lb-handle${r.is_me ? ' me' : ''}`}>
                        {r.handle}
                        {r.is_me && <span style={{ marginLeft: 6, fontSize: 11 }}>· {t(lang, 'chYou')}</span>}
                      </span>
                      <span className="lb-value">{fmtXof(r.value)}</span>
                      <span className={`lb-perf ${r.perf > 0.001 ? 'up' : r.perf < -0.001 ? 'down' : 'flat'}`}>
                        {r.perf > 0.001 ? '+' : ''}{r.perf.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
