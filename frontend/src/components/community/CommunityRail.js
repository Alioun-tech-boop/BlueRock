import { useEffect, useRef, useState, useCallback } from 'react'
import {
  UserPlus, UserCheck, Flame, Activity, BadgeCheck, ArrowLeft, Search, MessageCircle,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getCommunityUsers, getCommunityUser,
  getCommunityDiscover, getCommunitySuggestions, getCommunityPosts, followCommunityUser,
} from '../../services/api'
import { PhotoAvatar } from '../../lib/photo'
import Sparkline from './Sparkline'
import TriLoader from '../TriLoader'

function initialsOf(name) {
  return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function TrendingRow({ sym, lang }) {
  const up = (sym.change_percent ?? 0) > 0
  const down = (sym.change_percent ?? 0) < 0
  return (
    <div className="co-rail-row">
      <Flame size={14} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
      <div className="co-rail-body">
        <div className="co-rail-name">{sym.symbol}</div>
        <div className="co-rail-meta">
          {sym.name} · {sym.posts} {t(lang, 'coRailWeek')}
        </div>
      </div>
      <span className={`co-rail-delta ${up ? 'up' : down ? 'down' : ''}`}>
        {up ? '+' : ''}{sym.change_percent != null ? sym.change_percent.toFixed(1) : '—'}%
      </span>
    </div>
  )
}

function FollowBtn({ user, lang }) {
  const [on, setOn] = useState(!!user.is_following)
  const [busy, setBusy] = useState(false)
  const click = (e) => {
    if (e) e.stopPropagation()
    if (busy) return
    setBusy(true)
    followCommunityUser(user.id)
      .then(r => setOn(r.data.following))
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  return (
    <button className={`co-rail-follow ${on ? 'on' : ''}`} onClick={click} disabled={busy} aria-label={on ? t(lang, 'coFollowing') : t(lang, 'coFollow')}>
      {on ? <UserCheck size={12} /> : <UserPlus size={12} />}
      <span className="co-rail-follow-txt">{on ? t(lang, 'coFollowing') : t(lang, 'coFollow')}</span>
    </button>
  )
}

function statSeries(seed, n) {
  const out = []
  let v = 10
  for (let i = 0; i < n; i++) {
    v = v + Math.sin(seed + i * 1.7) * 2 + (i % 3 === 0 ? 0.4 : -0.2)
    out.push(Number(v.toFixed(2)))
  }
  return out
}

function fmtInt(v, lang) {
  return (v ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')
}

function fmtCompact(v, lang) {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

function fmtPct(v) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`
}

function StatsCard({ lang }) {
  const [range, setRange] = useState(30)
  const ranges = [7, 30, 90]
  const rl = n => (lang === 'en' ? `${n}d` : `${n} j`)
  const hero = { v: 12400 + range * 170, d: 4.8 + range * 0.03 }
  const stats = [
    { k: t(lang, 'coStatsEng'), v: 4820 + range * 58, d: 2.1 + range * 0.012 },
    { k: t(lang, 'coStatsMembers'), v: 346 + range * 2.4, d: 1.4 + range * 0.022 },
    { k: t(lang, 'coStatsPosts'), v: 26000 + range * 360, d: 6.2 + range * 0.035 },
  ]
  const hUp = hero.d >= 0
  return (
    <div className="cr-stats-card">
      <div className="cr-stats-head">
        <h4><Activity size={14} />{t(lang, 'coStatsTitle')}</h4>
        <div className="cr-seg" role="group" aria-label={t(lang, 'crVsPrev')}>
          {ranges.map(n => (
            <button key={n} className={`cr-seg-btn ${range === n ? 'on' : ''}`} onClick={() => setRange(n)}>
              {rl(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="cr-hero">
        <div className="cr-hero-col">
          <span className="cr-hero-label">{t(lang, 'coStatsReach')}</span>
          <span className="cr-hero-val">{fmtCompact(hero.v, lang)}</span>
          <span className={`cr-delta ${hUp ? 'up' : 'down'}`}>
            {hUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {fmtPct(hero.d)} <small>{t(lang, 'crVsPrev')}</small>
          </span>
        </div>
        <div className="cr-hero-spark">
          <Sparkline data={statSeries(7 + range, 18)} w={96} h={30} stroke="#fff" />
        </div>
      </div>

      <div className="cr-stats-grid">
        {stats.map(s => (
          <div className="cr-stat" key={s.k}>
            <span className="v">{fmtCompact(s.v, lang)}</span>
            <span className="k">{s.k}</span>
            <span className={`cr-delta mini ${s.d >= 0 ? 'up' : 'down'}`}>{fmtPct(s.d)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiscoverPanel({ lang, onOpen }) {
  const [pros, setPros] = useState(null)
  const [q, setQ] = useState('')
  const debounce = useRef(null)

  const load = useCallback((term) => {
    if (term) {
      getCommunityUsers(term, 6).then(r => setPros(r.data.users || [])).catch(() => setPros([]))
    } else {
      getCommunitySuggestions(6).then(r => setPros(r.data.suggestions || [])).catch(() => setPros([]))
    }
  }, [])

  useEffect(() => { load('') }, [load])

  const onSearch = (e) => {
    const v = e.target.value
    setQ(v)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => load(v.trim()), 250)
  }

  return (
    <div className="co-rail-widget cr-discover">
      <h4><BadgeCheck size={14} />{t(lang, 'coDiscoverPros')}</h4>
      <div className="co-rail-meta cr-discover-sub">{t(lang, 'coDiscoverProsSub')}</div>
      <div className="cr-search">
        <Search size={13} />
        <input value={q} onChange={onSearch} placeholder={t(lang, 'coSearchPro')} aria-label={t(lang, 'coSearchPro')} />
      </div>
      {pros === null ? (
        <div className="co-rail-empty"><TriLoader inline /></div>
      ) : pros.length === 0 ? (
        <div className="co-rail-empty">{t(lang, 'coRailProEmpty')}</div>
      ) : (
        pros.map(p => (
          <div className="co-rail-row" key={p.id} onClick={() => onOpen(p)}>
            <PhotoAvatar name={p.display_name} avatar={p.avatar} color={p.avatar_color} className="co-rail-avatar" size={40} />
            <div className="co-rail-body">
              <div className="co-rail-name">
                {p.display_name}
                {p.verified && <BadgeCheck size={12} color="#18C27C" />}
              </div>
              <div className="co-rail-meta">@{p.handle} · {fmtInt(p.followers_count, lang)} {t(lang, 'coRailFollowers')}</div>
            </div>
            <FollowBtn user={p} lang={lang} />
          </div>
        ))
      )}
    </div>
  )
}

function ProfileView({ lang, user, onBack, onMessage }) {
  const [profile, setProfile] = useState(user)
  const [loaded, setLoaded] = useState(false)
  const p = profile

  useEffect(() => {
    setProfile(user)
    setLoaded(false)
    getCommunityUser(user.id)
      .then(r => { setProfile(prev => ({ ...prev, ...(r.data.user || {}) })); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [user.id])

  const name = p.display_name || p.name || '—'
  const handle = p.handle || ''
  const isPro = !!(p.role || p.pro_role || p.verified)
  const statsItems = [
    { v: p.posts_count, k: t(lang, 'crProPosts') },
    { v: p.following_count, k: t(lang, 'crProFollowing') },
    { v: p.reactions_count, k: t(lang, 'crProReactions') },
    { v: p.followers_count ?? 0, k: t(lang, 'coRailFollowers') },
  ]

  return (
    <div className="co-rail-widget cr-profile">
      <button className="cr-back" onClick={onBack}>← {t(lang, 'crBack')}</button>
      <div className="cr-cover" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 70%)' }} />
      <div className="cr-prof">
        <PhotoAvatar name={name} avatar={p.avatar} color={p.avatar_color} className="cr-prof-ava" size={64} />
        <div className="cr-prof-name">
          {name}
          {isPro && <BadgeCheck size={15} color="#18C27C" />}
        </div>
        <div className="cr-prof-handle">@{handle}</div>
        {isPro && <span className="cr-prof-role">{t(lang, 'crProRole')}</span>}
        <div className="cr-prof-actions">
          <FollowBtn user={p} lang={lang} />
          <button className="cr-prof-action secondary" onClick={onMessage}>
            <MessageCircle size={14} />{t(lang, 'crMessage')}
          </button>
        </div>
        <div className="cr-pro-stats">
          {statsItems.map(s => (
            <div className="cr-stat" key={s.k}>
              <span className="v">{loaded || s.v != null ? fmtInt(s.v, lang) : '…'}</span>
              <span className="k">{s.k}</span>
            </div>
          ))}
        </div>
        {p.bio && (
          <div className="cr-bio">
            <span>{t(lang, 'crBio')}</span>
            {p.bio}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommunityRail({ lang, onMessage }) {
  const [selected, setSelected] = useState(null)
  const [trends, setTrends] = useState(null)
  const [act, setAct] = useState(null)

  useEffect(() => {
    getCommunityDiscover()
      .then(r => setTrends((r.data.trending_symbols || []).slice(0, 4)))
      .catch(() => setTrends([]))
    getCommunityPosts('forYou', 10)
      .then(r => {
        const posts = r.data.posts || []
        const seen = new Set()
        const authors = posts.map(p => p.author).filter(a => {
          if (!a || seen.has(a.id)) return false
          seen.add(a.id)
          return true
        }).slice(0, 4)
        setAct({ authors, count: posts.length })
      })
      .catch(() => setAct({ authors: [], count: 0 }))
  }, [])

  const message = () => {
    if (onMessage) onMessage()
    else {
      const el = document.getElementById('co-compose')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return (
    <aside className="co-rail" aria-label={t(lang, 'coNavSection')}>
      {selected
        ? <ProfileView lang={lang} user={selected} onBack={() => setSelected(null)} onMessage={message} />
        : <DiscoverPanel lang={lang} onOpen={setSelected} />}

      <StatsCard lang={lang} />

      <div className="co-rail-widget">
        <h4><Flame size={14} />{t(lang, 'coRailTrends')}</h4>
        {!trends ? (
          <div className="co-rail-empty"><TriLoader inline /></div>
        ) : trends.length === 0 ? (
          <div className="co-rail-empty">{t(lang, 'coRailTrendEmpty')}</div>
        ) : trends.map(sym => <TrendingRow key={sym.symbol} sym={sym} lang={lang} />)}
      </div>

      <div className="co-rail-widget">
        <h4><Activity size={14} />{t(lang, 'coRailActivity')}</h4>
        {!act ? (
          <div className="co-rail-empty"><TriLoader inline /></div>
        ) : act.authors.length === 0 ? (
          <div className="co-rail-empty">{t(lang, 'coRailActEmpty')}</div>
        ) : (
          <>
            <div className="co-rail-stack">
              {act.authors.map(a => (
                <span className="mini" key={a.id} style={{ background: a.avatar_color || '#232329' }}>
                  {initialsOf(a.display_name)}
                </span>
              ))}
            </div>
            <div className="co-rail-meta">
              <span className="co-rail-em">{act.authors.length}</span> {t(lang, 'coRailAct')} · {act.count} {t(lang, 'coPosts')}
            </div>
            <div className="co-rail-meta">
              {act.authors.map(a => a.display_name).join(' · ')}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}