import { useState, useEffect, useRef, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus, Flame, BadgeCheck, UserPlus, UserCheck, Crown, Rocket, Repeat2 } from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getCommunityDiscover, getCommunitySuggestions, followCommunityUser,
} from '../../services/api'
import ServerDownArt from '../ServerDownArt'
import TriLoader from '../TriLoader'
import { PhotoAvatar } from '../../lib/photo'

function initialsOf(name) {
  return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function changeBadge(c) {
  if (c == null) return { c: 'rgba(255,255,255,0.4)', i: null }
  if (c > 0) return { c: '#18C27C', i: <TrendingUp size={12} /> }
  if (c < 0) return { c: '#E11D48', i: <TrendingDown size={12} /> }
  return { c: 'rgba(255,255,255,0.5)', i: <Minus size={12} /> }
}

function FollowBtn({ id, isFollowing, lang, onToggle }) {
  const [busy, setBusy] = useState(false)
  const [on, setOn] = useState(!!isFollowing)
  const click = () => {
    if (busy) return
    setBusy(true)
    followCommunityUser(id)
      .then(r => setOn(r.data.following))
      .catch(() => {})
      .finally(() => { setBusy(false); if (onToggle) onToggle(id, on) })
  }
  return (
    <button className={`ds-follow ${on ? 'on' : ''}`} onClick={click} disabled={busy}>
      {on ? <UserCheck size={13} /> : <UserPlus size={13} />}
      {on ? t(lang, 'cFollowing') : t(lang, 'cFollow')}
    </button>
  )
}

export default function DiscoverSection({ lang }) {
  const [disc, setDisc] = useState(null)
  const [sugg, setSugg] = useState([])
  const [failed, setFailed] = useState(false)
  const [meId, setMeId] = useState(null)
  const mounted = useRef(true)

  const loadSugg = useCallback(() => {
    getCommunitySuggestions(5)
      .then(r => { if (mounted.current) setSugg(r.data.suggestions || []) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    mounted.current = true
    getCommunityDiscover()
      .then(r => { if (mounted.current) setDisc(r.data) })
      .catch(() => { if (mounted.current) setFailed(true) })
    getCommunitySuggestions(5)
      .then(r => { if (mounted.current) setSugg(r.data.suggestions || []) })
      .catch(() => {})
    import('../../services/api').then(m => m.getCommunityMe())
      .then(r => { if (mounted.current) setMeId(r.data.user?.id ?? null) })
      .catch(() => {})
    return () => { mounted.current = false }
  }, [])

  if (failed) return <div className="ds-root"><ServerDownArt message={t(lang, 'cEmpty')} /></div>
  if (!disc) return <div className="ds-root"><TriLoader compact label={t(lang, 'cTrending')} /></div>

  const { trending_symbols: trend, top_analysts: analysts, editors_picks: editors, stats } = disc
  const followChanged = (id) => {
    setSugg(prev => prev.filter(s => s.id !== id))
    if (analysts) {
      setDisc(prev => ({
        ...prev,
        top_analysts: analysts.map(a => a.id === id ? { ...a, is_following: !a.is_following } : a),
      }))
    }
  }

  return (
    <div className="ds-root">
      {stats && (
        <div className="ds-stats">
          <span><b>{stats.total_posts}</b> {t(lang, 'cStatsPosts')}</span>
          <span><b>{stats.posts_this_week}</b> {t(lang, 'cStatsWeek')}</span>
          <span><b>{stats.total_profiles}</b> {t(lang, 'cStatsMembers')}</span>
        </div>
      )}

      {trend && trend.length > 0 && (
        <div className="ds-card">
          <div className="ds-head"><Flame size={15} />{t(lang, 'cTrending')}</div>
          <div className="ds-chips">
            {trend.map(sym => {
              const b = changeBadge(sym.change_percent)
              return (
                <div className="ds-chip" key={sym.symbol}>
                  <span className="ds-tick">{sym.symbol}</span>
                  <span className="ds-name">{sym.name}</span>
                  <span style={{ color: b.c }}>{b.i}{sym.price != null ? sym.price.toLocaleString('fr-FR') : '—'}</span>
                  <span className="ds-fade">{sym.posts} posts</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {analysts && analysts.length > 0 && (
        <div className="ds-card">
          <div className="ds-head"><Crown size={15} />{t(lang, 'cTopAnalysts')}</div>
          <div className="ds-rows">
            {analysts.map(a => (
              <div className="ds-row" key={a.id}>
                <PhotoAvatar name={a.display_name} avatar={a.avatar} color={a.avatar_color} className="ds-avatar" size={40} />
                <div className="ds-rowcol">
                  <div className="ds-rname">
                    {a.display_name}
                    {a.verified && <BadgeCheck size={13} color="#18C27C" />}
                    {a.is_pro && <span className="ds-pro">PRO</span>}
                  </div>
                  <div className="ds-fade">@{a.handle} · <Rocket size={10} style={{ verticalAlign: '-1px' }} /> {a.rockets_received}</div>
                </div>
                {meId !== a.id && <FollowBtn id={a.id} isFollowing={a.is_following} lang={lang} onToggle={followChanged} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {sugg.length > 0 && (
        <div className="ds-card">
          <div className="ds-head"><UserPlus size={15} />{t(lang, 'cSuggestions')}</div>
          <div className="ds-rows">
            {sugg.map(s => (
              <div className="ds-row" key={s.id}>
                <PhotoAvatar name={s.display_name} avatar={s.avatar} color={s.avatar_color} className="ds-avatar" size={40} />
                <div className="ds-rowcol">
                  <div className="ds-rname">{s.display_name}{s.verified && <BadgeCheck size={13} color="#18C27C" />}</div>
                  <div className="ds-fade">@{s.handle} · {s.followers_count} {t(lang, 'cFollowers')}</div>
                </div>
                <FollowBtn id={s.id} isFollowing={false} lang={lang} onToggle={followChanged} />
              </div>
            ))}
          </div>
        </div>
      )}

      {editors && editors.length > 0 && (
        <div className="ds-card">
          <div className="ds-head"><BadgeCheck size={15} />{t(lang, 'cEditorBadge')}</div>
          <div className="ds-rows">
            {editors.map(p => (
              <div className="ds-editor" key={p.id}>
                <div className="ds-etitle">{p.title}</div>
                  <div className="ds-fade">
                    {p.symbol} · {p.author?.display_name} · <Rocket size={10} style={{ verticalAlign: '-1px' }} /> {p.rockets} · <Repeat2 size={10} style={{ verticalAlign: '-1px' }} /> {p.shares}
                  </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .ds-root { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
        .ds-loading { color: rgba(255,255,255,0.45); font-size: 13px; text-align: center; }
        .ds-stats {
          display: flex; justify-content: space-between; gap: 8px;
          background: #101014; border: 1px solid #ffffff12; border-radius: 14px; padding: 10px 14px;
          font-size: 11.5px; color: rgba(255,255,255,0.55);
        }
        .ds-stats b { color: #fff; font-size: 14px; display: block; }
        .ds-card { background: #101014; border: 1px solid #ffffff12; border-radius: 16px; padding: 13px; }
        .ds-head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; margin-bottom: 10px; }
        .ds-chips { display: flex; flex-direction: column; gap: 7px; }
        .ds-chip {
          display: flex; align-items: center; gap: 8px; background: #ffffff08;
          border: 1px solid #ffffff10; border-radius: 11px; padding: 8px 11px; font-size: 12.5px;
        }
        .ds-tick {
          font-family: 'Inter', -apple-system, sans-serif; font-weight: 800; color: #fff;
          background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.35); border-radius: 6px; padding: 1px 6px; font-size: 11.5px;
        }
        .ds-name { color: rgba(255,255,255,0.85); font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ds-fade { color: rgba(255,255,255,0.4); font-size: 11.5px; }
        .ds-rows { display: flex; flex-direction: column; gap: 9px; }
        .ds-row { display: flex; align-items: center; gap: 9px; }
        .ds-avatar {
          width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center;
          justify-content: center; font-size: 12px; font-weight: 800; color: #fff; flex: none;
        }
        .ds-rowcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .ds-rname { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 800; }
        .ds-pro {
          background: #F59E0B1f; color: #F59E0B; border: 1px solid #F59E0B44; border-radius: 999px;
          padding: 0 6px; font-size: 9px; font-weight: 900; letter-spacing: 0.04em;
        }
        .ds-follow {
          display: inline-flex; align-items: center; gap: 4px; background: #FFFFFF; color: #000;
          border: none; border-radius: 8px; padding: 6px 10px; font-size: 11.5px; font-weight: 800; flex: none;
        }
        .ds-follow:hover { background: #E4E5EA; }
        .ds-follow.on { background: #ffffff0f; color: rgba(255,255,255,0.6); border: 1px solid #ffffff14; }
        .ds-editor { background: #ffffff08; border: 1px solid #ffffff10; border-radius: 11px; padding: 9px 11px; }
        .ds-etitle { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
      `}</style>
    </div>
  )
}