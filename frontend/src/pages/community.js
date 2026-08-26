import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell, MessageCircle, Search as SearchIcon, UserRound } from 'lucide-react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import CommunityGroupsSection from '../components/community/CommunityGroupsSection'
import ProfessionalSection from '../components/community/ProfessionalSection'
import FeedSection from '../components/community/FeedSection'
import DiscoverSection from '../components/community/DiscoverSection'
import MyPostsSection from '../components/community/MyPostsSection'
import AiPulseSection from '../components/community/AiPulseSection'
import ReputationSection from '../components/community/ReputationSection'
import EventsSection from '../components/community/EventsSection'
import CommunityRail from '../components/community/CommunityRail'
import CommunitySidebar from '../components/community/CommunitySidebar'
import CommunityCarousel from '../components/community/CommunityCarousel'
import Composer from '../components/community/Composer'
import EventsStrip from '../components/community/EventsStrip'
import PostDetailView from '../components/community/PostDetailView'
import GroupDetailView from '../components/community/GroupDetailView'
import GroupMembersView from '../components/community/GroupMembersView'
import CommunityProfileView from '../components/community/CommunityProfileView'
import { t, detectLang } from '../lib/i18n'
import { getCommunityMe, markPostSeen } from '../services/api'

export default function Community() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  const [me, setMe] = useState(null)
  const [active, setActive] = useState('feed')
  const [feedTab, setFeedTab] = useState('forYou')
  const [q, setQ] = useState('')
  const [version, setVersion] = useState(0)
  const [doc, setDoc] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => { setLang(detectLang()) }, [])

  useEffect(() => {
    document.body.classList.add('community-body')
    return () => document.body.classList.remove('community-body')
  }, [])

  useEffect(() => {
    getCommunityMe().then(r => setMe(r.data.user || null)).catch(() => setMe(null))
  }, [])

  const show = (key) => {
    setDoc(null)
    setActive(key)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const showFeed = (tab) => {
    setDoc(null)
    setFeedTab(tab)
    setActive('feed')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const onMessagePro = () => {
    show('feed')
    setTimeout(() => {
      const el = document.getElementById('co-compose')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
  }

  const openPost = (p) => {
    markPostSeen(p.id)
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      setDoc({ type: 'post', post: p })
    } else {
      router.push(`/community/post/${p.id}`)
    }
  }

  const openGroup = (g) => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      setDoc({ type: 'group', slug: g.slug })
    } else {
      router.push(`/community/group/${g.slug}`)
    }
  }

  const openMembers = (slug) => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      setDoc({ type: 'members', slug })
    } else {
      router.push(`/community/group/${slug}/members`)
    }
  }

  const openProfile = (id) => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      setDoc({ type: 'profile', id })
    } else {
      router.push(`/community/user/${id}`)
    }
  }

  const openCompose = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      setDoc({ type: 'compose' })
    } else {
      router.push('/community/compose')
    }
  }

  const closeDoc = () => {
    setDoc(null)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const TABS = [
    { key: 'forYou', label: t(lang, 'coNavFeed') },
    { key: 'following', label: t(lang, 'cFollowing') },
    { key: 'groups', label: t(lang, 'coNavGroups') },
    { key: 'pros', label: t(lang, 'coNavPros') },
    { key: 'trend', label: t(lang, 'cTrending') },
  ]
  const activeKey = active === 'feed' ? feedTab : active

  return (
    <div className="co-shell">
      <CommunitySidebar
        lang={lang}
        me={me}
        active={active}
        onActivate={show}
        onOpenProfile={openProfile}
      />

      <div className="co-main">
        <header className="co-header">
          <div className="co-head-left">
            <h1 className="co-head-title">{t(lang, 'community')}</h1>
            <span className="co-head-sub">{t(lang, 'proTitle')}</span>
          </div>
          <label className="co-head-search">
            <SearchIcon size={15} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t(lang, 'coSearchPh')}
              aria-label={t(lang, 'coSearchPh')}
              onKeyDown={e => { if (e.key === 'Enter') showFeed('forYou') }}
            />
            <kbd className="co-head-kbd">/</kbd>
          </label>
          <div className="co-head-actions">
            <button className="co-head-icon" onClick={() => router.push('/notifications')} aria-label={t(lang, 'notifications')}>
              <Bell size={17} />
              <span className="co-head-dot" />
            </button>
            <button className="co-head-icon" onClick={() => show('messages')} aria-label={t(lang, 'coNavMessage')}>
              <MessageCircle size={17} />
            </button>
            <button className="co-head-avatar" onClick={() => (me ? router.push(`/community/user/${me.id}`) : router.push('/login'))} aria-label={me ? t(lang, 'coNavProfile') : 'login'}>
              {me && me.avatar_color
                ? <span style={{ background: me.avatar_color }} />
                : <UserRound size={15} />}
            </button>
          </div>
        </header>

        <nav className="co-tabsbar" role="tablist" aria-label={t(lang, 'community')}>
          {TABS.map(tb => (
            <button
              key={tb.key}
              role="tab"
              aria-selected={activeKey === tb.key}
              type="button"
              className={`co-tab ${activeKey === tb.key ? 'on' : ''}`}
              onClick={() => (tb.key === 'forYou' || tb.key === 'following') ? showFeed(tb.key) : show(tb.key)}
              onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const idx = TABS.findIndex(x => x.key === tb.key)
                  const next = e.key === 'ArrowRight' ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length
                  const el = document.querySelectorAll('.co-tab')[next]
                  if (el) el.focus()
                }
              }}
            >
              {tb.label}
            </button>
          ))}
        </nav>

        <div className="co-scroll" ref={scrollRef}>
          <div className="co-col">
            {doc && (
              <div className="co-doc-sec">
                <div className="co-doc-sec-head">
                  <button className="co-doc-sec-back" onClick={closeDoc} aria-label={t(lang, 'cBack')}>
                    <ArrowLeft size={16} />{t(lang, 'cBack')}
                  </button>
                   <span className="co-doc-sec-title">
                     {doc.type === 'post' ? t(lang, 'cPostFull') : doc.type === 'group' ? t(lang, 'grpTitle') : doc.type === 'members' ? t(lang, 'grpMembersTitle') : doc.type === 'profile' ? t(lang, 'coNavProfile') : t(lang, 'cNewPost')}
                   </span>
                  <span className="co-doc-sec-sp" />
                </div>
                   {doc.type === 'post' ? (
                   <PostDetailView
                     p={doc.post}
                     lang={lang}
                     me={me}
                     embedded
                     onDeleted={() => { closeDoc(); setVersion(v => v + 1) }}
                   />
                 ) : doc.type === 'group' ? (
                   <GroupDetailView slug={doc.slug} lang={lang} embedded initialMe={me} onOpenPost={openPost} onOpenMembers={openMembers} />
                 ) : doc.type === 'members' ? (
                   <GroupMembersView slug={doc.slug} lang={lang} embedded onBack={closeDoc} onOpenUser={(id) => (me ? router.push(`/community/user/${id}`) : router.push('/login'))} />
                 ) : doc.type === 'profile' ? (
                   <CommunityProfileView id={doc.id} lang={lang} me={me} onOpenPost={openPost} />
                 ) : (
                  <Composer
                    lang={lang}
                    me={me}
                    fullPage
                    onPublished={() => { setVersion(v => v + 1); closeDoc(); showFeed('forYou') }}
                    onCancel={closeDoc}
                  />
                )}
              </div>
            )}

            {!doc && active === 'feed' && (
              <>
                <CommunityCarousel
                  lang={lang}
                  onSeeAll={() => show('groups')}
                  onOpen={openGroup}
                />

                {me?.is_pro && (
                  <div className="co-compose" id="co-compose">
                    <Composer lang={lang} me={me} onPublished={() => { setVersion(v => v + 1); showFeed('forYou') }} onGoFull={openCompose} />
                  </div>
                )}

                <section id="co-feed">
                  <FeedSection
                    lang={lang}
                    tab={feedTab}
                    q={q}
                    me={me}
                    version={version}
                    onOpenPost={openPost}
                  />
                </section>

                <EventsStrip lang={lang} onSeeAll={() => show('events')} />
              </>
            )}

            {!doc && active === 'trend' && (
              <section id="co-trend">
                <h2 className="co-section-title">{t(lang, 'cTrending')}</h2>
                <DiscoverSection lang={lang} />
              </section>
            )}

            {!doc && active === 'events' && (
              <section id="co-events">
                <EventsSection lang={lang} />
              </section>
            )}

            {!doc && active === 'groups' && (
              <section id="co-groups">
                <CommunityGroupsSection lang={lang} onOpenMembers={openMembers} />
              </section>
            )}

            {!doc && active === 'pros' && (
              <section id="co-pros">
                <ProfessionalSection lang={lang} />
              </section>
            )}

            {!doc && active === 'mine' && (
              <section id="co-mine">
                <MyPostsSection
                  lang={lang}
                  onNewPost={() => {
                    show('feed')
                    setTimeout(() => {
                      const el = document.getElementById('co-compose')
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }, 120)
                  }}
                />
              </section>
            )}

            {!doc && active === 'ai' && (
              <section id="co-ai">
                <AiPulseSection lang={lang} />
              </section>
            )}

            {!doc && active === 'rep' && (
              <section id="co-rep">
                <h2 className="co-section-title">{t(lang, 'cRepTitle')}</h2>
                <ReputationSection lang={lang} />
              </section>
            )}

            {!doc && active === 'messages' && (
              <section id="co-messages">
                <h2 className="co-section-title">{t(lang, 'coMessagesTitle')}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 20px', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                  <MessageCircle size={28} />
                  <p style={{ margin: 0, fontSize: 14 }}>{t(lang, 'coMessagesEmpty')}</p>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <CommunityRail lang={lang} onMessage={onMessagePro} />

      <BottomNav active="community" />

      <style jsx>{`
        .co-compose { scroll-margin-top: 4px; }
        .co-section-title { margin: 4px 0 0; }

        .co-doc-sec { display: flex; flex-direction: column; gap: 16px; }
        .co-doc-sec-head {
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
          padding: 2px 0 4px;
        }
        .co-doc-sec-back {
          justify-self: start; display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1);
          color: rgba(255, 255, 255, .85); border-radius: 999px; padding: 8px 14px;
          font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700;
          cursor: pointer; transition: all .15s;
        }
        .co-doc-sec-back:hover { background: rgba(255, 255, 255, .12); color: #fff; }
        .co-doc-sec-title {
          font-family: var(--font-rounded); font-size: 14px; font-weight: 800;
          letter-spacing: -.01em; color: rgba(255, 255, 255, .9);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .co-doc-sec-sp { width: 40px; }
      `}</style>
    </div>
  )
}