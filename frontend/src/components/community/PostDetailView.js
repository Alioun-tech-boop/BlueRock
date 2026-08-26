import { useEffect, useState } from 'react'
import {
  BadgeCheck, Bookmark, Flag, Heart, Link2, MessageCircle, MoreHorizontal, Send, Share2, Trash2,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  rocketCommunityPost, shareCommunityPost, saveCommunityPost, deleteCommunityPost,
  getCommunityComments, addCommunityComment, reactCommunityComment, deleteCommunityComment,
  appealCommunityPost,
} from '../../services/api'
import FinancialEmbed from './FinancialEmbed'
import { ReportModal, relTime, initialsOf } from './PostCard'
import TriLoader from '../TriLoader'

function SentimentBadge({ s, lang }) {
  const map = {
    bullish: { c: '#18C27C', k: 'cBullish' },
    bearish: { c: '#E11D48', k: 'cBearish' },
    neutral: { c: '#8b8b92', k: 'cSentiment' },
  }
  const m = map[s] || map.neutral
  return (
    <span className="co-pv-tag">
      <span className="co-pv-tag-dot" style={{ background: m.c }} />
      {t(lang, m.k)}
    </span>
  )
}

export default function PostDetailView({ p, lang, me, onDeleted, embedded = false }) {
  const [rockets, setRockets] = useState(p.rockets ?? 0)
  const [rocketed, setRocketed] = useState(!!p.rocketed)
  const [shares, setShares] = useState(p.shares ?? 0)
  const [shared, setShared] = useState(!!p.shared)
  const [saved, setSaved] = useState(!!p.saved)
  const [saveBusy, setSaveBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [reportFor, setReportFor] = useState(null)
  const [menu, setMenu] = useState(false)

  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [cbusy, setCbusy] = useState(false)
  const [cflash, setCflash] = useState('')

  useEffect(() => {
    let alive = true
    getCommunityComments(p.id)
      .then(r => { if (alive) setComments(r.data.comments || []) })
      .catch(() => { if (alive) setComments([]) })
    return () => { alive = false }
  }, [p.id])

  const toggleRocket = () => {
    if (!me || busy) return
    setBusy(true)
    rocketCommunityPost(p.id)
      .then(r => { setRocketed(r.data.rocketed); setRockets(r.data.rockets) })
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  const toggleShare = () => {
    if (!me || busy) return
    setBusy(true)
    shareCommunityPost(p.id)
      .then(r => { setShared(r.data.shared); setShares(r.data.shares) })
      .catch(() => setFlash(t(lang, 'cShareError')))
      .finally(() => setBusy(false))
  }

  const toggleSave = () => {
    if (!me || saveBusy) return
    setSaveBusy(true)
    const next = !saved
    setSaved(next)
    saveCommunityPost(p.id)
      .then(r => { if (typeof r?.data?.saved === 'boolean') setSaved(r.data.saved) })
      .catch(() => setSaved(!next))
      .finally(() => setSaveBusy(false))
  }

  const del = () => {
    if (!window.confirm(t(lang, 'cDeletePostConfirm'))) return
    deleteCommunityPost(p.id)
      .then(() => { if (onDeleted) onDeleted(p.id) })
      .catch(() => setFlash(t(lang, 'cDeleteError')))
  }

  const canDelete = me && ((p.author || {}).is_me || me.staff)

  const appeal = () => {
    appealCommunityPost(p.id)
      .then(() => setFlash(t(lang, 'cAppealSent')))
      .catch(err => setFlash(err?.response?.status === 409 ? t(lang, 'cAppealExists') : t(lang, 'cReportError')))
  }

  const send = () => {
    const c = text.trim()
    if (!c || cbusy) return
    setCbusy(true)
    addCommunityComment(p.id, c)
      .then(r => {
        setText('')
        setComments(prev => [...(prev || []), r.data])
      })
      .catch(() => setCflash(t(lang, 'cDeleteError')))
      .finally(() => setCbusy(false))
  }

  const react = (cid) => {
    reactCommunityComment(p.id, cid).then(r => {
      setComments(prev => (prev || []).map(c =>
        c.id === cid ? { ...c, reacted: r.data.reacted, reactions_count: r.data.reactions_count ?? c.reactions_count } : c))
    }).catch(() => {})
  }

  const delComment = (cid) => {
    if (!window.confirm(t(lang, 'cDeleteCommentConfirm'))) return
    deleteCommunityComment(p.id, cid)
      .then(() => {
        setComments(prev => (prev || []).filter(c => c.id !== cid))
        setCflash(t(lang, 'cDeleted'))
      })
      .catch(() => setCflash(t(lang, 'cDeleteError')))
  }

  const canDeleteComment = (c) => me && (c.author.is_me || (p.author && p.author.is_me) || me.staff)

  const a = p.author || {}
  const showLink = p.link_url && p.link_url.startsWith('http')
  const atts = p.attachments || []
  const mediaAtts = atts.filter(at => at.kind === 'image' || at.kind === 'video')
  const fileAtts = atts.filter(at => at.kind !== 'image' && at.kind !== 'video')

  const subBits = [`@${a.handle}`]
  if (a.role) subBits.push(a.role)
  subBits.push(relTime(p.created_at, lang))

  const scrollToComments = () => {
    const el = document.getElementById('co-pv-comments')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <article className={`co-pv${embedded ? ' co-pv-embedded' : ''}`}>
        <header className="co-pv-head">
          <span className="co-pv-avatar" style={{ background: a.avatar_color || '#3a3a44' }}>
            {initialsOf(a.display_name)}
          </span>
          <div className="co-pv-id">
            <div className="co-pv-name">
              {a.display_name}
              {a.verified && <BadgeCheck size={17} color="#18C27C" />}
            </div>
            <div className="co-pv-sub">{subBits.join(' · ')}</div>
          </div>
          <div className="co-pv-menu-wrap">
            <button className="co-pv-menu" onClick={() => setMenu(m => !m)} aria-label="actions" aria-expanded={menu}>
              <MoreHorizontal size={20} />
            </button>
            {menu && (
              <div className="co-pv-menu-pop" onClick={e => e.stopPropagation()}>
                {canDelete && (
                  <button onClick={() => { setMenu(false); del() }}>
                    <Trash2 size={14} />{t(lang, 'cDelete')}
                  </button>
                )}
                {me && !p.author.is_me && (
                  <button onClick={() => { setMenu(false); setReportFor({ type: 'post', id: p.id }) }}>
                    <Flag size={14} />{t(lang, 'cReport')}
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="co-pv-tags">
          {p.symbol && <span className="co-pv-tag">$<b>{p.symbol}</b></span>}
          {p.company_name && <span className="co-pv-tag">{p.company_name}</span>}
          <SentimentBadge s={p.sentiment} lang={lang} />
          {p.is_editor_pick && <span className="co-pv-tag co-pv-editor">{t(lang, 'cEditorBadge')}</span>}
        </div>

        <h1 className="co-pv-title">{p.title}</h1>
        {p.hidden && <div className="co-pv-badge"><Flag size={12} />{t(lang, 'cHiddenBadge')}</div>}
        {p.hidden && me && p.author.is_me && (
          <button className="co-pv-appeal" onClick={appeal}>
            <Flag size={12} />{t(lang, 'cAppeal')}
          </button>
        )}
        {p.content && <div className="co-pv-content">{p.content}</div>}

        {mediaAtts.length > 0 && (
          <div className="co-pv-media-wrap">
            {mediaAtts.map((at, i) => (
              at.kind === 'image'
                ? <img key={i} src={at.url} alt={at.name || ''} className="co-pv-media" loading="lazy" />
                : <video key={i} src={at.url} controls muted playsInline className="co-pv-media" preload="metadata" />
            ))}
          </div>
        )}

        {fileAtts.length > 0 && (
          <div className="co-pv-links">
            {fileAtts.map((at, i) => (
              <a key={i} href={at.url} target="_blank" rel="noreferrer" className="co-pv-link">
                <span className={`co-pv-link-ic ${at.kind === 'link' ? 'link' : ''}`}>{at.kind === 'link' ? <Link2 size={15} /> : '📄'}</span>
                <span className="co-pv-link-t">{at.name || at.kind}</span>
              </a>
            ))}
          </div>
        )}

        {showLink && (
          <a className="co-pv-link" href={p.link_url} target="_blank" rel="noreferrer">
            <span className="co-pv-link-ic link"><Link2 size={15} /></span>
            <span className="co-pv-link-t">{p.link_title || p.link_url}</span>
          </a>
        )}

        {p.symbol && <FinancialEmbed lang={lang} symbol={p.symbol} />}

        {flash && <div className="co-pv-flash err">{flash}</div>}

        <div className="co-pv-acts">
          <button className={`co-pv-act${rocketed ? ' on like' : ''}`} onClick={toggleRocket} disabled={!me || busy}>
            <Heart size={20} className={rocketed ? 'fill' : ''} />
            <span>{lang === 'en' ? 'Like' : "J'aime"}</span>
            {rockets > 0 && <em>{rockets}</em>}
          </button>
          <button className="co-pv-act" onClick={scrollToComments}>
            <MessageCircle size={20} />
            <span>{t(lang, 'cComments')}</span>
            {(p.comments ?? 0) > 0 && <em>{p.comments}</em>}
          </button>
          <button className={`co-pv-act${shared ? ' on share' : ''}`} onClick={toggleShare} disabled={!me || busy} title={shared ? t(lang, 'cUnshare') : t(lang, 'cShare')}>
            <Share2 size={20} />
            <span>{shared ? t(lang, 'cUnshare') : t(lang, 'cShare')}</span>
            {shares > 0 && <em>{shares}</em>}
          </button>
          <button className={`co-pv-act${saved ? ' on save' : ''}`} onClick={toggleSave} disabled={!me || saveBusy}>
            <Bookmark size={20} />
            <span>{t(lang, 'cSave')}</span>
          </button>
        </div>

        <section className="co-pv-comments" id="co-pv-comments">
          <div className="co-pv-chead">
            <span>{t(lang, 'cComments')}</span>
            <span className="co-pv-cpill">{(comments ? comments.length : p.comments ?? 0).toString()}</span>
          </div>

          {cflash && <div className="co-pv-flash ok">{cflash}</div>}

          {comments === null ? (
            <div className="co-pv-cnone"><TriLoader inline /></div>
          ) : comments.length === 0 ? (
            <div className="co-pv-cnone">{t(lang, 'cNoComments')}</div>
          ) : (
            comments.map(c => (
              <div className="co-pv-crow" key={c.id}>
                <span className="co-pv-cavatar" style={{ background: c.author.avatar_color || '#3a3a44' }}>
                  {initialsOf(c.author.display_name)}
                </span>
                <div className="co-pv-cbubble">
                  <div className="co-pv-cmeta">
                    <span className="co-pv-cname">{c.author.display_name}</span>
                    {c.author.verified && <BadgeCheck size={13} color="#18C27C" />}
                    <span className="co-pv-ctime">{relTime(c.created_at, lang)}</span>
                    {canDeleteComment(c) && (
                      <button className="co-pv-ctool" title={t(lang, 'cDelete')} onClick={() => delComment(c.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                    {me && c.author.id !== me.id && (
                      <button className="co-pv-ctool" title={t(lang, 'cReport')} onClick={() => setReportFor({ type: 'comment', id: c.id })}>
                        <Flag size={12} />
                      </button>
                    )}
                  </div>
                  {c.hidden ? (
                    <div className="co-pv-chidden">{t(lang, 'cHiddenBadge')}</div>
                  ) : (
                    <div className="co-pv-ctext">{c.content}</div>
                  )}
                  <button className={`co-pv-creact${c.reacted ? ' on' : ''}`} onClick={() => react(c.id)}>
                    <Heart size={13} className={c.reacted ? 'fill' : ''} /> {(c.reactions_count ?? 0).toString()}
                  </button>
                </div>
              </div>
            ))
          )}

          {me ? (
            <div className="co-pv-composer">
              <input
                className="co-pv-input"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send() }}
                placeholder={t(lang, 'cWriteComment')}
                maxLength={500}
              />
              <button className="co-pv-send" onClick={send} disabled={cbusy || !text.trim()}>
                <Send size={16} />
              </button>
            </div>
          ) : (
            <div className="co-pv-login">{t(lang, 'cLoginRequired')}</div>
          )}
        </section>
      </article>

      {reportFor && <ReportModal lang={lang} targetType={reportFor.type} targetId={reportFor.id} onClose={() => setReportFor(null)} />}

      <style jsx global>{`
        .co-pv { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 70px; }

        /* --- Header auteur (Facebook) --- */
        .co-pv-head { display: flex; align-items: center; gap: 13px; }
        .co-pv-avatar {
          width: 54px; height: 54px; border-radius: 50%; flex: none;
          display: flex; align-items: center; justify-content: center;
          font-size: 17px; font-weight: 800; color: #fff;
          box-shadow: 0 12px 28px -8px rgba(0, 0, 0, .8), inset 0 1px 0 rgba(255, 255, 255, .14);
        }
        .co-pv-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .co-pv-name {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-size: 17px; font-weight: 800; color: #fff;
          letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .co-pv-sub { color: rgba(255, 255, 255, .48); font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .co-pv-menu-wrap { position: relative; flex: none; }
        .co-pv-menu {
          width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; background: none; border: none; color: rgba(255, 255, 255, .55);
          cursor: pointer; transition: all .15s;
        }
        .co-pv-menu:hover { color: #fff; background: rgba(255, 255, 255, .08); }
        .co-pv-menu-pop {
          position: absolute; top: 44px; right: 0; z-index: 30; min-width: 180px;
          background: rgba(18, 18, 21, .97); backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, .1); border-radius: 16px; padding: 6px;
          display: flex; flex-direction: column; box-shadow: 0 24px 60px -18px rgba(0, 0, 0, .9);
        }
        .co-pv-menu-pop button {
          display: flex; align-items: center; gap: 9px; background: none; border: none;
          color: rgba(255, 255, 255, .8); font-family: var(--font-rounded); font-size: 13px;
          font-weight: 600; padding: 10px 12px; border-radius: 11px; cursor: pointer; text-align: left; transition: all .12s;
        }
        .co-pv-menu-pop button:hover { background: rgba(255, 255, 255, .07); color: #fff; }

        /* --- Tags --- */
        .co-pv-tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .co-pv-tag {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-size: 12px; font-weight: 700;
          color: rgba(255, 255, 255, .66); background: rgba(255, 255, 255, .06);
          border: 1px solid rgba(255, 255, 255, .09); border-radius: 999px; padding: 6px 12px;
          letter-spacing: .01em;
        }
        .co-pv-tag b { font-weight: 800; color: rgba(255, 255, 255, .9); }
        .co-pv-tag-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
        .co-pv-editor { color: #F5C518; background: rgba(245, 197, 24, .08); border-color: rgba(245, 197, 24, .3); }

        /* --- Contenu (TikTok : gros titre, texte aéré) --- */
        .co-pv-title {
          margin: 0; font-family: var(--font-rounded);
          font-size: clamp(23px, 4.4vw, 31px); font-weight: 850; color: #fff;
          letter-spacing: -.02em; line-height: 1.24; word-wrap: break-word;
        }
        .co-pv-content { font-size: 15.5px; color: rgba(255, 255, 255, .8); line-height: 1.7; white-space: pre-wrap; }
        .co-pv-badge {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 5px;
          background: rgba(255, 255, 255, .06); color: #ff8a8a; border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 999px; padding: 3px 10px; font-size: 10.5px; font-weight: 700;
        }
        .co-pv-appeal {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 5px;
          background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .75);
          border: 1px solid rgba(255, 255, 255, .1); border-radius: 999px; padding: 4px 12px;
          font-family: var(--font-rounded); font-size: 11px; font-weight: 700; cursor: pointer; transition: all .15s;
        }
        .co-pv-appeal:hover { color: #fff; background: rgba(255, 255, 255, .1); }

        /* --- Médias : pleine largeur de colonne, coins arrondis --- */
        .co-pv-media-wrap { display: flex; flex-direction: column; gap: 10px; }
        .co-pv-media {
          width: 100%; max-height: 60vh;
          object-fit: contain; display: block; background: #060608;
          border-radius: 18px; border: 1px solid rgba(255, 255, 255, .06);
          box-shadow: 0 18px 40px -18px rgba(0, 0, 0, .8);
        }

        /* --- Liens --- */
        .co-pv-links { display: flex; flex-direction: column; gap: 8px; }
        .co-pv-link {
          display: flex; align-items: center; gap: 10px;
          font-size: 13px; font-weight: 600; color: #d7dbe2; text-decoration: none;
          background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 14px; padding: 10px 13px; transition: background .15s;
        }
        .co-pv-link:hover { background: rgba(255, 255, 255, .09); }
        .co-pv-link-ic {
          width: 34px; height: 34px; border-radius: 10px; flex: none;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255, 255, 255, .07); font-size: 14px;
        }
        .co-pv-link-ic.link { color: #c9cdd4; }
        .co-pv-link-t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* --- Barre d'actions (Facebook) --- */
        .co-pv-acts {
          display: flex; align-items: center; gap: 8px; margin-top: 2px;
          background: rgba(255, 255, 255, .045); border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 20px; padding: 6px;
        }
        .co-pv-act {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
          height: 46px; border-radius: 15px; background: none; border: none;
          color: rgba(255, 255, 255, .68); font-family: var(--font-rounded); font-size: 13px;
          font-weight: 700; font-variant-numeric: tabular-nums; cursor: pointer; transition: all .16s;
        }
        .co-pv-act em { font-style: normal; font-size: 11.5px; color: rgba(255, 255, 255, .4); }
        .co-pv-act:hover:not(:disabled) { background: rgba(255, 255, 255, .07); color: #fff; }
        .co-pv-act:disabled { opacity: .5; cursor: default; }
        .co-pv-act.on.like { color: #E11D48; }
        .co-pv-act.on.like svg { fill: #E11D48; }
        .co-pv-act.on.share { color: #fff; background: rgba(255, 255, 255, .12); }
        .co-pv-act.on.save { color: #fff; }
        .co-pv-act.on.save svg { fill: #fff; }

        /* --- Commentaires (Facebook) --- */
        .co-pv-comments { display: flex; flex-direction: column; gap: 12px; scroll-margin-top: 70px; }
        .co-pv-chead {
          display: flex; align-items: center; gap: 9px;
          font-family: var(--font-rounded); font-size: 14.5px; font-weight: 800; color: rgba(255, 255, 255, .95);
        }
        .co-pv-cpill {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 24px; height: 24px; border-radius: 999px;
          background: rgba(255, 255, 255, .09); color: rgba(255, 255, 255, .6);
          font-size: 12px; font-variant-numeric: tabular-nums;
        }
        .co-pv-crow { display: flex; gap: 11px; }
        .co-pv-cavatar {
          width: 40px; height: 40px; border-radius: 50%; flex: none;
          display: flex; align-items: center; justify-content: center;
          font-size: 12.5px; font-weight: 800; color: #fff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
        }
        .co-pv-cbubble {
          flex: 1; min-width: 0; background: rgba(255, 255, 255, .05);
          border: 1px solid rgba(255, 255, 255, .06); border-radius: 18px; padding: 10px 14px;
        }
        .co-pv-cmeta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
        .co-pv-cname { font-family: var(--font-rounded); font-size: 13.5px; font-weight: 800; color: #fff; }
        .co-pv-ctime { color: rgba(255, 255, 255, .38); font-size: 11.5px; font-weight: 600; }
        .co-pv-ctool {
          margin-left: auto; background: none; border: none; color: rgba(255, 255, 255, .38);
          cursor: pointer; padding: 3px; display: inline-flex; transition: color .15s;
        }
        .co-pv-ctool:hover { color: #E11D48; }
        .co-pv-chidden { font-size: 12.5px; color: rgba(255, 255, 255, .42); margin-top: 4px; }
        .co-pv-ctext { font-size: 14px; color: rgba(255, 255, 255, .82); line-height: 1.55; margin-top: 4px; white-space: pre-wrap; }
        .co-pv-creact {
          margin-top: 7px; background: none; border: none; color: rgba(255, 255, 255, .52);
          font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700; cursor: pointer;
          padding: 0; display: inline-flex; align-items: center; gap: 5px; transition: color .15s;
        }
        .co-pv-creact.on { color: #E11D48; }
        .co-pv-creact.on svg { fill: #E11D48; }
        .co-pv-cnone { font-size: 13px; color: rgba(255, 255, 255, .42); padding: 6px 2px; }

        /* --- Composer collé au-dessus du dock (comme ça reste accessible) --- */
        .co-pv-composer {
          display: flex; gap: 9px; align-items: center; margin-top: 2px;
          position: sticky; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); z-index: 40;
          padding: 8px; border-radius: 18px;
          background: rgba(12, 12, 15, .82); backdrop-filter: blur(22px) saturate(1.4);
          -webkit-backdrop-filter: blur(22px) saturate(1.4);
          border: 1px solid rgba(255, 255, 255, .1);
          box-shadow: 0 16px 44px -18px rgba(0, 0, 0, .85);
        }
        .co-pv-input {
          flex: 1; background: rgba(255, 255, 255, .07); border: 1px solid rgba(255, 255, 255, .12);
          border-radius: 999px; color: #fff; padding: 11px 16px; font-size: 13.5px; width: 100%;
          outline: none; transition: border-color .15s, box-shadow .15s;
        }
        .co-pv-input::placeholder { color: rgba(255, 255, 255, .34); }
        .co-pv-input:focus { border-color: rgba(255, 255, 255, .34); box-shadow: 0 0 0 3px rgba(255, 255, 255, .09); }
        .co-pv-send {
          flex: none; width: 42px; height: 42px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #fff; color: #0c0c0f; border: none; cursor: pointer; transition: all .15s;
        }
        .co-pv-send:hover:not(:disabled) { background: #e8e8ec; }
        .co-pv-send:disabled { opacity: .45; }
        .co-pv-login { font-size: 12.5px; color: rgba(255, 255, 255, .45); padding: 6px 2px; }

        .co-pv-flash { font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700; border-radius: 999px; padding: 8px 13px; align-self: flex-start; }
        .co-pv-flash.ok { background: rgba(24, 194, 124, .1); color: #18C27C; }
        .co-pv-flash.err { background: rgba(225, 29, 72, .1); color: #ff8a8a; }

        /* --- Modal signalement (partagé avec la carte du fil) --- */
        .fs-modal-back { position: fixed; inset: 0; background: rgba(5, 5, 8, .68); backdrop-filter: blur(10px); display: flex;
          align-items: center; justify-content: center; z-index: 90; padding: 16px; }
        .fs-modal { width: 100%; max-width: 430px; background: rgba(18, 18, 21, .97); border: 1px solid rgba(255, 255, 255, .12);
          border-radius: 24px; padding: 16px; display: flex; flex-direction: column; gap: 11px;
          box-shadow: 0 30px 70px -20px rgba(0, 0, 0, .9); }
        .fs-modal-head { display: flex; align-items: center; justify-content: space-between;
          font-family: var(--font-rounded); font-size: 14px; font-weight: 700; color: rgba(255, 255, 255, .92); }
        .fs-modal-reasons { display: flex; flex-wrap: wrap; gap: 7px; }
        .fs-reason { background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1); color: rgba(255, 255, 255, .62);
          font-family: var(--font-rounded); border-radius: 999px; padding: 6px 13px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .fs-reason:hover { color: #fff; }
        .fs-reason.on { background: rgba(225, 29, 72, .16); border-color: rgba(225, 29, 72, .5); color: #ff8a8a; }
        .fs-input { flex: 1; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 999px; color: #fff; padding: 11px 16px; font-size: 13px; width: 100%;
          outline: none; transition: border-color .15s, box-shadow .15s; }
        .fs-input::placeholder { color: rgba(255, 255, 255, .32); }
        .fs-input:focus { border-color: rgba(255, 255, 255, .32); box-shadow: 0 0 0 3px rgba(255, 255, 255, .08); }
        .fs-ta { resize: vertical; font-family: inherit; min-height: 76px; border-radius: 14px; }
        .fs-frow { display: flex; gap: 8px; }
        .fs-frow.end { justify-content: flex-end; }
        .fs-send { display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #0c0c0f;
          border: none; border-radius: 999px; padding: 10px 18px; font-weight: 800; font-size: 13px;
          cursor: pointer; transition: all .15s; }
        .fs-send:hover:not(:disabled) { background: #e8e8ec; }
        .fs-send:disabled { opacity: .45; }
        .fs-del { background: none; border: none; color: rgba(255, 255, 255, .4); cursor: pointer; padding: 4px; display: inline-flex; transition: color .15s; }
        .fs-del:hover { color: #E11D48; }
        .fs-flash { font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700; border-radius: 999px; padding: 8px 13px; align-self: flex-start; }
        .fs-flash.ok { background: rgba(24, 194, 124, .1); color: #18C27C; }
        .fs-flash.err { background: rgba(225, 29, 72, .1); color: #ff8a8a; }

        @media (min-width: 1024px) {
          .co-pv-acts { padding: 8px; }
          .co-pv-act { height: 52px; font-size: 14px; }
        }

        /* --- Mode intégré (dans la section communauté sur PC) --- */
        @media (min-width: 1024px) {
          .co-pv-embedded .co-pv-composer {
            position: static; padding: 8px; border-radius: 18px;
            background: rgba(255, 255, 255, .045); border: 1px solid rgba(255, 255, 255, .07);
            box-shadow: none; backdrop-filter: none;
          }
        }
      `}</style>
    </>
  )
}