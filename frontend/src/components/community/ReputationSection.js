import { useCallback, useEffect, useState } from 'react'
import { Trophy, Star, RefreshCw, Rocket, Repeat2, Eye, Users, ShieldCheck, Crown } from 'lucide-react'
import { t } from '../../lib/i18n'
import { getMyReputation, getReputationLeaderboard } from '../../services/api'
import TriLoader from '../TriLoader'

const MEDALS = ['#F5C518', '#C0C0C0', '#CD7F32']

export default function ReputationSection({ lang }) {
  const [mine, setMine] = useState(null)
  const [mineFailed, setMineFailed] = useState(false)
  const [lb, setLb] = useState([])
  const [lbFailed, setLbFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadMine = useCallback(() => {
    getMyReputation()
      .then(r => { setMine(r.data); setMineFailed(false) })
      .catch(() => setMineFailed(true))
  }, [])

  const loadLb = useCallback(() => {
    getReputationLeaderboard(20)
      .then(r => { setLb(r.data.leaderboard || []); setLbFailed(false) })
      .catch(() => setLbFailed(true))
  }, [])

  useEffect(() => { loadMine(); loadLb() }, [loadMine, loadLb])

  const refresh = () => {
    setRefreshing(true)
    Promise.all([getMyReputation().then(r => setMine(r.data)).catch(() => setMineFailed(true)),
                 getReputationLeaderboard(20).then(r => setLb(r.data.leaderboard || [])).catch(() => setLbFailed(true))])
      .finally(() => setRefreshing(false))
  }

  const next = mine?.next
  const progress = next ? Math.max(0, Math.min(100, Math.round(((mine.score - 50) / (next.score - 50)) * 100))) : 100
  const m = mine?.metrics

  return (
    <section className="rep-root">
      <div className="rep-head">
        <span className="rep-title"><Trophy size={16} color="#F5C518" />{t(lang, 'cRepTitle')}</span>
        <button className="rep-refresh" onClick={refresh} disabled={refreshing} title={t(lang, 'cRepRefresh')}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
        </button>
      </div>
      {!mineFailed && !mine && <TriLoader compact label={t(lang, 'cRepScore')} />}
      {!mineFailed && mine && (
        <div className="rep-card">
          <div className="rep-top">
            <div className="rep-score-box">
              <span className="rep-score-num">{mine.score}</span>
              <span className="rep-score-lbl">{t(lang, 'cRepScore')}</span>
            </div>
            <div className="rep-level-box">
              <div className="rep-level-name">{t(lang, mine.level_key || 'repL1')}</div>
              <div className="rep-level-meta">{t(lang, 'cRepLevel')} {mine.level}<Star size={11} color="#F5C518" /></div>
              {next ? (
                <div className="rep-next">
                  <div className="rep-next-track">
                    <div className="rep-next-bar" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="rep-next-txt">
                    {next.score - mine.score} {t(lang, 'cRepPointsTo')} · {t(lang, 'cRepNextLevel')} {next.level}
                  </div>
                </div>
              ) : (
                <div className="rep-next-txt rep-max">{t(lang, 'repL10')} ✦</div>
              )}
            </div>
          </div>
          {m && (
            <div className="rep-metrics">
              <div className="rep-metric"><Rocket size={12} color="#18C27C" /><b>{m.rockets_received}</b>{t(lang, 'cRepRockets')}</div>
              <div className="rep-metric"><Repeat2 size={12} color="#fff" /><b>{m.shares_received}</b>{t(lang, 'cRepShares')}</div>
              <div className="rep-metric"><Eye size={12} color="#F59E0B" /><b>{m.views_received}</b>{t(lang, 'cRepViews')}</div>
              <div className="rep-metric"><Users size={12} color="#EC4899" /><b>{m.followers}</b>{t(lang, 'cRepFollowers')}</div>
              <div className="rep-metric"><ShieldCheck size={12} color="#22D3EE" /><b>{m.resolved_by_me}</b>{t(lang, 'cRepResolved')}</div>
            </div>
          )}
          <div className="rep-badges-head">{t(lang, 'cRepBadges')} ({mine.badges.length})</div>
          {mine.badges.length > 0 ? (
            <div className="rep-badges">
              {mine.badges.map(b => (
                <div key={b.code} className="rep-badge" title={`${t(lang, b.goal_key)}`}>
                  <span className="rep-badge-icon"><Trophy size={13} color="#F5C518" /></span>
                  <span className="rep-badge-name">{t(lang, b.label_key)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rep-no-badges">{t(lang, 'cRepNoBadges')}</div>
          )}
        </div>
      )}
      <div className="rep-lb-head">{t(lang, 'cRepLeaderboard')}</div>
      <div className="rep-lb-sub">{t(lang, 'cRepLeaderboardSub')}</div>
      {!lbFailed && lb.length > 0 ? (
        <div className="rep-lb">
          {lb.map(row => (
            <div key={row.user.id} className={`rep-lb-row ${mine && row.user.id === mine.user?.id ? 'me' : ''}`}>
              <span className="rep-rank">
                {row.rank <= 3 ? <span style={{ color: MEDALS[row.rank - 1] }}>#{row.rank}</span> : `#${row.rank}`}
              </span>
              <img className="rep-avatar" src={row.user.avatar} alt="" />
              <span className="rep-handle">{row.user.display_name}{row.user.is_premium ? <Crown size={12} color="#E8B84B" aria-label="Premium" /> : null}</span>
              <span className="rep-lvl">{t(lang, row.level_key || 'repL1')}</span>
              <span className="rep-badges-count"><Trophy size={11} color="#F5C518" />{row.badges_count}</span>
              <b className="rep-lb-score">{row.score}</b>
            </div>
          ))}
        </div>
      ) : lbFailed ? null : (
        <TriLoader compact label={t(lang, 'cRepLeaderboard')} />
      )}
      <style jsx>{`
        .rep-root {
          background: #0A0A0D; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px;
          padding: 14px; display: flex; flex-direction: column; gap: 10px; margin-top: 10px;
        }
        .rep-head { display: flex; align-items: center; gap: 8px; }
        .rep-title { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: #fff; }
        .rep-refresh {
          margin-left: auto; background: #ffffff0a; border: 1px solid #ffffff14; color: rgba(255,255,255,0.7);
          border-radius: 999px; width: 26px; height: 26px; display: inline-flex; align-items: center;
          justify-content: center; cursor: pointer;
        }
        .rep-refresh .spin { animation: repSpin 0.8s linear infinite; }
        @keyframes repSpin { to { transform: rotate(360deg); } }
        .rep-card { background: #ffffff08; border: 1px solid #ffffff12; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 11px; }
        .rep-top { display: flex; gap: 14px; align-items: stretch; }
        .rep-score-box {
          flex: none; width: 74px; border-radius: 10px; background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05));
          border: 1px solid rgba(255,255,255,0.35); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
        }
        .rep-score-num { font-family: 'Inter', -apple-system, sans-serif; font-size: 26px; font-weight: 800; color: #fff; line-height: 1; }
        .rep-score-lbl { font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 700; }
        .rep-level-box { flex: 1; display: flex; flex-direction: column; gap: 5px; justify-content: center; }
        .rep-level-name { font-size: 16px; font-weight: 800; color: #fff; }
        .rep-level-meta { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: rgba(255,255,255,0.55); }
        .rep-next { display: flex; flex-direction: column; gap: 4px; }
        .rep-next-track { height: 6px; border-radius: 999px; background: #ffffff0d; overflow: hidden; }
        .rep-next-bar { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #fff, #E4E5EA); }
        .rep-next-txt { font-size: 10.5px; color: rgba(255,255,255,0.45); }
        .rep-max { color: #F5C518; font-weight: 800; }
        .rep-metrics { display: flex; flex-wrap: wrap; gap: 7px; }
        .rep-metric {
          display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: rgba(255,255,255,0.55);
          background: #ffffff0a; border: 1px solid #ffffff10; border-radius: 999px; padding: 4px 9px;
        }
        .rep-metric b { color: #fff; font-family: 'Inter', -apple-system, sans-serif; }
        .rep-badges-head { font-size: 11.5px; font-weight: 800; color: rgba(255,255,255,0.6); }
        .rep-badges { display: flex; flex-wrap: wrap; gap: 6px; }
        .rep-badge {
          display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700;
          background: #F5C51814; border: 1px solid #F5C51833; color: #ffd76e; border-radius: 999px; padding: 3px 9px;
        }
        .rep-badge-icon { display: inline-flex; }
        .rep-no-badges { font-size: 11.5px; color: rgba(255,255,255,0.4); }
        .rep-lb-head { font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.8); margin-top: 2px; }
        .rep-lb-sub { font-size: 11px; color: rgba(255,255,255,0.45); margin-top: -6px; }
        .rep-lb { display: flex; flex-direction: column; border: 1px solid #ffffff0d; border-radius: 12px; overflow: hidden; }
        .rep-lb-row {
          display: flex; align-items: center; gap: 8px; padding: 7px 10px; font-size: 12.5px;
          border-top: 1px solid #ffffff0a; background: #ffffff05;
        }
        .rep-lb-row:first-child { border-top: none; }
        .rep-lb-row.me { background: rgba(255,255,255,0.10); }
        .rep-rank { font-family: 'Inter', -apple-system, sans-serif; font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.5); width: 34px; flex: none; }
        .rep-avatar { width: 24px; height: 24px; border-radius: 50%; flex: none; object-fit: cover; }
        .rep-handle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,0.85); font-weight: 700; }
        .rep-crown { margin-left: 4px; font-size: 10px; }
        .rep-lvl { font-size: 10px; color: #fff; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.35); border-radius: 999px; padding: 1px 7px; flex: none; }
        .rep-badges-count { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; color: rgba(255,255,255,0.5); flex: none; }
        .rep-lb-score { font-family: 'Inter', -apple-system, sans-serif; font-size: 13px; color: #fff; flex: none; }
      `}</style>
    </section>
  )
}
