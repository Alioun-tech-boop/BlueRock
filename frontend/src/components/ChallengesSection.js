import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Trophy, Flame, Users, CalendarDays, Medal, Timer, Wallet, RefreshCw,
  Crown, CheckCircle2, LogIn,
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
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })
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

export default function ChallengesSection({ lang, user }) {
  const router = useRouter()
  const [challenges, setChallenges] = useState([])
  const [selected, setSelected] = useState(null)
  const [lb, setLb] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const load = useCallback(() => {
    getChallenges()
      .then(r => {
        if (!mounted.current) return
        const list = r.data.challenges || []
        setChallenges(list)
        const featured = list.find(c => c.is_featured || c.status === 'live') || list[0]
        setSelected(prev => prev || (featured ? featured.id : null))
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

  useEffect(() => { loadLb(selected) }, [selected, loadLb])

  const doJoin = async (c) => {
    if (!user) {
      router.push('/login?next=/community')
      return
    }
    setBusy(true)
    setError('')
    try {
      await joinChallenge(c.id)
      await load()
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
      await load()
      loadLb(c.id)
    } catch (err) {
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' ? d : t(lang, 'authError'))
    } finally {
      setBusy(false)
    }
  }

  const featured = challenges.find(c => c.is_featured || c.status === 'live')
  const others = challenges.filter(c => c !== featured)

  return (
    <div className="ch-root">
      <div className="ch-intro">
        <div className="ch-intro-title">
          <Trophy size={17} color="#D4A843" />
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

      {featured && <ChallengeCard
        c={featured} lang={lang} user={user} busy={busy}
        open={selected === featured.id}
        onToggle={() => setSelected(selected === featured.id ? null : featured.id)}
        onJoin={() => doJoin(featured)}
        onLeave={() => doLeave(featured)}
        lb={lb[featured.id]}
        hero
      />}

      {others.map(c => (
        <ChallengeCard
          key={c.id} c={c} lang={lang} user={user} busy={busy}
          open={selected === c.id}
          onToggle={() => setSelected(selected === c.id ? null : c.id)}
          onJoin={() => doJoin(c)}
          onLeave={() => doLeave(c)}
          lb={lb[c.id]}
        />
      ))}

      {challenges.length === 0 && (
        <div className="ch-empty">
          <Trophy size={26} />
          <span>{t(lang, 'chNoChallenges')}</span>
        </div>
      )}

      <style jsx global>{`
        .ch-root { display: flex; flex-direction: column; gap: 14px; padding-bottom: 20px; }
        .ch-intro { display: flex; flex-direction: column; gap: 3px; padding: 2px 2px 0; }
        .ch-intro-title { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
        .ch-intro-sub { font-size: 12px; color: #8f8f8f; line-height: 1.45; }
        .ch-error {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(255,77,79,0.08); border: 1px solid rgba(255,77,79,0.3);
          border-radius: 12px; padding: 10px 12px; font-size: 12px; color: #ff9d9d;
        }
        .ch-error button { background: rgba(255,77,79,0.2); border: none; border-radius: 8px; color: #ff9d9d; padding: 4px 8px; cursor: pointer; display: flex; }
        .ch-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 36px 0; color: #666; font-size: 13px; }

        .ch-card {
          background: linear-gradient(160deg, #141414, #101010);
          border: 1px solid #262626; border-radius: 18px;
          padding: 16px; display: flex; flex-direction: column; gap: 11px;
        }
        .ch-card.hero {
          background: linear-gradient(160deg, #1a1a10, #12120a);
          border-color: #3a3a24;
          box-shadow: 0 14px 34px rgba(0,0,0,0.55);
        }
        .ch-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .ch-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .ch-ico {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(212,168,67,0.12); color: #D4A843;
        }
        .ch-ico.flame { background: rgba(255,77,79,0.12); color: #FF4D4F; }
        .ch-status { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; padding: 4px 9px; border-radius: 8px; }
        .ch-status .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .ch-status.live { color: #00C853; background: rgba(0,200,83,0.12); }
        .ch-status.open { color: #42E8F4; background: rgba(66,232,244,0.1); }
        .ch-status.upcoming { color: #facc15; background: rgba(250,204,21,0.1); }
        .ch-status.ended { color: #8f8f8f; background: #1a1a1a; }

        .ch-name { font-size: 17px; font-weight: 800; line-height: 1.25; letter-spacing: -0.2px; }
        .ch-tagline { font-size: 12.5px; color: #a3a3a3; line-height: 1.5; }

        .ch-stats { display: flex; gap: 6px; flex-wrap: wrap; }
        .ch-stat {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; color: #9b9b9b; font-family: 'JetBrains Mono', monospace;
          background: #1a1a1a; border: 1px solid #262626; border-radius: 10px; padding: 6px 10px;
        }
        .ch-stat svg { color: #6f6f6f; }
        .ch-stat.pool { color: #D4A843; border-color: #3a3a24; }
        .ch-stat.pool svg { color: #D4A843; }

        .ch-prizes { display: flex; gap: 8px; }
        .ch-prize {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
          background: #161616; border: 1px solid #262626; border-radius: 12px; padding: 10px 6px;
        }
        .ch-prize.rank1 { background: linear-gradient(160deg, #2a2010, #1a1508); border-color: #4a3a1a; }
        .ch-prize .p-medal { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #D4A843; }
        .ch-prize .p-medal.silver { color: #b8c0cc; }
        .ch-prize .p-medal.bronze { color: #cd8f5f; }
        .ch-prize .p-amount { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; color: #fff; }
        .ch-prize .p-note { font-size: 9.5px; color: #8f8f8f; }

        .ch-actions { display: flex; gap: 10px; }
        .ch-btn {
          flex: 1; height: 46px; border-radius: 13px; border: none; cursor: pointer;
          font-family: inherit; font-size: 13.5px; font-weight: 800;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          transition: opacity 150ms ease-out, transform 150ms ease-out;
        }
        .ch-btn:active { opacity: 0.9; transform: scale(0.98); }
        .ch-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ch-btn.join { background: linear-gradient(135deg, #00C853, #00A843); color: #00130a; }
        .ch-btn.in { background: #1d1d1d; color: #00C853; border: 1px solid #2a3a2e; }
        .ch-btn.leave {
          flex: 0 0 auto; width: 46px; background: #1a1a1a; color: #ff9d9d;
          border: 1px solid #3a2424;
        }
        .ch-btn.login { background: #8b5cf6; color: #fff; }

        .ch-myperf {
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,200,83,0.07); border: 1px solid rgba(0,200,83,0.2);
          border-radius: 12px; padding: 10px 13px;
        }
        .ch-myperf .mp-label { font-size: 11px; color: #a3a3a3; display: flex; align-items: center; gap: 6px; }
        .ch-myperf .mp-val { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 800; }
        .ch-myperf .mp-val.up { color: #00C853; }
        .ch-myperf .mp-val.down { color: #F23645; }

        .ch-details { border-top: 1px solid #232323; padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
        .ch-dl-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; color: #9b9b9b; }
        .ch-dl-row b { color: #e8e8e8; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
        .ch-rules-title { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #6f6f6f; }
        .ch-rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .ch-rules li {
          position: relative; padding-left: 14px;
          font-size: 11.5px; color: #b5b5b5; line-height: 1.45;
        }
        .ch-rules li::before {
          content: ''; position: absolute; left: 0; top: 6px;
          width: 6px; height: 6px; border-radius: 2px; background: #D4A843;
        }

        .ch-lb-title { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #6f6f6f; margin: 2px 0 6px; }
        .ch-lb { display: flex; flex-direction: column; }
        .ch-lb-row { display: flex; align-items: center; gap: 10px; padding: 8px 2px; border-bottom: 1px solid #1d1d1d; }
        .ch-lb-row.me { background: rgba(0,200,83,0.06); border-radius: 10px; padding: 8px 10px; }
        .lb-rank { width: 26px; text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 800; }
        .lb-rank.r1 { color: #D4A843; }
        .lb-rank.r2 { color: #b8c0cc; }
        .lb-rank.r3 { color: #cd8f5f; }
        .lb-rank.other { color: #6f6f6f; }
        .lb-avatar { width: 28px; height: 28px; border-radius: 50%; background: #222; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .lb-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .lb-handle { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lb-handle.me { color: #00C853; }
        .lb-value { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #8f8f8f; white-space: nowrap; }
        .lb-perf { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 800; width: 74px; text-align: right; white-space: nowrap; }
        .lb-perf.up { color: #00C853; }
        .lb-perf.down { color: #F23645; }
        .lb-perf.flat { color: #8f8f8f; }
        .ch-lb-empty { font-size: 12px; color: #6f6f6f; padding: 14px 0; text-align: center; }

        .ch-winners { display: flex; flex-direction: column; gap: 6px; }
        .ch-winner { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
        .ch-winner .w-rank { font-family: 'JetBrains Mono', monospace; font-weight: 800; width: 20px; color: #D4A843; }
        .ch-winner .w-handle { flex: 1; font-weight: 600; }
        .ch-winner .w-perf { font-family: 'JetBrains Mono', monospace; color: #00C853; font-weight: 700; }

        .ch-foot { text-align: center; font-size: 11px; color: #6f6f6f; line-height: 1.5; padding: 2px 0 6px; }
      `}</style>
    </div>
  )
}

function ChallengeCard({ c, lang, user, busy, open, onToggle, onJoin, onLeave, lb, hero }) {
  const isOpen = c.status === 'live' || c.status === 'open'
  const isEnded = c.status === 'ended'
  const perfUp = (c.my_perf ?? 0) >= 0
  const countdown = c.status === 'live' ? daysLeft(c.end_date, lang) : null

  const lbSorted = lb || []
  const meRow = lbSorted.find(r => r.is_me)

  return (
    <div className={`ch-card${hero ? ' hero' : ''}`}>
      <div className="ch-top">
        <div className="ch-left">
          <span className={`ch-ico${c.status === 'upcoming' ? ' flame' : ''}`}>
            {c.status === 'ended' ? <Crown size={17} /> : c.status === 'upcoming' ? <Flame size={17} /> : <Trophy size={17} />}
          </span>
          <StatusBadge status={c.status} lang={lang} />
        </div>
        <span className="ch-stat pool"><Trophy size={12} /> {fmtXof(c.prize_pool)} FCFA</span>
      </div>

      <div className="ch-name">{c.name}</div>
      <div className="ch-tagline">{c.tagline}</div>

      <div className="ch-stats">
        <span className="ch-stat"><CalendarDays size={12} /> {c.status === 'live' ? t(lang, 'chEnds') : t(lang, 'chStarts')} {fmtDate(c.status === 'live' ? c.end_date : c.start_date, lang)}{countdown ? ` · ${countdown}` : ''}</span>
        <span className="ch-stat"><Users size={12} /> {c.participants_count} {t(lang, 'chParticipants')}</span>
        <span className="ch-stat"><Wallet size={12} /> {fmtMoney(c.starting_capital)}</span>
      </div>

      <div className="ch-prizes">
        {(c.prizes || []).map(p => (
          <div key={p.rank} className={`ch-prize${p.rank === 1 ? ' rank1' : ''}`}>
            <span className={`p-medal${p.rank === 2 ? ' silver' : p.rank === 3 ? ' bronze' : ''}`}>
              <Medal size={12} /> {p.label}
            </span>
            <span className="p-amount">{fmtXof(p.amount)}</span>
            <span className="p-note">FCFA</span>
          </div>
        ))}
      </div>

      {isOpen && !user && (
        <div className="ch-actions">
          <button className="ch-btn login" onClick={onJoin}>
            <LogIn size={15} /> {t(lang, 'chLoginToJoin')}
          </button>
        </div>
      )}

      {isOpen && user && (
        <div className="ch-actions">
          {c.joined ? (
            <>
              <button className="ch-btn in" disabled={busy}>
                <CheckCircle2 size={15} /> {t(lang, 'chJoined')}
                {c.my_perf != null && (
                  <span className={`mp-val ${perfUp ? 'up' : 'down'}`}>
                    {perfUp ? '+' : ''}{c.my_perf.toFixed(2)}%
                  </span>
                )}
              </button>
              <button className="ch-btn leave" onClick={onLeave} disabled={busy} title={t(lang, 'chLeave')}>
                <RefreshCw size={14} />
              </button>
            </>
          ) : (
            <button className="ch-btn join" onClick={onJoin} disabled={busy}>
              <Trophy size={15} /> {t(lang, 'chJoin')}
            </button>
          )}
        </div>
      )}

      <button className="ch-details-toggle" onClick={onToggle}>
        {open ? '▲' : '▼'} {open ? t(lang, 'chHide') : t(lang, 'chDetails')}
      </button>

      {open && (
        <div className="ch-details">
          <div className="ch-dl-row">
            <span>{t(lang, 'chPeriod')}</span>
            <b>{fmtDate(c.start_date, lang)} → {fmtDate(c.end_date, lang)}</b>
          </div>
          <div className="ch-dl-row">
            <span>{t(lang, 'chPrizePool')}</span>
            <b>{fmtMoney(c.prize_pool)} FCFA</b>
          </div>
          {c.max_participants > 0 && (
            <div className="ch-dl-row">
              <span>{t(lang, 'chMaxParticipants')}</span>
              <b>{c.max_participants}</b>
            </div>
          )}

          {(c.rules || []).length > 0 && (
            <>
              <div className="ch-rules-title">{t(lang, 'chRules')}</div>
              <ul className="ch-rules">
                {c.rules.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}

          {isEnded && (c.winners || []).length > 0 && (
            <>
              <div className="ch-lb-title"><Crown size={12} /> {t(lang, 'chWinners')}</div>
              <div className="ch-winners">
                {c.winners.map(w => (
                  <div key={w.rank} className="ch-winner">
                    <span className="w-rank">#{w.rank}</span>
                    <span className="w-handle">{w.handle}</span>
                    <span className="w-perf">+{w.perf}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(isOpen || c.status === 'ended') && (
            <>
              <div className="ch-lb-title"><Trophy size={12} /> {t(lang, 'chLeaderboard')}</div>
              {lbSorted.length === 0 ? (
                <div className="ch-lb-empty">{t(lang, 'chEmptyLb')}</div>
              ) : (
                <div className="ch-lb">
                  {lbSorted.slice(0, 10).map(r => (
                    <div key={r.rank} className={`ch-lb-row${r.is_me ? ' me' : ''}`}>
                      <span className={`lb-rank${r.rank <= 3 ? ` r${r.rank}` : ' other'}`}>{r.rank}</span>
                      <span className="lb-avatar">
                        {r.avatar ? <img src={r.avatar} alt="" /> : <span>{r.handle?.[0]}</span>}
                      </span>
                      <span className={`lb-handle${r.is_me ? ' me' : ''}`}>
                        {r.handle}
                        {r.is_me && <span style={{ marginLeft: 6, fontSize: 10 }}>· {t(lang, 'chYou')}</span>}
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
      )}

      <style jsx>{`
        .ch-details-toggle {
          align-self: center; background: none; border: none;
          color: #6f6f6f; font-size: 11px; font-weight: 600; cursor: pointer;
          font-family: inherit; display: flex; align-items: center; gap: 5px;
          padding: 2px 10px;
        }
        .ch-details-toggle:hover { color: #a3a3a3; }
      `}</style>
    </div>
  )
}
