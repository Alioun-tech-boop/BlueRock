import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, MapPin, User2, Lock, Users, Clock, Plus, Video, MessagesSquare, Wrench, Calendar } from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getCommunityMe,
  getCommunityEvents,
  createCommunityEvent,
  registerCommunityEvent,
  cancelCommunityEvent,
} from '../../services/api'
import TriLoader from '../TriLoader'

const KINDS = ['all', 'webinar', 'ama', 'meetup', 'workshop']
const KIND_ICON = { webinar: <Video size={11} />, ama: <MessagesSquare size={11} />, meetup: <Users size={11} />, workshop: <Wrench size={11} /> }

function fmtDate(isoStr, lang) {
  if (!isoStr) return ''
  const d = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z')
  if (isNaN(d.getTime())) return isoStr
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

export default function EventsSection({ lang }) {
  const [events, setEvents] = useState([])
  const [kind, setKind] = useState('all')
  const [me, setMe] = useState(undefined) // undefined = chargement, null = anonyme
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', kind: 'webinar', starts_at: '', ends_at: '', location: '', speakers: '', capacity: '', premium_only: false })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    getCommunityMe().then(r => setMe(r.data)).catch(() => setMe(null))
  }, [])

  const load = useCallback(() => {
    getCommunityEvents(kind === 'all' ? { upcoming: true } : { upcoming: true, kind })
      .then(r => setEvents(r.data.events || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [kind])

  useEffect(() => { load() }, [load])

  const act = (ev, action) => {
    setErr('')
    const call = action === 'register' ? registerCommunityEvent(ev.id) : cancelCommunityEvent(ev.id)
    call.then(() => load()).catch(e => setErr(e?.response?.data?.detail || String(e)))
  }

  const submit = () => {
    setErr(''); setMsg('')
    if ((form.title || '').trim().length < 3) { setErr(t(lang, 'cEvNameRequired')); return }
    if (!form.starts_at) { setErr(t(lang, 'cEvCreateStart')); return }
    createCommunityEvent({
      title: form.title.trim(),
      kind: form.kind,
      description: '',
      location: form.location.trim(),
      speakers: form.speakers.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : '',
      capacity: form.capacity ? Number(form.capacity) : null,
      premium_only: form.premium_only,
    }).then(() => {
      setMsg(t(lang, 'cEvCreated'))
      setCreateOpen(false)
      setForm({ title: '', kind: 'webinar', starts_at: '', ends_at: '', location: '', speakers: '', capacity: '', premium_only: false })
      load()
    }).catch(e => setErr(e?.response?.data?.detail || String(e)))
  }

  const isStaff = !!me?.user?.is_staff
  const isPremium = !!me?.user?.is_premium

  return (
    <section className="ev-root">
      <div className="ev-head">
        <span className="ev-title"><CalendarDays size={16} />{t(lang, 'cEvTitle')}</span>
        <span className="ev-sub">{t(lang, 'cEvSub')}</span>
      </div>
      <div className="ev-chips">
        {KINDS.map(k => (
          <button key={k} className={`ev-chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {t(lang, k === 'all' ? 'cEvKindAll' : 'cEv' + k[0].toUpperCase() + k.slice(1))}
          </button>
        ))}
      </div>
      <div className="ev-list">
        {loading ? (
          <div className="ev-empty"><TriLoader compact label={t(lang, 'cEvTitle')} /></div>
        ) : events.length === 0 ? (
          <div className="ev-empty">{t(lang, 'cEvNoEvents')}</div>
        ) : events.map(ev => (
          <div key={ev.id} className="ev-card">
            <div className="ev-card-top">
              <span className="ev-kind">{KIND_ICON[ev.kind] || <Calendar size={11} />} {t(lang, 'cEv' + ev.kind[0].toUpperCase() + ev.kind.slice(1))}</span>
              {ev.premium_only && (
                <span className="ev-premium"><Lock size={10} />{t(lang, 'cEvPremiumOnly')}</span>
              )}
            </div>
            <div className="ev-title-line">{ev.title}</div>
            <div className="ev-meta">
              <span><Clock size={12} />{fmtDate(ev.starts_at, lang)}{ev.ends_at ? ' → ' + fmtDate(ev.ends_at, lang) : ''}</span>
              {ev.location && <span><MapPin size={12} />{ev.location || t(lang, 'cEvOnline')}</span>}
              {ev.speakers && <span><User2 size={12} />{t(lang, 'cEvSpeakers')} : {ev.speakers}</span>}
            </div>
            <div className="ev-foot">
              <span className="ev-counts">
                <Users size={12} />{ev.attendees} {t(lang, 'cEvAttendees')}
                {ev.waitlisted > 0 && <span className="ev-wl">· {ev.waitlisted} {t(lang, 'cEvWaitlist')}</span>}
                {ev.capacity ? <span className="ev-wl">· {ev.attendees}/{ev.capacity}</span> : null}
              </span>
              {ev.my_status === 'registered' ? (
                <button className="ev-btn on" onClick={() => act(ev, 'cancel')}>{t(lang, 'cEvRegistered')} ✓</button>
              ) : ev.my_status === 'waitlisted' ? (
                <button className="ev-btn wl" onClick={() => act(ev, 'cancel')}>{t(lang, 'cEvWaitlisted')}</button>
              ) : ev.premium_only && !isPremium ? (
                <span className="ev-lock"><Lock size={11} />{t(lang, 'cEvPremiumOnly')}</span>
              ) : ev.full && !ev.my_status ? (
                <button className="ev-btn full" disabled>{t(lang, 'cEvFull')}</button>
              ) : (
                <button className="ev-btn" onClick={() => act(ev, 'register')}>{t(lang, 'cEvRegister')}</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {err && <div className="ev-err">{err}</div>}
      {isStaff && (
        <button className="ev-create-btn" onClick={() => setCreateOpen(o => !o)}>
          <Plus size={13} />{t(lang, 'cEvCreate')}
        </button>
      )}
      {createOpen && (
        <div className="ev-form">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t(lang, 'cEvCreateTitle')} />
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            {KINDS.filter(k => k !== 'all').map(k => <option key={k} value={k}>{t(lang, 'cEv' + k[0].toUpperCase() + k.slice(1))}</option>)}
          </select>
          <label>{t(lang, 'cEvCreateStart')}<input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></label>
          <label>{t(lang, 'cEvCreateEnd')}<input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></label>
          <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t(lang, 'cEvLocation')} />
          <input value={form.speakers} onChange={e => setForm({ ...form, speakers: e.target.value })} placeholder={t(lang, 'cEvSpeakers')} />
          <input type="number" min="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder={t(lang, 'cEvCreateCapacity')} />
          <label className="ev-check"><input type="checkbox" checked={form.premium_only} onChange={e => setForm({ ...form, premium_only: e.target.checked })} />{t(lang, 'cEvCreatePremium')}</label>
          {msg && <div className="ev-ok">{msg}</div>}
          <button className="ev-btn" onClick={submit}>{t(lang, 'cEvCreate')}</button>
        </div>
      )}
      <style jsx>{`
        .ev-root {
          background: #0A0A0D; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px;
          padding: 14px; display: flex; flex-direction: column; gap: 10px; margin-top: 10px;
        }
        .ev-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ev-title { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: #fff; }
        .ev-sub { font-size: 11.5px; color: rgba(255,255,255,0.45); font-weight: 700; }
        .ev-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .ev-chip {
          font-size: 11px; font-weight: 800; background: #ffffff0a; border: 1px solid #ffffff14;
          color: rgba(255,255,255,0.6); border-radius: 999px; padding: 4px 10px; cursor: pointer;
        }
        .ev-chip.on { background: rgba(255,255,255,0.12); border-color: #fff; color: #fff; }
        .ev-list { display: flex; flex-direction: column; gap: 8px; }
        .ev-empty { font-size: 12.5px; color: rgba(255,255,255,0.45); text-align: center; padding: 8px; }
        .ev-card { background: #ffffff08; border: 1px solid #ffffff12; border-radius: 12px; padding: 11px; display: flex; flex-direction: column; gap: 7px; }
        .ev-card-top { display: flex; align-items: center; gap: 8px; }
        .ev-kind {
          font-size: 10.5px; font-weight: 800; background: rgba(255,255,255,0.10); color: #fff;
          border: 1px solid rgba(255,255,255,0.35); border-radius: 999px; padding: 2px 9px;
        }
        .ev-premium { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; color: #F5C518; background: #F5C51814; border: 1px solid #F5C51833; border-radius: 999px; padding: 2px 8px; }
        .ev-title-line { font-size: 13.5px; font-weight: 800; color: #fff; line-height: 1.25; }
        .ev-meta { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: rgba(255,255,255,0.55); }
        .ev-meta span { display: inline-flex; align-items: center; gap: 4px; }
        .ev-foot { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
        .ev-counts { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(255,255,255,0.5); flex: 1; }
        .ev-wl { color: #F59E0B; }
        .ev-btn {
          font-size: 11.5px; font-weight: 800; background: #fff; color: #000; border: none;
          border-radius: 10px; padding: 5px 14px; cursor: pointer;
        }
        .ev-btn:hover { background: #E4E5EA; }
        .ev-btn.on { background: #E4E5EA; }
        .ev-btn.wl { background: #F59E0B; color: #101418; }
        .ev-btn.full { background: #ffffff14; color: rgba(255,255,255,0.4); cursor: default; }
        .ev-lock { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: #F5C518; }
        .ev-err { font-size: 11px; color: #ff6b8f; }
        .ev-ok { font-size: 11px; color: #5ee0a5; }
        .ev-create-btn {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 800;
          background: rgba(255,255,255,0.12); border: 1px solid #fff; color: #fff; border-radius: 10px; padding: 5px 13px; cursor: pointer;
        }
        .ev-form { display: flex; flex-direction: column; gap: 7px; background: #ffffff08; border: 1px solid #ffffff12; border-radius: 12px; padding: 11px; }
        .ev-form input, .ev-form select {
          background: #0e1216; border: 1px solid #ffffff1e; color: #fff; border-radius: 8px; padding: 7px 10px; font-size: 12px; font-family: inherit;
        }
        .ev-form label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: rgba(255,255,255,0.6); }
        .ev-check { flex-direction: row !important; align-items: center; gap: 6px !important; }
      `}</style>
    </section>
  )
}