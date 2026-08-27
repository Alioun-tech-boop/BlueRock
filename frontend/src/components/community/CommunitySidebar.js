import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Sparkles, ArrowUpRight, ChevronRight, MessageSquare, BrainCircuit, Gauge, UserRound,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import { getCommunityGroups } from '../../services/api'
import TriLoader from '../TriLoader'
import { PhotoAvatar } from '../../lib/photo'

const MINE_ICONS = {
  profile: UserRound,
  message: MessageSquare,
  mine: MessageSquare,
  ai: BrainCircuit,
  rep: Gauge,
}

function MyGroups({ lang, onActivate }) {
  const router = useRouter()
  const [mine, setMine] = useState(null)

  useEffect(() => {
    getCommunityGroups({ limit: 40 })
      .then(r => {
        const list = (r.data.groups || []).filter(g => g.my_role).slice(0, 5)
        setMine(list)
      })
      .catch(() => setMine([]))
  }, [])

  const openGroup = (g) => {
    if (g && g.slug) router.push(`/community/group/${g.slug}`)
    else onActivate('groups')
  }

  return (
    <div className="co-side-my">
      {mine === null ? <div className="co-rail-empty"><TriLoader inline /></div> : mine.map(g => (
        <button key={g.id} className="co-my-item" onClick={() => openGroup(g)}>
          <PhotoAvatar name={g.name} avatar={g.avatar} color={g.avatar_color} className="co-my-ava" size={26} />
          <span className="co-my-name">{g.name}</span>
          <ChevronRight size={13} className="co-my-chv" />
        </button>
      ))}
      <button className="co-side-see" onClick={() => onActivate('groups')}>
        {t(lang, 'coSeeAll')}
        <ArrowUpRight size={12} />
      </button>
    </div>
  )
}

export default function CommunitySidebar({ lang, me, active, onActivate, onOpenProfile }) {
  const router = useRouter()
  const user = me || null

  const isOn = key => active === key

  const mine = [
    { key: 'profile', label: t(lang, 'coNavProfile') },
    { key: 'message', label: t(lang, 'coNavMessage') },
    { key: 'mine', label: t(lang, 'coNavMine') },
    { key: 'ai', label: t(lang, 'coNavAi') },
    { key: 'rep', label: t(lang, 'coNavRep') },
  ]

  return (
    <nav className="co-shell-side" aria-label={t(lang, 'community')}>
      <div className="co-side-brand">
        <span className="co-logo" aria-hidden="true"><Sparkles size={15} strokeWidth={2.2} /></span>
        <span className="col">
          <span className="t">BLUEROCK</span>
          <span className="sub">{t(lang, 'community')}</span>
        </span>
      </div>

      <div className="co-side-group">{t(lang, 'coNavSection')}</div>
      {mine.map(item => {
        const Icon = MINE_ICONS[item.key]
        const on = isOn(item.key)
        return (
          <button
            key={item.key}
            className={`co-side-item ${on ? 'active' : ''}`}
            onClick={() => {
              if (item.key === 'profile') {
                if (onOpenProfile && user?.id) { onOpenProfile(user.id); return }
                if (user?.id) router.push(`/community/user/${user.id}`)
                else router.push('/login')
                return
              }
              if (item.key === 'message') { onActivate('messages'); return }
              onActivate(item.key)
            }}
            aria-current={on ? 'page' : undefined}
          >
            <Icon size={16} strokeWidth={1.9} className="co-side-ic" />
            <span>{item.label}</span>
          </button>
        )
      })}

      <div className="co-side-group">{t(lang, 'coMyGroups')}</div>
      <MyGroups lang={lang} onActivate={onActivate} />

      <div className="co-side-foot">
        {user ? (
          <button className="co-side-profil" onClick={() => router.push('/profile')}>
            <PhotoAvatar name={user.display_name} avatar={user.avatar} color={user.avatar_color} className="avatar" size={34} />
            <span className="col">
              <span className="nm">{user.display_name}</span>
              <span className="hd">@{user.handle}</span>
            </span>
            <ChevronRight size={14} className="co-pro-chv" />
          </button>
        ) : (
          <button className="co-side-profil" onClick={() => router.push('/login')}>
            <span className="avatar" style={{ background: '#232329' }}>?</span>
            <span className="col">
              <span className="nm">{t(lang, 'cLoginCta')}</span>
              <span className="hd">{t(lang, 'cLoginRequired')}</span>
            </span>
            <ChevronRight size={14} className="co-pro-chv" />
          </button>
        )}
      </div>
    </nav>
  )
}