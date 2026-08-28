import { useEffect, useState } from 'react'
import { Users, UserPlus, UserCheck, Clock, Coins, ChevronRight } from 'lucide-react'
import { t } from '../../lib/i18n'
import { getCommunityGroups, joinCommunityGroup, leaveCommunityGroup } from '../../services/api'
import { coverPhoto } from '../../lib/photo'

function hueOf(str) {
  let h = 0
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

function JoinBtn({ g, lang }) {
  const [on, setOn] = useState(!!(g.my_role || g.is_member))
  const [pending, setPending] = useState(!!(g.is_pending || g.is_invited))
  const [busy, setBusy] = useState(false)
  const click = (e) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    const call = on ? leaveCommunityGroup(g.slug) : joinCommunityGroup(g.slug)
    call
      .then(r => {
        const d = r.data
        if (d.requires_payment && d.payment_url) {
          window.open(d.payment_url, '_blank', 'noopener')
        } else if (d && d.joined) {
          setOn(true)
          setPending(false)
        } else if (d && d.requested) {
          setPending(true)
        }
      })
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  if (pending) {
    return (
      <button className="cc-join pnd" disabled={busy} aria-label={t(lang, 'grpPending')}>
        <Clock size={12} />
        {t(lang, 'grpPending')}
      </button>
    )
  }
  return (
    <button className={`cc-join ${on ? 'on' : ''}`} onClick={click} disabled={busy} aria-label={on ? t(lang, 'coFollowing') : t(lang, 'cFollow')}>
      {on ? <UserCheck size={12} /> : <UserPlus size={12} />}
      {on ? t(lang, 'coFollowing') : (g.is_paid ? `${t(lang, 'grpJoin')} · ${(g.price_xof ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}` : t(lang, 'grpJoin'))}
    </button>
  )
}

export default function CommunityCarousel({ lang, onSeeAll, onOpen }) {
  const [groups, setGroups] = useState(null)

  useEffect(() => {
    getCommunityGroups({ limit: 12 })
      .then(r => setGroups(r.data.groups || []))
      .catch(() => setGroups([]))
  }, [])

  return (
    <section className="cc-root" aria-label={t(lang, 'grpTitle')}>
      <div className="cc-head">
        <h3 className="cc-title">{t(lang, 'grpTitle')}</h3>
        <button className="cc-all" onClick={onSeeAll}>
          {t(lang, 'coSeeAll')} <ChevronRight size={14} />
        </button>
      </div>
      {groups === null ? (
        <div className="cc-track" aria-hidden />
      ) : groups.length === 0 ? (
        <div className="co-rail-empty">{t(lang, 'coRailProEmpty')}</div>
      ) : (
        <div className="cc-track">
          {groups.map(g => (
            <div className="cc-card cc-open" key={g.id} onClick={() => onOpen && onOpen(g)}>
              <div
                className="cc-banner"
                style={{
                  backgroundImage: g.banner_url
                    ? `url('${g.banner_url}')`
                    : `linear-gradient(135deg, hsl(${hueOf(g.name)} 55% 22% / .55), hsl(${(hueOf(g.name) + 50) % 360} 45% 14% / .40))`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="cc-body">
                <div className="cc-name">{g.name}</div>
                <div className="cc-count">
                  <Users size={12} />
                  {(g.member_count ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} {t(lang, 'coRailFollowers')}
                  {g.is_paid && <span className="cc-paid"><Coins size={11} />{(g.price_xof ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}</span>}
                </div>
                <JoinBtn g={g} lang={lang} />
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        .cc-card.cc-open { cursor: pointer; }
        .cc-join.pnd {
          background: rgba(78,150,255,0.10); border: 1px solid rgba(78,150,255,0.3);
          color: #64b5ff; cursor: default;
        }
        .cc-join.pnd:hover:not(:disabled) { background: rgba(78,150,255,0.10); }
        .cc-paid {
          display: inline-flex; align-items: center; gap: 3px;
          color: #4fe0a0; font-weight: 700;
        }
        .cc-paid svg { color: #18C27C; }
      `}</style>
    </section>
  )
}