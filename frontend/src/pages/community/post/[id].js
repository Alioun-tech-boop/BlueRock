import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, UserRound } from 'lucide-react'
import BottomNav from '../../../components/BottomNav'
import PostDetailView from '../../../components/community/PostDetailView'
import { t, detectLang } from '../../../lib/i18n'
import { getCommunityMe, getCommunityPost, markPostSeen } from '../../../services/api'

export default function CommunityPostPage() {
  const router = useRouter()
  const id = router.query.id
  const [lang, setLang] = useState('fr')
  const [me, setMe] = useState(null)
  const [post, setPost] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { setLang(detectLang()) }, [])

  useEffect(() => {
    document.body.classList.add('community-body')
    return () => document.body.classList.remove('community-body')
  }, [])

  useEffect(() => {
    getCommunityMe().then(r => setMe(r.data.user || null)).catch(() => setMe(null))
  }, [])

  useEffect(() => {
    if (!id) return
    let alive = true
    setPost(null)
    setNotFound(false)
    getCommunityPost(id)
      .then(r => { if (alive) setPost(r.data.post || null) })
      .catch(() => { if (alive) setNotFound(true) })
    markPostSeen(id)
    return () => { alive = false }
  }, [id])

  const back = () => {
    if (typeof window !== 'undefined' && document.referrer && document.referrer.startsWith(window.location.origin)) router.back()
    else router.push('/community')
  }

  const onDeleted = (pid) => {
    if (pid === post?.id) router.push('/community')
  }

  return (
    <div className="co-doc">
      <header className="co-doc-bar">
        <button className="co-doc-btn" onClick={back} aria-label={t(lang, 'cBack')}>
          <ArrowLeft size={18} />{t(lang, 'cBack')}
        </button>
        <h1 className="co-doc-title">{t(lang, 'cPostFull')}</h1>
        <button className="co-doc-avatar" onClick={() => router.push(me ? '/profile' : '/login')} aria-label={me ? 'profile' : 'login'}>
          {me && me.avatar_color
            ? <span style={{ background: me.avatar_color }} />
            : <UserRound size={15} />}
        </button>
      </header>

      <div className="co-doc-col">
        {notFound ? (
          <div className="co-doc-empty">
            {t(lang, 'cPostMissing')}
            <button className="co-doc-btn" onClick={back}>{t(lang, 'cBack')}</button>
          </div>
        ) : !post ? (
          <div className="co-doc-empty">{t(lang, 'cFeed')}…</div>
        ) : (
          <PostDetailView p={post} lang={lang} me={me} onDeleted={onDeleted} />
        )}
      </div>

      <BottomNav active="community" />

      <style jsx global>{`
        body.community-body { background: #0a0a0d !important; }

        .co-doc { height: 100vh; height: 100dvh; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; }
        .co-doc-bar {
          position: sticky; top: 0; z-index: 50;
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
          padding: 10px max(14px, env(safe-area-inset-left)) 10px max(14px, env(safe-area-inset-right));
          background: rgba(10, 10, 13, .85);
          backdrop-filter: blur(24px) saturate(1.4);
          -webkit-backdrop-filter: blur(24px) saturate(1.4);
          border-bottom: 1px solid rgba(255, 255, 255, .07);
        }
        .co-doc-btn {
          display: inline-flex; align-items: center; gap: 6px; justify-self: start;
          background: none; border: none;
          color: rgba(255, 255, 255, .85); padding: 8px 10px 8px 4px;
          font-family: var(--font-rounded); font-size: 13.5px; font-weight: 700;
          cursor: pointer; border-radius: 999px; transition: all .15s;
        }
        .co-doc-btn:hover { background: rgba(255, 255, 255, .08); color: #fff; }
        .co-doc-title {
          margin: 0; text-align: center;
          font-family: var(--font-rounded); font-size: 15.5px; font-weight: 800;
          letter-spacing: -.01em; color: rgba(255, 255, 255, .95);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .co-doc-avatar {
          width: 36px; height: 36px; border-radius: 50%; justify-self: end;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .1);
          color: rgba(255, 255, 255, .7); cursor: pointer; overflow: hidden; padding: 0;
        }
        .co-doc-avatar span { display: block; width: 100%; height: 100%; }
        .co-doc-col {
          flex: 1; width: 100%; max-width: 680px; margin: 0 auto;
          padding: 18px max(16px, env(safe-area-inset-left)) calc(96px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-right));
        }
        @media (max-width: 767px) {
          .co-doc { height: 100vh; height: 100dvh; }
        }
        @media (min-width: 1024px) {
          .co-doc-bar { padding: 14px calc(50% - 340px + 14px); }
          .co-doc-col { padding-top: 26px; padding-bottom: 120px; }
        }
        .co-doc-empty {
          text-align: center; padding: 56px 0;
          font-family: var(--font-rounded); font-size: 13.5px; color: rgba(255, 255, 255, .5);
          display: flex; flex-direction: column; align-items: center; gap: 14px;
        }
      `}</style>
    </div>
  )
}