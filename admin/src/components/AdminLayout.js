import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  LayoutDashboard, Users, MessagesSquare, Users2, ShieldCheck, Newspaper, Megaphone,
  Flag, ScrollText, LogOut, Activity, UserRound, Trophy,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { supabase, getToken, clearToken } from '../lib/supabase'

const GROUPS = [
  {
    label: 'Vue d’ensemble',
    links: [
      { href: '/', key: 'dash', icon: LayoutDashboard, label: t('dashTitle'), exact: true },
    ],
  },
  {
    label: 'Communauté',
    links: [
      { href: '/users', key: 'users', icon: Users, label: t('usersTitle') },
      { href: '/community-users', key: 'cusers', icon: UserRound, label: 'Membres' },
      { href: '/posts', key: 'posts', icon: MessagesSquare, label: t('postsTitle') },
      { href: '/groups', key: 'groups', icon: Users2, label: t('groupsTitle') },
      { href: '/challenges', key: 'challenges', icon: Trophy, label: 'Défis' },
      { href: '/moderation', key: 'mod', icon: Flag, label: 'Modération' },
    ],
  },
  {
    label: 'Contenu',
    links: [
      { href: '/content?tab=news', key: 'news', icon: Newspaper, label: t('newsTitle') },
      { href: '/content?tab=ann', key: 'ann', icon: Megaphone, label: t('annTitle') },
    ],
  },
  {
    label: 'Conformité',
    links: [
      { href: '/kyc', key: 'kyc', icon: ShieldCheck, label: t('kycTitle') },
      { href: '/audit', key: 'audit', icon: ScrollText, label: 'Journal d’audit' },
    ],
  },
]

export default function AdminLayout({ children, title, sub }) {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      if (!data.session || !getToken()) {
        router.replace('/login')
        return
      }
      setMe({
        email: data.session.user.email,
        name: data.session.user.user_metadata?.name || data.session.user.email,
      })
      setChecked(true)
    })
    return () => { alive = false }
  }, [])

  const logout = () => {
    clearToken()
    supabase.auth.signOut().finally(() => router.replace('/login'))
  }

  if (!checked) return <div className="adm-loading"><span className="spinner" />…</div>

  const isActive = (l) => (
    l.exact
      ? router.pathname === l.href || (l.href === '/' && router.pathname === '/')
      : router.pathname.startsWith(l.href.split('?')[0]) && (l.href.includes('?') ? router.asPath.startsWith(l.href) : true)
  )

  const initials = (me?.name || me?.email || '?').split(/[\s@.]/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="chip"><Activity size={17} /></span>
          <span>
            <div className="nm">BLUEROCK</div>
            <div className="sub">{t('tagline')}</div>
          </span>
        </div>

        {GROUPS.map((g, gi) => (
          <div key={gi}>
            <div className="adm-navgroup">{g.label}</div>
            {g.links.map(l => {
              const Icon = l.icon
              return (
                <Link key={l.key} href={l.href} className={`adm-link ${isActive(l) ? 'active' : ''}`}>
                  <Icon size={18} /><span>{l.label}</span>
                </Link>
              )
            })}
          </div>
        ))}

        <div className="adm-side-foot">
          {me && (
            <div className="adm-side-user">
              <span className="av">{initials}</span>
              <span style={{ minWidth: 0 }}>
                <div className="nm">{me.name}</div>
                <div className="rl">Admin</div>
              </span>
            </div>
          )}
          <button className="adm-logout" onClick={logout}>
            <LogOut size={15} />{t('logout')}
          </button>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-top">
          <div>
            <h1>{title}</h1>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <div className="who">
            {me && <><span>{me.email}</span><span className="badge">ADMIN</span></>}
          </div>
        </header>
        <div className="adm-body">{children}</div>
      </main>
    </div>
  )
}
