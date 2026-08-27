import { useEffect, useRef, useState, useCallback } from 'react'
import { Users, BadgeCheck, Crown, ShieldCheck, ArrowLeft } from 'lucide-react'
import { t } from '../../lib/i18n'
import { getCommunityGroupMembers, getCommunityMe, followCommunityUser } from '../../services/api'
import { PhotoAvatar } from '../../lib/photo'
import TriLoader from '../TriLoader'

const ROLE_KEY = { member: 'grpRoleMember', moderator: 'grpRoleModerator', admin: 'grpRoleAdmin', creator: 'grpRoleCreator' }

export default function GroupMembersView({ slug, lang, embedded = false, onBack, onOpenUser }) {
  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [me, setMe] = useState(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    getCommunityMe().then(r => { if (mounted.current) setMe(r.data.user || null) }).catch(() => {})
    return () => { mounted.current = false }
  }, [])

  const fetchMembers = useCallback((off, replace) => {
    if (off === 0) setLoading(true)
    else setLoadingMore(true)
    setFailed(false)
    getCommunityGroupMembers(slug, { limit: 60, offset: off })
      .then(r => {
        if (!mounted.current) return
        const rows = r.data.members || []
        setMembers(prev => (replace ? rows : [...prev, ...rows]))
        setTotal(r.data.total || 0)
        setOffset(off + rows.length)
      })
      .catch(() => { if (mounted.current) setFailed(true) })
      .finally(() => { if (mounted.current) { setLoading(false); setLoadingMore(false) } })
  }, [slug])

  useEffect(() => { fetchMembers(0, true) }, [fetchMembers])

  const follow = (profileId) => {
    followCommunityUser(profileId).catch(() => {})
  }

  return (
    <div className={`co-gvm${embedded ? ' co-gvm-embedded' : ''}`}>
      {embedded && onBack && (
        <div className="co-gvm-head">
          <button className="co-gvm-back" onClick={onBack} aria-label={t(lang, 'cBack')}>
            <ArrowLeft size={17} />
          </button>
          <span className="co-gvm-title">{t(lang, 'grpMembersTitle')}</span>
          <span className="co-gvm-sp" />
        </div>
      )}

      {loading ? (
        <div className="co-gvm-load"><TriLoader compact label={t(lang, 'loading')} /></div>
      ) : failed ? (
        <div className="co-gvm-fail">
          <span>{t(lang, 'loadError')}</span>
          <button className="co-gvm-retry" onClick={() => fetchMembers(0, true)}>{t(lang, 'retry')}</button>
        </div>
      ) : members.length === 0 ? (
        <div className="co-gvm-empty"><Users size={28} /><span>{t(lang, 'grpNoMembers')}</span></div>
      ) : (
        <>
          <div className="co-gvm-grid">
            {members.map(m => {
              const isMe = me && m.profile_id === me.id
              return (
                <div
                  className="co-gvm-card"
                  key={m.profile_id}
                  onClick={() => onOpenUser && onOpenUser(m.profile_id)}
                  style={{ cursor: onOpenUser ? 'pointer' : 'default' }}
                >
                  <PhotoAvatar name={m.display_name} avatar={m.avatar} color={m.avatar_color} className="co-gvm-ava" size={54} />
                  <div className="co-gvm-info">
                    <div className="co-gvm-name">
                      {m.display_name}
                      {m.verified && <BadgeCheck size={13} color="#18C27C" />}
                      {m.is_pro && <BadgeCheck size={13} color="#E8B84B" />}
                      {m.role === 'creator' && <Crown size={13} color="#E8B84B" />}
                      {m.role === 'admin' && <ShieldCheck size={13} color="#18C27C" />}
                    </div>
                    <div className="co-gvm-sub">
                      {m.handle ? `@${m.handle}` : ''}
                      {m.status && m.status !== 'active' ? ` · ${t(lang, ROLE_KEY[m.status] || m.status)}` : ''}
                    </div>
                    <div className="co-gvm-role">{ROLE_KEY[m.role] ? t(lang, ROLE_KEY[m.role]) : m.role}</div>
                  </div>
                  {!isMe && (
                    <button
                      className="co-gvm-follow"
                      onClick={(e) => { e.stopPropagation(); follow(m.profile_id) }}
                    >
                      {t(lang, 'cFollow')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {offset < total && (
            <button className="co-gvm-more" onClick={() => fetchMembers(offset, false)} disabled={loadingMore}>
              {loadingMore ? t(lang, 'loading') : t(lang, 'grpLoadMore')}
            </button>
          )}
        </>
      )}

      <style jsx global>{`
        .co-gvm { display: flex; flex-direction: column; gap: 14px; }
        .co-gvm-head {
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
          padding: 2px 0 4px;
        }
        .co-gvm-back {
          justify-self: start; display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
          color: rgba(255,255,255,.85); border-radius: 999px; padding: 8px 14px;
          font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700; cursor: pointer;
        }
        .co-gvm-title {
          font-family: var(--font-rounded); font-size: 14px; font-weight: 800; color: rgba(255,255,255,.9);
        }
        .co-gvm-sp { width: 40px; }
        .co-gvm-load, .co-gvm-fail, .co-gvm-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 50px 0; color: rgba(255,255,255,.5); text-align: center; font-size: 14px;
        }
        .co-gvm-retry {
          border: none; cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 700;
          color: #000; background: #fff; border-radius: 10px; padding: 10px 24px;
        }
        .co-gvm-grid { display: flex; flex-direction: column; gap: 10px; }
        .co-gvm-card {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
          border-radius: 16px; transition: border-color .15s, background .15s;
        }
        .co-gvm-card:hover { border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.06); }
        .co-gvm-ava {
          width: 54px; height: 54px; border-radius: 50%; flex: none;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 800; color: #fff; background-color: #232329;
          box-shadow: 0 12px 26px -8px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.14);
        }
        .co-gvm-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
        .co-gvm-name {
          display: flex; align-items: center; gap: 5px; max-width: 100%;
          font-family: var(--font-rounded); font-size: 14px; font-weight: 700; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .co-gvm-name svg { flex: none; }
        .co-gvm-sub { font-size: 12px; color: rgba(255,255,255,.45); }
        .co-gvm-role {
          font-size: 11px; font-weight: 700; color: rgba(255,255,255,.4);
          text-transform: uppercase; letter-spacing: .05em;
        }
        .co-gvm-follow {
          flex: none; border: none; cursor: pointer; font-family: var(--font-rounded);
          font-size: 12.5px; font-weight: 800; color: #04120a; background: #1ED760;
          border-radius: 999px; padding: 8px 16px; transition: filter .15s;
        }
        .co-gvm-follow:hover { filter: brightness(1.06); }
        .co-gvm-more {
          align-self: center; border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.05); color: #fff; border-radius: 999px;
          padding: 11px 26px; font-family: var(--font-rounded); font-size: 13.5px; font-weight: 800;
          cursor: pointer;
        }
        .co-gvm-more:disabled { opacity: .55; cursor: default; }
      `}</style>
    </div>
  )
}
