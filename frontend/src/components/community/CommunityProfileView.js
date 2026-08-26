import { useEffect, useState } from 'react'
import { BadgeCheck, ShieldCheck } from 'lucide-react'
import PostCard from './PostCard'
import { t } from '../../lib/i18n'
import { getCommunityMe, getCommunityUser, followCommunityUser } from '../../services/api'

export default function CommunityProfileView({ id, lang, me: meProp, onOpenPost }) {
  const [me, setMe] = useState(meProp || null)
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [notFound, setNotFound] = useState(false)
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!meProp) getCommunityMe().then(r => setMe(r.data.user || null)).catch(() => {})
  }, [meProp])

  useEffect(() => {
    if (!id) return
    let alive = true
    setUser(null)
    setPosts([])
    setNotFound(false)
    getCommunityUser(id)
      .then(r => {
        if (!alive) return
        setUser(r.data.user || null)
        setPosts(r.data.posts || [])
        setFollowing(!!r.data.user?.is_following)
      })
      .catch(() => { if (alive) setNotFound(true) })
    return () => { alive = false }
  }, [id])

  const onFollow = () => {
    if (!me) return
    if (busy) return
    setBusy(true)
    followCommunityUser(id)
      .then(r => {
        setFollowing(!!r.data.following)
        setUser(u => u ? { ...u, followers_count: (u.followers_count || 0) + (r.data.following ? 1 : -1) } : u)
      })
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  const onDeleted = (pid) => setPosts(ps => ps.filter(p => p.id !== pid))

  if (notFound) return <div className="cu-empty">{t(lang, 'cPostMissing')}</div>
  if (!user) return <div className="cu-empty">{t(lang, 'cFeed')}…</div>

  return (
    <div className="cu-root">
      <div className="cu-head">
        <div
          className="cu-cover"
          style={{ background: `linear-gradient(135deg, ${user.avatar_color || '#2b2b31'}, #17171b)` }}
        >
          <span className="cu-avatar">{user.avatar ? '' : (user.display_name || '?').slice(0, 2).toUpperCase()}</span>
          {user.avatar && <img src={user.avatar} alt="" className="cu-avatar-img" />}
        </div>
        <div className="cu-head-row">
          <div className="cu-id">
            <div className="cu-name">
              {user.display_name}
              {user.verified && <ShieldCheck size={15} color="#18C27C" />}
              {user.is_pro && <span className="cu-pro"><BadgeCheck size={11} /> Pro</span>}
            </div>
            <div className="cu-sub">@{user.handle}</div>
          </div>
          {!user.is_me && (
            <button className={`cu-follow ${following ? 'on' : ''}`} onClick={onFollow} disabled={busy}>
              {following ? t(lang, 'cFollowing') : t(lang, 'cFollow')}
            </button>
          )}
        </div>
        {user.bio && <div className="cu-bio">{user.bio}</div>}
        <div className="cu-stats">
          <span><b>{user.posts_count || 0}</b> {t(lang, 'cPosts')}</span>
          <span><b>{user.followers_count || 0}</b> {t(lang, 'cFollowers')}</span>
          <span><b>{user.following_count || 0}</b> {t(lang, 'cFollowing')}</span>
        </div>
      </div>

      <div className="cu-posts">
        {posts.length === 0 ? (
          <div className="cu-empty">{t(lang, 'proEmpty')}</div>
        ) : (
          posts.map(p => (
            <PostCard key={p.id} p={p} lang={lang} me={me} onDeleted={onDeleted} onOpen={onOpenPost} />
          ))
        )}
      </div>

      <style jsx>{`
        .cu-root { display: flex; flex-direction: column; gap: 12px; }
        .cu-head { display: flex; flex-direction: column; gap: 12px; }
        .cu-cover {
          position: relative; height: 92px; border-radius: 18px;
          display: flex; align-items: flex-end; overflow: visible;
          border: 1px solid rgba(255, 255, 255, .08);
        }
        .cu-avatar, .cu-avatar-img {
          position: absolute; left: 16px; bottom: -22px;
          width: 64px; height: 64px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-rounded); font-weight: 800; font-size: 20px; color: #fff;
          background: linear-gradient(135deg, #2b2b31, #17171b);
          border: 3px solid #0a0a0d; object-fit: cover;
        }
        .cu-head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding-top: 24px; }
        .cu-id { min-width: 0; }
        .cu-name { display: flex; align-items: center; gap: 6px; font-family: var(--font-rounded); font-weight: 800; font-size: 16px; color: #fff; }
        .cu-pro {
          display: inline-flex; align-items: center; gap: 3px; color: rgba(255, 255, 255, .62);
          font-size: 10px; font-weight: 800; letter-spacing: .03em;
          background: rgba(10, 10, 13, .7); border: 1px solid rgba(255, 255, 255, .16);
          border-radius: 999px; padding: 2px 8px;
        }
        .cu-sub { color: rgba(255, 255, 255, .4); font-size: 12.5px; font-weight: 500; margin-top: 2px; }
        .cu-follow {
          flex: none; border-radius: 999px; padding: 9px 20px; font-size: 12.5px; font-weight: 800;
          font-family: var(--font-rounded); cursor: pointer; border: 1px solid transparent; transition: all .15s;
          background: #fff; color: #0c0c0f;
        }
        .cu-follow.on { background: transparent; color: rgba(255, 255, 255, .8); border-color: rgba(255, 255, 255, .2); }
        .cu-follow:hover:not(:disabled) { opacity: .9; }
        .cu-bio { color: rgba(255, 255, 255, .72); font-size: 13px; line-height: 1.55; }
        .cu-stats { display: flex; gap: 18px; color: rgba(255, 255, 255, .45); font-size: 12.5px; font-weight: 600; }
        .cu-stats b { color: #fff; }
        .cu-posts { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
        .cu-empty { text-align: center; padding: 40px 0; font-family: var(--font-rounded); font-size: 13px; color: rgba(255, 255, 255, .45); }
      `}</style>
    </div>
  )
}
