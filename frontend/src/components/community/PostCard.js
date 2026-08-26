import { useEffect, useState } from 'react'
import {
  MessageCircle, Trash2, Send, BadgeCheck, Link2, X, Flag, Heart, Bookmark, MoreHorizontal, Share2,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  rocketCommunityPost, shareCommunityPost, saveCommunityPost,
  deleteCommunityPost, getCommunityComments, addCommunityComment,
  reactCommunityComment, deleteCommunityComment, createCommunityReport,
  appealCommunityPost,
} from '../../services/api'
import FinancialEmbed from './FinancialEmbed'

export function relTime(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' })
  return fmt.format(d)
}

export function initialsOf(name) {
  return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function SentimentBadge({ s, lang }) {
  const map = {
    bullish: { c: '#18C27C', k: 'cBullish' },
    bearish: { c: '#E11D48', k: 'cBearish' },
    neutral: { c: '#8b8b92', k: 'cSentiment' },
  }
  const m = map[s] || map.neutral
  return (
    <span className="fs-tag">
      <span className="fs-tag-dot" style={{ background: m.c }} />
      {t(lang, m.k)}
    </span>
  )
}

export function CommentsPanel({ post, lang, me, onDeleted, defaultOpen = false }) {
  const [comments, setComments] = useState([])
  const [open, setOpen] = useState(defaultOpen)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [reportFor, setReportFor] = useState(null)

  const load = () => {
    getCommunityComments(post.id).then(r => {
      setComments(r.data.comments || [])
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }

  useEffect(() => {
    if (defaultOpen && !loaded) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpen])

  const send = () => {
    const c = text.trim()
    if (!c || busy) return
    setBusy(true)
    addCommunityComment(post.id, c)
      .then(r => {
        setText('')
        setComments(prev => [...prev, r.data])
      })
      .catch(() => setFlash(t(lang, 'cDeleteError')))
      .finally(() => setBusy(false))
  }

  const react = (cid) => {
    reactCommunityComment(post.id, cid).then(r => {
      setComments(prev => prev.map(c =>
        c.id === cid ? { ...c, reacted: r.data.reacted, reactions_count: r.data.reactions_count ?? c.reactions_count } : c))
    }).catch(() => {})
  }

  const del = (cid) => {
    if (!window.confirm(t(lang, 'cDeleteCommentConfirm'))) return
    deleteCommunityComment(post.id, cid)
      .then(() => {
        setComments(prev => prev.filter(c => c.id !== cid))
        setFlash(t(lang, 'cDeleted'))
        if (onDeleted) onDeleted(cid)
      })
      .catch(() => setFlash(t(lang, 'cDeleteError')))
  }

  const canDelete = (c) => me && (c.author.is_me || (post.author && post.author.is_me) || me.staff)

  return (
    <div className="fs-act-wrap">
      <button className={`fs-act fs-cb ${open ? 'on' : ''}`} onClick={() => {
        setOpen(!open)
        if (!loaded) load()
      }}>
        <MessageCircle size={20} />{(post.comments ?? 0) > 0 ? (post.comments ?? 0).toString() : ''}
      </button>
      {open && (
        <div className="fs-comments">
          <div className="fs-comments-head">
            <span>{t(lang, 'cComments')}</span>
            <span className="fs-cfade">{comments.length}</span>
          </div>
          {reportFor && <ReportModal lang={lang} targetType="comment" targetId={reportFor.id} onClose={() => setReportFor(null)} />}
          {flash && <div className="fs-flash ok">{flash}</div>}
          {comments.length === 0 && loaded && <div className="fs-cnone">{t(lang, 'cNoComments')}</div>}
          {comments.map(c => (
            <div className="fs-comment" key={c.id}>
              <span className="fs-cavatar" style={{ background: c.author.avatar_color || '#3a3a44' }}>
                {initialsOf(c.author.display_name)}
              </span>
              <div className="fs-ccol">
                <div className="fs-cmeta">
                  <span className="fs-cname">{c.author.display_name}</span>
                  <span className="fs-cfade">@{c.author.handle}</span>
                  <span className="fs-cfade">{relTime(c.created_at, lang)}</span>
                  {canDelete(c) && (
                    <button className="fs-del" title={t(lang, 'cDelete')} onClick={() => del(c.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                  {me && c.author.id !== me.id && (
                    <button className="fs-del" title={t(lang, 'cReport')} onClick={() => setReportFor({ type: 'comment', id: c.id })}>
                      <Flag size={12} />
                    </button>
                  )}
                </div>
                {c.hidden && <div className="fs-cfade">{t(lang, 'cHiddenBadge')}</div>}
                <div className="fs-ctext">{c.content}</div>
                <button className={`fs-creact${c.reacted ? ' on' : ''}`} onClick={() => react(c.id)}>
                  <Heart size={13} className={c.reacted ? 'fill' : ''} /> {(c.reactions_count ?? 0).toString()}
                </button>
              </div>
            </div>
          ))}
          {me ? (
            <div className="fs-composer">
              <input
                className="fs-input"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send() }}
                placeholder={t(lang, 'cWriteComment')}
                maxLength={500}
              />
              <button className="fs-send" onClick={send} disabled={busy || !text.trim()}>
                <Send size={15} />
              </button>
            </div>
          ) : (
            <div className="fs-login-hint">{t(lang, 'cLoginRequired')}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function ReportModal({ lang, targetType, targetId, onClose }) {
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  const REASONS = [
    { key: 'spam', label: t(lang, 'cReportSpam') },
    { key: 'harassment', label: t(lang, 'cReportHarassment') },
    { key: 'misinformation', label: t(lang, 'cReportMisinfo') },
    { key: 'other', label: t(lang, 'cReportOther') },
  ]
  const send = () => {
    if (busy) return
    setBusy(true)
    createCommunityReport({ target_type: targetType, target_id: targetId, reason, details: details.trim() })
      .then(() => { setDone(true); setMsg(t(lang, 'cReported')) })
      .catch(err => {
        const status = err?.response?.status
        setMsg(status === 409 ? t(lang, 'cReportExists') : t(lang, 'cReportError'))
      })
      .finally(() => setBusy(false))
  }
  return (
    <div className="fs-modal-back" onClick={onClose}>
      <div className="fs-modal" onClick={e => e.stopPropagation()}>
        <div className="fs-modal-head">
          <Flag size={14} color="#ff6b8f" />{t(lang, 'cReport')}
          <button className="fs-del" onClick={onClose}><X size={14} /></button>
        </div>
        {done ? (
          <div className="fs-flash ok">{msg}</div>
        ) : (
          <>
            {msg && <div className="fs-flash err">{msg}</div>}
            <div className="fs-modal-reasons">
              {REASONS.map(r => (
                <button key={r.key} className={`fs-reason ${reason === r.key ? 'on' : ''}`} onClick={() => setReason(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
            <textarea className="fs-input fs-ta" placeholder={t(lang, 'cReportDetails')} maxLength={600}
              value={details} onChange={e => setDetails(e.target.value)} />
            <div className="fs-frow end">
              <button className="fs-send" onClick={send} disabled={busy}>
                <Flag size={14} />{t(lang, 'cReportSend')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FileTextIcon() {
  return <span className="fs-att-fallback">📄</span>
}

export default function PostCard({ p, lang, me, onDeleted, delay = 0, onOpen, commentsOpen = false }) {
  const [rockets, setRockets] = useState(p.rockets ?? 0)
  const [rocketed, setRocketed] = useState(!!p.rocketed)
  const [shares, setShares] = useState(p.shares ?? 0)
  const [shared, setShared] = useState(!!p.shared)
  const [busyRocket, setBusyRocket] = useState(false)
  const [busyShare, setBusyShare] = useState(false)
  const [flash, setFlash] = useState('')
  const [reportFor, setReportFor] = useState(null)
  // Sync dérivés props → state (fix stale après refetch)
  useEffect(() => { setRockets(p.rockets ?? 0) }, [p.rockets])
  useEffect(() => { setRocketed(!!p.rocketed) }, [p.rocketed])
  useEffect(() => { setShares(p.shares ?? 0) }, [p.shares])
  useEffect(() => { setShared(!!p.shared) }, [p.shared])
  const toggleRocket = () => {
    if (!me || busyRocket) return
    setBusyRocket(true)
    rocketCommunityPost(p.id)
      .then(r => { setRocketed(r.data.rocketed); setRockets(r.data.rockets) })
      .catch(() => {})
      .finally(() => setBusyRocket(false))
  }

  const toggleShare = () => {
    if (!me || busyShare) return
    setBusyShare(true)
    shareCommunityPost(p.id)
      .then(r => { setShared(r.data.shared); setShares(r.data.shares) })
      .catch(() => setFlash(t(lang, 'cShareError')))
      .finally(() => setBusyShare(false))
  }

  const del = () => {
    if (!window.confirm(t(lang, 'cDeletePostConfirm'))) return
    deleteCommunityPost(p.id)
      .then(() => { if (onDeleted) onDeleted(p.id) })
      .catch(() => setFlash(t(lang, 'cDeleteError')))
  }

  const canDelete = me && ((p.author || {}).is_me || me.staff)
  const a = p.author || {}
  const showLink = p.link_url && p.link_url.startsWith('http')
  const sentMod = p.sentiment === 'bullish' ? 'fs-bull' : p.sentiment === 'bearish' ? 'fs-bear' : 'fs-neut'
  const [menu, setMenu] = useState(false)
  const [saved, setSaved] = useState(!!p.saved)
  const [saveBusy, setSaveBusy] = useState(false)
  useEffect(() => { setSaved(!!p.saved) }, [p.saved])

  const toggleSave = () => {
    if (saveBusy || !me) return
    setSaveBusy(true)
    const next = !saved
    setSaved(next)
    saveCommunityPost(p.id)
      .then(r => { if (typeof r?.data?.saved === 'boolean') setSaved(r.data.saved) })
      .catch(() => setSaved(!next))
      .finally(() => setSaveBusy(false))
  }

  const atts = p.attachments || []
  const mediaAtts = atts.filter(at => at.kind === 'image' || at.kind === 'video')
  const fileAtts = atts.filter(at => at.kind !== 'image' && at.kind !== 'video')

  const appeal = () => {
    appealCommunityPost(p.id)
      .then(() => setFlash(t(lang, 'cAppealSent')))
      .catch(err => setFlash(err?.response?.status === 409 ? t(lang, 'cAppealExists') : t(lang, 'cReportError')))
  }

  const onCardClick = (e) => {
    if (!onOpen) return
    if (e.target.closest('button, a, input, textarea, video, .fs-modal-back, .fs-comments')) return
    onOpen(p)
  }

  const onKeyDown = (e) => {
    if (!onOpen) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p) }
  }
  return (
    <>
      <div
        className={`fs-card fs-enter ${sentMod}${onOpen ? ' clickable' : ''}`}
        style={{ animationDelay: `${Math.min(delay ?? 0, 8) * 45}ms` }}
        onClick={onOpen ? onCardClick : undefined}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onKeyDown={onOpen ? onKeyDown : undefined}
        aria-label={onOpen ? p.title : undefined}
      >
        <div className="fs-body">
          <div className="fs-top">
            <span className="fs-avatar" style={{ background: a.avatar_color || '#3a3a44' }}>
              {initialsOf(a.display_name)}
            </span>
            <div className="fs-topcol">
              <div className="fs-name">
                {a.display_name}
                {a.verified && <BadgeCheck size={15} color="#18C27C" />}
              </div>
              <div className="fs-sub">
                @{a.handle}{a.role ? ` · ${a.role}` : ''}
              </div>
            </div>
            <div className="fs-head-right">
              <span className="fs-time">{relTime(p.created_at, lang)}</span>
              <div className="fs-menu-wrap">
                <button className="fs-menu" onClick={() => setMenu(m => !m)} aria-label="actions" aria-expanded={menu}>
                  <MoreHorizontal size={18} />
                </button>
                {menu && (
                  <div className="fs-menu-pop" onClick={e => e.stopPropagation()}>
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
            </div>
          </div>

          <div className="fs-tags">
            {p.symbol && <span className="fs-tag">$<b>{p.symbol}</b></span>}
            {p.company_name && <span className="fs-tag">{p.company_name}</span>}
            <SentimentBadge s={p.sentiment} lang={lang} />
            {p.is_editor_pick && <span className="fs-tag fs-editor">{t(lang, 'cEditorBadge')}</span>}
          </div>

          <div className="fs-title">{p.title}</div>
          {p.hidden && <div className="fs-hidden-badge"><Flag size={11} />{t(lang, 'cHiddenBadge')}</div>}
          {p.hidden && me && p.author.is_me && (
            <button className="fs-appeal" onClick={() => appeal()}>
              <Flag size={12} />{t(lang, 'cAppeal')}
            </button>
          )}
          {p.content && <div className="fs-content">{p.content}</div>}

          {mediaAtts.length > 0 && (
            <div className="fs-media-wrap">
              {mediaAtts.map((at, i) => (
                at.kind === 'image'
                  ? <img key={i} src={at.url} alt={at.name || ''} className="fs-media" loading="lazy" />
                  : <video key={i} src={at.url} controls muted playsInline className="fs-media" preload="metadata" />
              ))}
            </div>
          )}

          {fileAtts.length > 0 && (
            <div className="fs-att">
              {fileAtts.map((at, i) => (
                <a key={i} href={at.url} target="_blank" rel="noreferrer" className="fs-att-link">
                  {at.kind === 'link' ? <Link2 size={14} /> : <FileTextIcon />}
                  <span>{at.name || at.kind}</span>
                </a>
              ))}
            </div>
          )}

          {showLink && (
            <a className="fs-link" href={p.link_url} target="_blank" rel="noreferrer">
              <Link2 size={14} />{p.link_title || p.link_url}
            </a>
          )}

          {p.symbol && <FinancialEmbed lang={lang} symbol={p.symbol} />}

          {flash && <div className="fs-flash err">{flash}</div>}

          <div className="fs-actions">
            <button className={`fs-act fs-like ${rocketed ? 'on' : ''}`} onClick={toggleRocket} disabled={!me || busyRocket}>
              <Heart size={20} />{rockets > 0 ? rockets : ''}
            </button>
            <CommentsPanel post={p} lang={lang} me={me} onDeleted={onDeleted} defaultOpen={commentsOpen} />
            <button className={`fs-act fs-share ${shared ? 'on' : ''}`} onClick={toggleShare} disabled={!me || busyShare} title={shared ? t(lang, 'cUnshare') : t(lang, 'cShare')}>
              <Share2 size={20} />{shares > 0 ? shares : ''}
            </button>
            <button className={`fs-act fs-save ${saved ? 'on' : ''}`} onClick={toggleSave} disabled={saveBusy}>
              <Bookmark size={20} />
            </button>
          </div>
        </div>
        {reportFor && <ReportModal lang={lang} targetType="post" targetId={reportFor.id} onClose={() => setReportFor(null)} />}
      </div>

      <style jsx global>{`
        /* Couleurs d'accent réservées aux signaux uniquement */
        .fs-bull { --acc: #18C27C; }
        .fs-bear { --acc: #E11D48; }
        .fs-neut { --acc: #ffffff; }

        @keyframes fs-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: none; }
        }
        .fs-enter { animation: fs-up .5s cubic-bezier(.22,.8,.24,1) both; }

        /* --- Carte : dark glass premium, sans néon --- */
        .fs-card {
          position: relative;
          background: rgba(12, 12, 15, .66);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 28px; padding: 18px;
          display: flex; flex-direction: column; gap: 12px;
          box-shadow: 0 26px 60px -26px rgba(0, 0, 0, .85), inset 0 1px 0 rgba(255, 255, 255, .05);
          transition: transform .25s cubic-bezier(.22,.8,.24,1), border-color .25s, box-shadow .25s;
        }
        .fs-card:hover {
          transform: translateY(-2px); border-color: rgba(255, 255, 255, .14);
          box-shadow: 0 30px 70px -28px rgba(0, 0, 0, .9), inset 0 1px 0 rgba(255, 255, 255, .06);
        }
        .fs-card.clickable { cursor: pointer; }
        .fs-card.clickable:hover .fs-title { color: rgba(255, 255, 255, .95); }
        .fs-body { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px; }

        /* --- Header utilisateur --- */
        .fs-top { display: flex; align-items: center; gap: 12px; }
        .fs-avatar {
          width: 46px; height: 46px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 800; color: #fff; flex: none;
          box-shadow: 0 10px 24px -8px rgba(0, 0, 0, .8), inset 0 1px 0 rgba(255, 255, 255, .14);
        }
        .fs-topcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .fs-name {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-size: 15.5px; font-weight: 700; color: #fff;
          letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fs-sub { color: rgba(255, 255, 255, .45); font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fs-head-right { display: flex; align-items: center; gap: 10px; flex: none; }
        .fs-time { color: rgba(255, 255, 255, .4); font-size: 12px; font-weight: 600; }
        .fs-menu-wrap { position: relative; }
        .fs-menu {
          width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; background: none; border: none; color: rgba(255, 255, 255, .55);
          cursor: pointer; transition: all .15s;
        }
        .fs-menu:hover { color: #fff; background: rgba(255, 255, 255, .07); }
        .fs-menu-pop {
          position: absolute; top: 40px; right: 0; z-index: 20; min-width: 170px;
          background: rgba(18, 18, 21, .96); backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, .1); border-radius: 16px; padding: 6px;
          display: flex; flex-direction: column; box-shadow: 0 24px 60px -18px rgba(0, 0, 0, .9);
        }
        .fs-menu-pop button {
          display: flex; align-items: center; gap: 9px; background: none; border: none;
          color: rgba(255, 255, 255, .8); font-family: var(--font-rounded); font-size: 13px;
          font-weight: 600; padding: 10px 12px; border-radius: 11px; cursor: pointer;
          text-align: left; transition: all .12s;
        }
        .fs-menu-pop button:hover { background: rgba(255, 255, 255, .07); color: #fff; }

        /* --- Tags : capsules discrètes monochromes --- */
        .fs-tags { display: flex; flex-wrap: wrap; gap: 7px; }
        .fs-tag {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-size: 11.5px; font-weight: 700;
          color: rgba(255, 255, 255, .62); background: rgba(255, 255, 255, .06);
          border: 1px solid rgba(255, 255, 255, .08); border-radius: 999px; padding: 5px 11px;
          letter-spacing: .01em;
        }
        .fs-tag b { font-weight: 800; color: rgba(255, 255, 255, .85); }
        .fs-tag-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
        .fs-tag.fs-editor { color: #F5C518; background: rgba(245, 197, 24, .08); border-color: rgba(245, 197, 24, .28); }

        /* --- Contenu --- */
        .fs-title {
          font-family: var(--font-rounded); font-size: 18px; font-weight: 700; color: #fff;
          letter-spacing: -.015em; line-height: 1.32; transition: color .2s;
        }
        .fs-content { font-size: 14px; color: rgba(255, 255, 255, .72); line-height: 1.65; white-space: pre-wrap; }

        /* --- Média : appartient visuellement à la carte --- */
        .fs-media-wrap { display: flex; flex-direction: column; gap: 10px; }
        .fs-media {
          width: 100%; max-height: 380px; object-fit: cover; display: block;
          border-radius: 20px; border: 1px solid rgba(255, 255, 255, .06);
          box-shadow: 0 18px 40px -18px rgba(0, 0, 0, .8);
        }

        /* --- Fichiers & liens --- */
        .fs-att, .fs-link { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .fs-att-fallback { font-size: 13px; }
        .fs-att-link {
          display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
          color: #c9cdd4; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 12px; padding: 6px 12px; text-decoration: none; transition: background .15s;
        }
        .fs-att-link:hover { background: rgba(255, 255, 255, .09); }
        .fs-link {
          font-size: 12.5px; color: #c9cdd4; text-decoration: none; background: rgba(255, 255, 255, .05);
          border: 1px solid rgba(255, 255, 255, .08); border-radius: 12px; padding: 8px 12px;
          align-self: flex-start; font-weight: 600; transition: background .15s;
        }
        .fs-link:hover { background: rgba(255, 255, 255, .09); }

        /* --- Actions : espacées, grandes icônes --- */
        .fs-actions { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
        .fs-act-wrap { position: relative; flex: 1; }
        .fs-act {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
          height: 46px; border-radius: 999px; background: none; border: none;
          color: rgba(255, 255, 255, .72); font-family: var(--font-rounded); font-size: 13px;
          font-weight: 700; font-variant-numeric: tabular-nums; cursor: pointer; transition: all .16s;
        }
        .fs-act:hover:not(:disabled) { background: rgba(255, 255, 255, .06); color: #fff; }
        .fs-act:disabled { opacity: .5; cursor: default; }
        .fs-like.on { color: #E11D48; }
        .fs-like.on svg { fill: #E11D48; }
        .fs-share.on { color: #fff; background: rgba(255, 255, 255, .1); }
        .fs-cb.on { color: #fff; background: rgba(255, 255, 255, .08); }
        .fs-save.on { color: #fff; }
        .fs-save.on svg { fill: #fff; }

        /* --- Commentaires / informations --- */
        .fs-del { background: none; border: none; color: rgba(255, 255, 255, .4); cursor: pointer; padding: 4px; display: inline-flex; transition: color .15s; }
        .fs-del:hover { color: #E11D48; }
        .fs-comments {
          display: flex; flex-direction: column; gap: 10px; margin-top: 4px;
          background: rgba(255, 255, 255, .04); border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 18px; padding: 13px;
        }
        .fs-comments-head { font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700; color: rgba(255, 255, 255, .9); display: flex; justify-content: space-between; }
        .fs-cfade { color: rgba(255, 255, 255, .4); font-size: 11.5px; font-weight: 500; }
        .fs-cnone { font-size: 12.5px; color: rgba(255, 255, 255, .4); }
        .fs-comment { display: flex; gap: 10px; }
        .fs-cavatar {
          width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 11.5px; font-weight: 800; color: #fff; flex: none;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
        }
        .fs-ccol { flex: 1; min-width: 0; background: rgba(255, 255, 255, .045); border-radius: 16px; padding: 10px 13px; }
        .fs-cmeta { display: flex; align-items: center; gap: 7px; }
        .fs-cname { font-family: var(--font-rounded); font-size: 13px; font-weight: 700; color: #fff; }
        .fs-ctext { font-size: 13px; color: rgba(255, 255, 255, .8); line-height: 1.5; margin-top: 3px; white-space: pre-wrap; }
        .fs-creact {
          margin-top: 5px; background: none; border: none; color: rgba(255, 255, 255, .5);
          font-family: var(--font-rounded); font-size: 12px; font-weight: 600; cursor: pointer;
          padding: 0; display: inline-flex; align-items: center; gap: 4px; transition: color .15s;
        }
        .fs-creact.on { color: #E11D48; }
        .fs-creact.on svg { fill: #E11D48; }
        .fs-composer { display: flex; gap: 8px; align-items: center; }
        .fs-input {
          flex: 1; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 999px; color: #fff; padding: 11px 16px; font-size: 13px; width: 100%;
          outline: none; transition: border-color .15s, box-shadow .15s;
        }
        .fs-input::placeholder { color: rgba(255, 255, 255, .32); }
        .fs-input:focus { border-color: rgba(255, 255, 255, .32); box-shadow: 0 0 0 3px rgba(255, 255, 255, .08); }
        .fs-ta { resize: vertical; font-family: inherit; min-height: 76px; border-radius: 14px; }
        .fs-send {
          display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #0c0c0f;
          border: none; border-radius: 999px; padding: 10px 18px; font-weight: 800; font-size: 13px;
          cursor: pointer; transition: all .15s;
        }
        .fs-send:hover:not(:disabled) { background: #e8e8ec; }
        .fs-send:disabled { opacity: .45; }

        .fs-appeal {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 5px;
          background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .75);
          border: 1px solid rgba(255, 255, 255, .1); border-radius: 999px; padding: 4px 12px;
          font-family: var(--font-rounded); font-size: 11px; font-weight: 700; cursor: pointer; transition: all .15s;
        }
        .fs-appeal:hover { color: #fff; background: rgba(255, 255, 255, .1); }
        .fs-hidden-badge {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 5px;
          background: rgba(255, 255, 255, .06); color: #ff8a8a; border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 999px; padding: 3px 10px; font-size: 10.5px; font-weight: 700;
        }
        .fs-flash { font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700; border-radius: 999px; padding: 8px 13px; align-self: flex-start; }
        .fs-flash.ok { background: rgba(24, 194, 124, .1); color: #18C27C; }
        .fs-flash.err { background: rgba(225, 29, 72, .1); color: #ff8a8a; }
        .fs-frow { display: flex; gap: 8px; }
        .fs-frow.end { justify-content: flex-end; }
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
        .fs-login-hint { margin-top: 6px; font-size: 12px; }
      `}</style>
    </>
  )
}