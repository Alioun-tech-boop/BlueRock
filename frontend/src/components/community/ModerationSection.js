import { useEffect, useState } from 'react'
import { ShieldAlert, Eye, Trash2, X, Clock, UserX, MessageSquare, FileText, Ban } from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getCommunityMe, getCommunityModerationQueue, resolveCommunityReport,
  banCommunityUser, unbanCommunityUser, getCommunityModerationHistory,
} from '../../services/api'
import TriLoader from '../TriLoader'

function relTime(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' })
  return fmt.format(d)
}

const TARGET_LABEL = { post: 'cModTargetPost', comment: 'cModTargetComment', user: 'cModTargetUser' }

export default function ModerationSection({ lang }) {
  const [staff, setStaff] = useState(false)
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [notes, setNotes] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [flash, setFlash] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = () => {
    getCommunityModerationQueue().then(r => { setQueue(r.data.reports || []); setLoading(false) }).catch(() => setLoading(false))
    getCommunityModerationHistory().then(r => setHistory(r.data.history || [])).catch(() => {})
  }

  useEffect(() => {
    let on = true
    getCommunityMe()
      .then(r => { if (on) setStaff(!!(r.data.user || {}).staff) })
      .catch(() => {})
      .finally(() => { if (on) reload() })
    const iv = setInterval(() => { if (on) reload() }, 20000)
    return () => { on = false; clearInterval(iv) }
  }, [])

  if (!staff) return null

  const act = (reportId, action) => {
    setBusyId(reportId)
    resolveCommunityReport(reportId, { action, note: (notes[reportId] || '') })
      .then(() => { setFlash(t(lang, 'cModDone')); setNotes(prev => ({ ...prev, [reportId]: '' })); reload() })
      .catch(() => setFlash(t(lang, 'cReportError')))
      .finally(() => setBusyId(null))
  }

  const ban = (userId) => {
    setBusyId(`b${userId}`)
    banCommunityUser(userId).then(reload).finally(() => setBusyId(null))
  }
  const unban = (userId) => {
    setBusyId(`b${userId}`)
    unbanCommunityUser(userId).then(reload).finally(() => setBusyId(null))
  }

  return (
    <section className="mod-root">
      <div className="mod-head">
        <span className="mod-title"><ShieldAlert size={15} />{t(lang, 'cModeration')}</span>
        <span className="mod-sub">{t(lang, 'cModQueue')} · {queue.length}</span>
      </div>
      {flash && <div className="mod-flash">{flash}</div>}
      {loading ? (
        <div className="mod-empty"><TriLoader compact label={t(lang, 'cModeration')} /></div>
      ) : queue.length === 0 ? (
        <div className="mod-empty">{t(lang, 'cModEmpty')}</div>
      ) : (
        queue.map(r => {
          const tg = r.target || {}
          const isUser = r.target_type === 'user'
          const banned = isUser && tg.banned
          return (
            <div className="mod-item" key={r.id}>
              <div className="mod-item-top">
                <span className={`mod-type mod-${r.target_type}`}>
                  {r.target_type === 'post' ? <FileText size={12} /> : r.target_type === 'comment' ? <MessageSquare size={12} /> : <UserX size={12} />}
                  {t(lang, TARGET_LABEL[r.target_type] || 'cModTargetPost')} #{r.target_id}
                </span>
                <span className="mod-reason">{r.reason}</span>
                <span className="mod-time"><Clock size={11} />{relTime(r.created_at, lang)}</span>
              </div>
              <div className="mod-target">
                {tg.exists === false ? <span className="mod-gone">target gone</span> : (
                  <>
                    {r.target_type === 'post' && (
                      <><span className="mod-ticker">{tg.symbol}</span><b>{tg.title}</b>
                        <span className="mod-snippet">{(tg.content || '').slice(0, 200)}</span>
                        <span className="mod-owner">@{tg.author?.handle}</span>
                        {tg.hidden && <span className="mod-badge"><Eye size={11} />{t(lang, 'cHiddenBadge')}</span>}
                      </>
                    )}
                    {r.target_type === 'comment' && (
                      <><span className="mod-snippet">“{(tg.content || '').slice(0, 200)}”</span>
                        <span className="mod-owner">@{tg.author?.handle} · post #{tg.post_id}</span>
                        {tg.hidden && <span className="mod-badge"><Eye size={11} />{t(lang, 'cHiddenBadge')}</span>}
                      </>
                    )}
                    {isUser && (
                      <><b>{tg.display_name}</b><span className="mod-owner">@{tg.handle}</span>
                        <span className="mod-owner">{tg.posts_count} posts</span>
                        {tg.banned && <span className="mod-badge"><Ban size={11} />banned</span>}
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="mod-actions">
                {!isUser ? (
                  <>
                    <button className="mod-btn mod-hide" disabled={busyId === r.id} onClick={() => act(r.id, 'hide')}>
                      <Eye size={13} />{t(lang, 'cModHide')}
                    </button>
                    <button className="mod-btn mod-del" disabled={busyId === r.id} onClick={() => act(r.id, 'delete')}>
                      <Trash2 size={13} />{t(lang, 'cModDelete')}
                    </button>
                    <button className="mod-btn" disabled={busyId === r.id} onClick={() => act(r.id, 'dismiss')}>
                      <X size={13} />{t(lang, 'cModDismiss')}
                    </button>
                  </>
                ) : (
                  <>
                    {banned
                      ? <button className="mod-btn mod-ok" disabled={busyId === r.id} onClick={() => unban(r.target_id)}>
                        <Ban size={13} />{t(lang, 'cModUnban')}
                      </button>
                      : <button className="mod-btn mod-ban" disabled={busyId === r.id} onClick={() => act(r.id, 'ban')}>
                        <Ban size={13} />{t(lang, 'cModBan')}
                      </button>}
                    <button className="mod-btn" disabled={busyId === r.id} onClick={() => act(r.id, 'dismiss')}>
                      <X size={13} />{t(lang, 'cModDismiss')}
                    </button>
                  </>
                )}
                <input className="mod-note" placeholder={t(lang, 'cModNote')} maxLength={500}
                  value={notes[r.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))} />
              </div>
            </div>
          )
        })
      )}
      {history.length > 0 && (
        <div className="mod-history">
          <div className="mod-history-head">{t(lang, 'cModHistory')}</div>
          {history.slice(0, 15).map(h => (
            <div className="mod-history-row" key={h.id}>
              <span className={`mod-type mod-${h.target_type}`}>{h.target_type} #{h.target_id}</span>
              <span className="mod-reason">{h.action}</span>
              <span className="mod-owner">{h.resolved_by || '—'}</span>
              <span className="mod-time"><Clock size={11} />{relTime(h.resolved_at, lang)}</span>
            </div>
          ))}
        </div>
      )}
      <style jsx>{`
        .mod-root {
          background: var(--c-surface-1); border: 1px solid var(--c-border); border-radius: 16px;
          padding: 14px; display: flex; flex-direction: column; gap: 10px; margin-top: 10px;
        }
        .mod-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
        .mod-title {
          display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px;
          font-weight: 800; color: #ff6b8f;
        }
        .mod-sub { font-size: 11.5px; color: rgba(255,255,255,0.45); font-weight: 700; }
        .mod-flash { font-size: 12px; color: #18C27C; background: #18C27C14; border: 1px solid #18C27C44; border-radius: 9px; padding: 6px 10px; }
        .mod-empty { font-size: 12.5px; color: rgba(255,255,255,0.4); text-align: center; padding: 8px; }
        .mod-item {
          background: #ffffff08; border: 1px solid #ffffff12; border-radius: 12px;
          padding: 10px; display: flex; flex-direction: column; gap: 7px;
        }
        .mod-item-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .mod-type {
          display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800;
          border: 1px solid #ffffff16; border-radius: 999px; padding: 2px 8px; color: rgba(255,255,255,0.7);
        }
        .mod-post { color: #ffffff; }
        .mod-comment { color: #F59E0B; }
        .mod-user { color: #ff6b8f; }
        .mod-reason {
          font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;
          background: rgba(255,255,255,0.10); color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: 999px; padding: 2px 9px;
        }
        .mod-time { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(255,255,255,0.35); }
        .mod-target { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; }
        .mod-ticker {
          align-self: flex-start; font-family: 'Inter', -apple-system, sans-serif; font-size: 10.5px; font-weight: 800;
          background: rgba(255,255,255,0.10); color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: 6px; padding: 1px 6px;
        }
        .mod-snippet { color: rgba(255,255,255,0.6); font-size: 12px; }
        .mod-owner { color: rgba(255,255,255,0.4); font-size: 11.5px; }
        .mod-gone { font-size: 11px; color: rgba(255,255,255,0.3); font-style: italic; }
        .mod-badge {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 4px;
          font-size: 10.5px; font-weight: 800; color: #F59E0B; background: #F59E0B14;
          border: 1px solid #F59E0B44; border-radius: 999px; padding: 1px 8px;
        }
        .mod-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .mod-btn {
          display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 800;
          background: #ffffff0a; color: rgba(255,255,255,0.75); border: 1px solid #ffffff16;
          border-radius: 9px; padding: 5px 10px; cursor: pointer;
        }
        .mod-btn:disabled { opacity: 0.4; cursor: default; }
        .mod-hide { color: #ffffff; border-color: rgba(255,255,255,0.35); }
        .mod-del { color: #ff6b8f; border-color: #E11D4855; }
        .mod-ban { color: #ff6b8f; border-color: #E11D4855; }
        .mod-ok { color: #18C27C; border-color: #18C27C55; }
        .mod-note {
          flex: 1; min-width: 140px; background: #0d0d11; border: 1px solid #ffffff14;
          border-radius: 8px; color: #fff; font-size: 11.5px; padding: 5px 9px;
        }
        .mod-note::placeholder { color: rgba(255,255,255,0.3); }
        .mod-history { display: flex; flex-direction: column; }
        .mod-history-head { font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.7); padding: 4px 0; }
        .mod-history-row {
          display: flex; align-items: center; gap: 8px; font-size: 11.5px;
          padding: 5px 0; border-top: 1px solid #ffffff0c;
        }
      `}</style>
    </section>
  )
}