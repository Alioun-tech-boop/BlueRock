import { useEffect, useState } from 'react'
import { CalendarDays, ChevronRight, UserCheck, Calendar } from 'lucide-react'
import { t } from '../../lib/i18n'
import { getCommunityEvents, registerCommunityEvent, cancelCommunityEvent } from '../../services/api'
import TriLoader from '../TriLoader'

function isLive(ev) {
  if (!ev || !ev.starts_at) return false
  const now = Date.now()
  const s = new Date(ev.starts_at).getTime()
  const e = ev.ends_at ? new Date(ev.ends_at).getTime() : s + 3 * 3600 * 1000
  return !isNaN(s) && now >= s && now <= e
}

function monthLabel(iso, lang) {
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' })
      .format(new Date(iso)).replace('.', '')
  } catch {
    return ''
  }
}

function AttendBtn({ ev, lang }) {
  const [on, setOn] = useState(ev.is_registered || false)
  const [busy, setBusy] = useState(false)
  const click = () => {
    if (busy) return
    setBusy(true)
    const call = on ? cancelCommunityEvent(ev.id) : registerCommunityEvent(ev.id)
    call.then(() => setOn(!on)).catch(() => {}).finally(() => setBusy(false))
  }
  return (
    <button className={`es-btn ${on ? 'on' : ''}`} onClick={click} disabled={busy || isLive(ev)}>
      {on ? <UserCheck size={13} /> : <Calendar size={13} />}
      {on ? t(lang, 'coGoing') : t(lang, 'coAttend')}
    </button>
  )
}

export default function EventsStrip({ lang, onSeeAll }) {
  const [events, setEvents] = useState(null)

  useEffect(() => {
    getCommunityEvents({ upcoming: true, limit: 3 })
      .then(r => setEvents(r.data.events || []))
      .catch(() => setEvents([]))
  }, [])

  return (
    <section className="es-root" aria-label={t(lang, 'coRailEvents')}>
      <div className="es-head">
        <h3 className="es-title"><CalendarDays size={15} />{t(lang, 'coRailEvents')}</h3>
        <button className="es-all" onClick={onSeeAll}>
          {t(lang, 'coSeeAll')} <ChevronRight size={14} />
        </button>
      </div>

      {events === null ? (
        <div className="es-grid"><TriLoader compact label={t(lang, 'coRailEvents')} /></div>
      ) : events.length === 0 ? (
        <div className="co-rail-empty">{t(lang, 'coRailEventEmpty')}</div>
      ) : (
        <div className="es-grid">
          {events.map(ev => {
            const [d, m] = monthLabel(ev.starts_at, lang).split(' ')
            return (
              <div className="es-card" key={ev.id}>
                <div className="es-top">
                  <span className="es-date">
                    <span className="d">{d}</span>
                    <span className="m">{m}</span>
                  </span>
                  <span className={`es-kind ${isLive(ev) ? 'solid' : ''}`}>
                    {isLive(ev) ? t(lang, 'coRailLive') : ev.kind}
                  </span>
                </div>
                <div className="es-title">{ev.title}</div>
                <div className="es-meta">
                  {ev.location && <span>{ev.location}</span>}
                  <span>{(ev.attendees ?? 0).toString()} · {t(lang, 'coRailRegistered')}</span>
                </div>
                <div className="es-foot">
                  <AttendBtn ev={ev} lang={lang} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}