import { useEffect, useState, useRef, useCallback } from 'react'
import { Users } from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getCommunityPosts, getCommunityMe, getCommunitySuggestions, followCommunityUser,
} from '../../services/api'
import ServerDownArt from '../ServerDownArt'
import TriLoader from '../TriLoader'
import PostCard from './PostCard'

function FollowSuggest({ lang, me }) {
  const [sugs, setSugs] = useState([])
  const [busyId, setBusyId] = useState(null)
  useEffect(() => {
    let alive = true
    getCommunitySuggestions(5)
      .then(r => { if (alive) setSugs(r.data.suggestions || []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  const toggle = (s) => {
    if (!me || busyId) return
    setBusyId(s.id)
    followCommunityUser(s.id)
      .then(r => setSugs(prev => prev.map(x => x.id === s.id ? { ...x, is_following: r.data.following } : x)))
      .catch(() => {})
      .finally(() => setBusyId(null))
  }
  if (!sugs.length) return null
  return (
    <div className="fs-sugs">
      <div className="fs-sugs-title">{t(lang, 'cSuggestions')}</div>
      {sugs.map(s => (
        <div key={s.id} className="fs-sug-card">
          <span className="fs-sug-avatar" style={{ background: s.avatar_color || '#3a3a44' }}>
            {initialsOf(s.display_name)}
          </span>
          <div className="fs-sug-id">
            <div className="fs-sug-name">{s.display_name}</div>
            <div className="fs-sug-sub">@{s.handle}{s.role ? ` · ${s.role}` : ''}</div>
          </div>
          <span className="fs-sug-count">
            <Users size={12} />{s.followers_count ?? 0}
          </span>
          <button
            className={`fs-sug-follow${s.is_following ? ' on' : ''}`}
            onClick={() => toggle(s)}
            disabled={!me || busyId === s.id}
          >
            {s.is_following ? t(lang, 'cFollowing') : t(lang, 'cFollow')}
          </button>
        </div>
      ))}
    </div>
  )
}

function initialsOf(name) {
  return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export default function FeedSection({ lang, tab = 'forYou', q = '', me, version = 0, onOpenPost }) {
  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [meState, setMeState] = useState(me)
  const mounted = useRef(true)
  const debounce = useRef(null)

  useEffect(() => {
    if (me === undefined) {
      getCommunityMe().then(r => setMeState(r.data.user || null)).catch(() => setMeState(null))
    } else {
      setMeState(me)
    }
  }, [me])

  const load = useCallback(() => {
    setLoading(true)
    setFailed(false)
    getCommunityPosts(tab, 20, { q })
      .then(r => {
        if (!mounted.current) return
        setPosts(r.data.posts || [])
        setTotal(r.data.total || 0)
      })
      .catch(() => { if (mounted.current) setFailed(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
  }, [tab, q, version])

  useEffect(() => {
    mounted.current = true
    clearTimeout(debounce.current)
    debounce.current = setTimeout(load, 120)
    return () => { mounted.current = false; clearTimeout(debounce.current) }
  }, [load])

  const onDeleted = (id) => {
    setPosts(prev => prev.filter(p => p.id !== id))
    setTotal(t => Math.max(0, t - 1))
  }

  return (
    <div className="fs-feed">
      {failed && <ServerDownArt />}

      {!failed && loading && posts.length === 0 && <div className="fs-loading"><TriLoader compact label={t(lang, 'cFeed')} /></div>}

      {!failed && !loading && posts.length === 0 && (
        <div className="fs-empty">
          {t(lang, 'cEmpty')}
          {!meState && <div className="fs-login-hint">{t(lang, 'cLoginRequired')}</div>}
        </div>
      )}

      {!failed && tab === 'following' && meState && posts.length === 0 && (
        <FollowSuggest lang={lang} me={meState} />
      )}

      {!failed && posts.map((p, i) => (
        <PostCard key={p.id} p={p} lang={lang} me={meState} onDeleted={onDeleted} delay={i} onOpen={onOpenPost} />
      ))}

      {total > posts.length && (
        <div className="fs-cfade center">{t(lang, 'cFeed')} · {total}</div>
      )}

      <style jsx global>{`
        .fs-feed { display: flex; flex-direction: column; gap: 14px; }

        .fs-empty, .fs-loading { text-align: center; font-family: var(--font-rounded); font-size: 13.5px; color: rgba(255, 255, 255, .5); padding: 24px 0; }
        .fs-login-hint { margin-top: 6px; font-size: 12px; }
        .fs-cfade.center { text-align: center; }

        .fs-sugs { display: flex; flex-direction: column; gap: 10px; margin-top: 2px; }
        .fs-sugs-title {
          font-family: var(--font-rounded); font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: .08em; color: rgba(255, 255, 255, .45); padding: 0 2px;
        }
        .fs-sug-card {
          display: flex; align-items: center; gap: 11px; padding: 12px 14px;
          background: rgba(12, 12, 15, .66); border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 20px; box-shadow: 0 20px 50px -24px rgba(0, 0, 0, .9);
          transition: border-color .15s;
        }
        .fs-sug-card:hover { border-color: rgba(255, 255, 255, .18); }
        .fs-sug-avatar {
          width: 42px; height: 42px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: #fff; flex: none;
          box-shadow: 0 10px 24px -8px rgba(0, 0, 0, .8), inset 0 1px 0 rgba(255, 255, 255, .14);
        }
        .fs-sug-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .fs-sug-name {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-size: 15px; font-weight: 700; color: #fff;
          letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fs-sug-sub { color: rgba(255, 255, 255, .45); font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fs-sug-count {
          display: inline-flex; align-items: center; gap: 4px; flex: none;
          font-family: var(--font-rounded); font-size: 11.5px; font-weight: 700;
          color: rgba(255, 255, 255, .62); font-variant-numeric: tabular-nums;
        }
        .fs-sug-follow {
          flex: none; display: inline-flex; align-items: center; gap: 5px;
          background: #fff; color: #0c0c0f; border: 1px solid transparent; border-radius: 999px;
          padding: 7px 15px; font-family: var(--font-rounded); font-size: 12px; font-weight: 800;
          cursor: pointer; transition: all .15s;
        }
        .fs-sug-follow:hover:not(:disabled) { background: #e8e8ec; }
        .fs-sug-follow.on { background: transparent; color: #fff; border-color: rgba(255, 255, 255, .28); }
        .fs-sug-follow.on:hover:not(:disabled) { background: rgba(255, 255, 255, .08); border-color: rgba(255, 255, 255, .4); }
        .fs-sug-follow:disabled { cursor: default; opacity: .55; }
      `}</style>
    </div>
  )
}