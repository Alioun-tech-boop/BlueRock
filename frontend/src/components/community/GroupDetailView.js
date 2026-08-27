import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, Clock, Coins, Crown, EyeOff, Lock, ShieldCheck, Tag, UserCheck, UserPlus, Users, X, Check, FileText, KeyRound, Share2, Link2 } from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getCommunityGroup, getCommunityGroupMembers, getCommunityGroupPosts,
  joinCommunityGroup, leaveCommunityGroup, getCommunityMe,
  approveCommunityMemberRequest, rejectCommunityMemberRequest,
  acceptCommunityInvite, declineCommunityInvite,
} from '../../services/api'
import PostCard from './PostCard'
import Composer from './Composer'
import TriLoader from '../TriLoader'
import { PhotoAvatar } from '../../lib/photo'

function hueOf(str) {
  let h = 0
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

const CATEGORY_KEY = { general: 'grpCatGeneral', trading: 'grpCatTrading', sector: 'grpCatSector', pro: 'grpCatPro', challenge: 'grpCatChallenge' }
const ROLE_KEY = { member: 'grpRoleMember', moderator: 'grpRoleModerator', admin: 'grpRoleAdmin', creator: 'grpRoleCreator' }

function initialsOf(name) {
  return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function priceOf(xof, lang) {
  return `${(xof ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} FCFA`
}

export default function GroupDetailView({ slug, lang, embedded = false, initialMe = null, onOpenPost, onOpenMembers }) {
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [requests, setRequests] = useState([])
  const [posts, setPosts] = useState([])
  const [postsTotal, setPostsTotal] = useState(0)
  const [canPost, setCanPost] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [copied, setCopied] = useState(false)
  const [me, setMe] = useState(initialMe)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!slug) return
    if (!me) {
      getCommunityMe().then(r => { if (alive.current) setMe(r.data.user || null) }).catch(() => {})
    }
    loadGroup()
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const loadGroup = () => {
    getCommunityGroup(slug)
      .then(r => {
        if (!alive.current) return
        setGroup(r.data || null)
        setNotFound(false)
      })
      .catch(() => { if (alive.current) setNotFound(true) })
  }

  const loadMembers = () => {
    getCommunityGroupMembers(slug, { limit: 40 })
      .then(r => { if (alive.current) setMembers(r.data.members || []) })
      .catch(() => {})
    getCommunityGroupMembers(slug, { limit: 50, status: 'pending' })
      .then(r => { if (alive.current) setRequests(r.data.members || []) })
      .catch(() => {})
  }

  const loadPosts = () => {
    if (!group || !group.is_member) return
    getCommunityGroupPosts(slug, { limit: 20, admin_only: true })
      .then(r => {
        if (!alive.current) return
        setPosts(r.data.posts || [])
        setPostsTotal(r.data.total || 0)
        setCanPost(!!r.data.can_post)
      })
      .catch(() => {})
  }

  const refresh = () => {
    loadGroup()
    loadMembers()
  }

  useEffect(() => {
    if (group && group.is_member) loadPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group])

  const showFlash = (m) => {
    setFlash(m)
    setTimeout(() => { if (alive.current) setFlash('') }, 3200)
  }

  const copyLink = async () => {
    if (!group) return
    const url = typeof window !== 'undefined' ? `${window.location.origin}/community/group/${group.slug}` : `/community/group/${group.slug}`
    try {
      if (navigator.share) {
        try { await navigator.share({ title: group.name, text: group.description || '', url }); showFlash(t(lang, 'grpLinkCopied')); return } catch {}
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea'); ta.value = url; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      }
      setCopied(true); showFlash(t(lang, 'grpLinkCopied') || (lang==='en'?'Link copied!':'Lien copié !')); setTimeout(()=> setCopied(false), 1800)
    } catch { showFlash(url) }
  }

  const toggleJoin = () => {
    if (!group || busy) return
    setBusy(true)
    const call = group.is_member ? leaveCommunityGroup(slug) : joinCommunityGroup(slug)
    call
      .then(r => {
        if (!alive.current) return
        if (r.data.requires_payment && r.data.payment_url) {
          setGroup(prev => prev ? { ...prev, is_pending: true, order_pending: true } : prev)
          showFlash(t(lang, 'grpPayOpen'))
          window.open(r.data.payment_url, '_blank', 'noopener')
        } else if (r.data.requested) {
          setGroup(prev => prev ? { ...prev, is_pending: true } : prev)
          showFlash(t(lang, 'grpRequested'))
        } else if (r.data.joined) {
          showFlash(t(lang, 'grpJoinedNow'))
        }
        refresh()
      })
      .catch(e => showFlash(e?.response?.data?.detail || t(lang, 'grpErrorGeneric')))
      .finally(() => setBusy(false))
  }

  const acceptInvite = () => {
    if (!group || busy) return
    setBusy(true)
    acceptCommunityInvite(group.slug)
      .then(r => {
        if (r.data.requires_payment && r.data.payment_url) {
          setGroup(prev => prev ? { ...prev, is_pending: true, order_pending: true } : prev)
          showFlash(t(lang, 'grpPayOpen'))
          window.open(r.data.payment_url, '_blank', 'noopener')
        } else {
          showFlash(t(lang, 'grpJoinedNow'))
        }
        refresh()
      })
      .catch(e => showFlash(e?.response?.data?.detail || t(lang, 'grpErrorGeneric')))
      .finally(() => setBusy(false))
  }

  const declineInvite = () => {
    if (!group || busy) return
    setBusy(true)
    declineCommunityInvite(group.slug)
      .then(() => { showFlash(t(lang, 'grpDeclined')); refresh() })
      .catch(e => showFlash(e?.response?.data?.detail || t(lang, 'grpErrorGeneric')))
      .finally(() => setBusy(false))
  }

  const decide = (profileId, approve) => {
    const call = approve ? approveCommunityMemberRequest(slug, profileId) : rejectCommunityMemberRequest(slug, profileId)
    call
      .then(() => { showFlash(approve ? t(lang, 'grpApproved') : t(lang, 'grpRejected')); loadMembers(); refresh() })
      .catch(e => showFlash(e?.response?.data?.detail || t(lang, 'grpErrorGeneric')))
  }

  const vis = group && (group.visibility === 'private' ? 'priv' : group.visibility === 'invite_only' ? 'inv' : null)
  const visLabel = group && (group.visibility === 'private' ? t(lang, 'grpVisPrivate') : group.visibility === 'invite_only' ? t(lang, 'grpVisInvite') : t(lang, 'grpVisPublic'))

  if (notFound) {
    return <div className="co-gv-none">{t(lang, 'grpMissing')}</div>
  }
  if (!group) {
    return <div className="co-gv-none"><TriLoader compact /></div>
  }

  const adminList = group.admins || []
  const joinLabel = group.is_paid && !group.is_member && !group.is_pending
    ? `${t(lang, 'grpJoin')} · ${priceOf(group.price_xof, lang)}`
    : t(lang, 'grpJoin')

  return (
    <div className={`co-gv${embedded ? ' co-gv-embedded' : ''}`}>
      <div
        className="co-gv-cover"
        style={{
          backgroundImage: group.banner_url
            ? `url('${group.banner_url}')`
            : `linear-gradient(135deg, hsl(${hueOf(group.name)} 55% 24% / .45), hsl(${(hueOf(group.name) + 50) % 360} 45% 12% / .55))`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="co-gv-cover-fade" />
        <div className="co-gv-cover-in">
          <h2 className="co-gv-name">{group.name}</h2>
          <div className="co-gv-meta">
            {(group.member_count ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} {t(lang, 'grpMembers')}
            <span className="co-gv-dot">·</span>
            {CATEGORY_KEY[group.category] ? t(lang, CATEGORY_KEY[group.category]) : group.category}
            <span className="co-gv-dot">·</span>
            {visLabel}
          </div>
        </div>
      </div>

      <div className="co-gv-bar">
        <div className="co-gv-chips">
          <span className={`co-gv-chip${vis ? ` ${vis}` : ''}`}>
            {group.visibility === 'private' ? <Lock size={12} /> : group.visibility === 'invite_only' ? <EyeOff size={12} /> : null}
            {visLabel}
          </span>
          {group.is_paid && (
            <span className="co-gv-chip pay">
              <Coins size={12} /> {priceOf(group.price_xof, lang)}
            </span>
          )}
          <span className="co-gv-chip"><FileText size={12} /> {group.posts_count ?? 0}</span>
        </div>
        <button className="co-gv-share" onClick={copyLink} aria-label={t(lang, 'grpShareLink') || 'Copier le lien'} title={t(lang, 'grpShareLink') || 'Copier le lien'}>
            {copied ? <Check size={16} /> : <Share2 size={16} />}
            <span className="co-gv-share-txt">{copied ? (t(lang,'grpLinkCopied')||'Copié') : (t(lang,'grpShareLink')||'Partager')}</span>
          </button>
        {group.is_pending ? (
          <span className="co-gv-chip pend"><Clock size={12} />{t(lang, 'grpPending')}</span>
        ) : group.is_invited ? (
          <span className="cg-actions-row">
            <button className="co-gv-join" onClick={() => acceptInvite()} disabled={busy}>
              <UserCheck size={17} /> {t(lang, 'grpAccept')}
            </button>
            <button className="co-gv-join ghost" onClick={() => declineInvite()} disabled={busy}>
              <X size={17} /> {t(lang, 'grpDecline')}
            </button>
          </span>
        ) : (
          <button className={`co-gv-join${group.is_member ? ' on' : ''}`} onClick={toggleJoin} disabled={busy}>
            {group.is_member ? <UserCheck size={17} /> : <UserPlus size={17} />}
            {group.is_member ? t(lang, 'grpLeave') : joinLabel}
          </button>
        )}
      </div>

      {flash && <div className="co-gv-flash">{flash}</div>}

      {!group.is_member && (
        <div className="co-gv-stats">
          <div className="co-gv-stat">
            <Users size={16} />
            <span className="co-gv-stat-n">{(group.member_count ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}</span>
            <span className="co-gv-stat-l">{t(lang, 'grpMembers')}</span>
          </div>
          <div className="co-gv-stat">
            <FileText size={16} />
            <span className="co-gv-stat-n">{group.posts_count ?? 0}</span>
            <span className="co-gv-stat-l">{t(lang, 'grpPostsTitle')}</span>
          </div>
          <div className="co-gv-stat">
            <Tag size={16} />
            <span className="co-gv-stat-n">{CATEGORY_KEY[group.category] ? t(lang, CATEGORY_KEY[group.category]) : (group.category || '—')}</span>
            <span className="co-gv-stat-l">{t(lang, 'grpCategory')}</span>
          </div>
          <div className="co-gv-stat">
            {group.visibility === 'public' ? <KeyRound size={16} /> : group.visibility === 'private' ? <Lock size={16} /> : <EyeOff size={16} />}
            <span className="co-gv-stat-n">{visLabel}</span>
            <span className="co-gv-stat-l">{t(lang, 'grpVisibility')}</span>
          </div>
        </div>
      )}

      {!group.is_member && adminList.length > 0 && (
        <section className="co-gv-panel co-gv-runby">
          <span className="co-gv-panel-label">{t(lang, 'grpRunBy')}</span>
          <div className="co-gv-runby-list">
            {adminList.slice(0, 3).map(m => (
              <div className="co-gv-runby-item" key={`${m.id}-${m.role}`}>
                <PhotoAvatar name={m.display_name} avatar={m.avatar} color={m.avatar_color} className="co-gv-mavatar" size={54} />
                <div className="co-gv-runby-info">
                  <span className="co-gv-mname">
                    {m.display_name}
                    {m.verified && <BadgeCheck size={13} color="#18C27C" />}
                    {m.is_pro && <BadgeCheck size={13} color="#E8B84B" />}
                    {m.role === 'creator' && <Crown size={13} color="#E8B84B" />}
                    {m.role === 'admin' && <ShieldCheck size={13} color="#18C27C" />}
                  </span>
                  <span className="co-gv-mrole">
                    {m.role === 'creator' ? t(lang, 'grpRoleCreator') : t(lang, 'grpRoleAdmin')}
                    {m.handle ? ` · @${m.handle}` : ''}
                  </span>
                  {m.bio && <span className="co-gv-runby-bio">{m.bio.slice(0, 90)}{m.bio.length > 90 ? '…' : ''}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {group.description && (
        <section className="co-gv-panel">
          <span className="co-gv-panel-label">{t(lang, 'grpAbout')}</span>
          <p className="co-gv-text">{group.description}</p>
        </section>
      )}

      {group.rules && (
        <section className="co-gv-panel">
          <span className="co-gv-panel-label">{t(lang, 'grpGroupRules')}</span>
          <p className="co-gv-text">{group.rules}</p>
        </section>
      )}

      {group.is_member && (
        <section className="co-gv-posts">
          <div className="co-gv-chead">
            <span>{t(lang, 'grpPostsTitle')}</span>
            <span className="co-gv-cpill">{postsTotal}</span>
          </div>
          {canPost && <Composer lang={lang} me={me} groupId={group.id} onPublished={loadPosts} />}
          {posts.length === 0 ? (
            <div className="co-gv-none">{t(lang, 'grpNoPosts')}</div>
          ) : (
            <div className="co-gv-postlist">
              {posts.map((p, i) => (
                <PostCard key={p.id} p={p} lang={lang} me={me} delay={i} onOpen={onOpenPost} />
              ))}
            </div>
          )}
        </section>
      )}

      {group.is_member && adminList.length > 0 && (
        <section className="co-gv-members">
          <div className="co-gv-chead">
            <span>{t(lang, 'grpAdmins')}</span>
            <span className="co-gv-cpill">{adminList.length}</span>
          </div>
          {adminList.length === 0 ? (
            <div className="co-gv-none">{t(lang, 'grpNoMembers')}</div>
          ) : (
            <div className="co-gv-grid">
              {adminList.map(m => (
                <div className="co-gv-m" key={m.id}>
                  <PhotoAvatar name={m.display_name} avatar={m.avatar} color={m.avatar_color} className="co-gv-mavatar" size={54} />
                  <div className="co-gv-mname">
                    {m.display_name}
                    {m.verified && <BadgeCheck size={13} color="#18C27C" />}
                    {m.role === 'admin' && <ShieldCheck size={13} color="#18C27C" />}
                    {m.role === 'creator' && <Crown size={13} color="#E8B84B" />}
                  </div>
                  <div className="co-gv-mrole">{m.role === 'creator' ? t(lang, 'grpRoleCreator') : t(lang, 'grpRoleAdmin')}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="co-gv-members">
        <div className="co-gv-chead">
          <span>{t(lang, 'grpMembersTitle')}</span>
          <span className="co-gv-cpill">{group.member_count ?? members.length}</span>
        </div>
        <button className="co-gv-members-btn" onClick={() => onOpenMembers && onOpenMembers(group.slug)}>
          <Users size={15} />
          {t(lang, 'grpViewMembers')}
        </button>
      </section>

      {group.is_admin && requests.length > 0 && (
        <section className="co-gv-requests">
          <div className="co-gv-chead">
            <span>{t(lang, 'grpRequestsTitle')}</span>
            <span className="co-gv-cpill">{requests.length}</span>
          </div>
          {requests.map(m => (
            <div className="co-gv-req" key={m.profile_id}>
              <PhotoAvatar name={m.display_name} avatar={m.avatar} color={m.avatar_color} className="co-gv-mavatar sm" size={38} />
              <span className="co-gv-reqinfo">
                <span className="co-gv-mname">{m.display_name}</span>
                <span className="co-gv-mrole">@{m.handle || ''}</span>
              </span>
              <span className="cg-actions-row">
                <button className="co-gv-join on" onClick={() => decide(m.profile_id, true)}>
                  <UserCheck size={15} /> {t(lang, 'grpApprove')}
                </button>
                <button className="co-gv-join ghost" onClick={() => decide(m.profile_id, false)}>
                  <X size={15} /> {t(lang, 'grpDecline')}
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <style jsx global>{`
        .co-gv { display: flex; flex-direction: column; }

        .co-gv-cover {
          position: relative; height: 200px; overflow: hidden;
          border-radius: 24px;
          box-shadow: 0 30px 70px -30px rgba(0, 0, 0, .9);
          border: 1px solid rgba(255, 255, 255, .06);
        }
        .co-gv-cover-fade { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(10,10,13,0) 20%, rgba(10,10,13,.55) 62%, rgba(10,10,13,.95) 100%); }
        .co-gv-cover-in { position: absolute; left: 16px; right: 16px; bottom: 14px; z-index: 2; display: flex; flex-direction: column; gap: 6px; }
        .co-gv-name {
          margin: 0; font-family: var(--font-rounded);
          font-size: clamp(22px, 5vw, 30px); font-weight: 850; color: #fff;
          letter-spacing: -.02em; line-height: 1.2; word-wrap: break-word;
          text-shadow: 0 4px 22px rgba(0, 0, 0, .6);
        }
        .co-gv-meta {
          display: flex; align-items: center; gap: 8px;
          font-family: var(--font-rounded); font-size: 13px; font-weight: 700;
          color: rgba(255, 255, 255, .85); text-shadow: 0 3px 14px rgba(0, 0, 0, .55);
          font-variant-numeric: tabular-nums;
        }
        .co-gv-dot { opacity: .5; }

        .co-gv-bar {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 0; border-bottom: 1px solid rgba(255, 255, 255, .07);
        }
        .co-gv-chips { display: flex; flex: 1; min-width: 0; gap: 8px; flex-wrap: wrap; }
        .co-gv-chip {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-size: 12px; font-weight: 700;
          color: rgba(255, 255, 255, .62); background: rgba(255, 255, 255, .06);
          border: 1px solid rgba(255, 255, 255, .09); border-radius: 999px; padding: 6px 12px;
        }
        .co-gv-chip.priv, .co-gv-chip.inv { color: rgba(255, 154, 66, .95); background: rgba(255, 154, 66, .09); border-color: rgba(255, 154, 66, .3); }
        .co-gv-chip.pay { color: #4fe0a0; background: rgba(24, 194, 124, .09); border-color: rgba(24, 194, 124, .3); }
        .co-gv-chip.pend { color: #64b5ff; background: rgba(78,150,255,.10); border-color: rgba(78,150,255,.3); }
        .co-gv-join {
          flex: none; display: inline-flex; align-items: center; gap: 8px;
          background: #fff; color: #0c0c0f; border: none; border-radius: 999px;
          padding: 12px 24px; font-family: var(--font-rounded); font-size: 14px; font-weight: 800;
          cursor: pointer; transition: all .15s; box-shadow: 0 10px 30px -10px rgba(255, 255, 255, .35);
        }
        .co-gv-join.ghost {
          background: transparent; color: rgba(255, 255, 255, .85);
          border: 1px solid rgba(255, 255, 255, .28); box-shadow: none;
        }
        .co-gv-join.ghost:hover:not(:disabled) { background: rgba(255, 255, 255, .09); }
        .co-gv-join:hover:not(:disabled) { background: #e8e8ec; }
        .co-gv-join:disabled { opacity: .55; cursor: default; }
        .co-gv-join.on {
          background: transparent; color: rgba(255, 255, 255, .85);
          border: 1px solid rgba(255, 255, 255, .28); box-shadow: none;
        }
        .co-gv-join.on:hover:not(:disabled) { background: rgba(255, 255, 255, .09); }
        .co-gv-share {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(255,255,255,.07); color: rgba(255,255,255,.88);
          border: 1px solid rgba(255,255,255,.14); border-radius: 999px;
          padding: 10px 14px; font-family: var(--font-rounded); font-size: 13px; font-weight: 700;
          cursor: pointer; transition: all .15s; flex: none;
        }
        .co-gv-share:hover { background: rgba(255,255,255,.12); color: #fff; }
        .co-gv-share:active { transform: scale(.97); }
        .co-gv-share-txt { display: none; }
        @media (min-width: 420px) { .co-gv-share-txt { display: inline; } }

        .co-gv-flash {
          margin-top: 12px; font-size: 13px; color: #4fe0a0;
          background: rgba(24, 194, 124, .10); border: 1px solid rgba(24, 194, 124, .28);
          border-radius: 12px; padding: 11px 14px; animation: fadeUp .3s ease both;
        }

        .co-gv-panel {
          margin-top: 14px; padding: 14px 16px;
          background: rgba(255, 255, 255, .04); border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 18px;
        }
        .co-gv-stats {
          margin-top: 16px; display: grid;
          grid-template-columns: repeat(2, 1fr); gap: 10px;
        }
        @media (min-width: 900px) {
          .co-gv-stats { grid-template-columns: repeat(4, 1fr); }
        }
        .co-gv-stat {
          display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
          padding: 13px 15px; border-radius: 16px;
          background: linear-gradient(160deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
          border: 1px solid rgba(255,255,255,.08);
        }
        .co-gv-stat svg { color: #1ED760; }
        .co-gv-stat-n {
          font-family: var(--font-rounded); font-size: 18px; font-weight: 850; color: #fff;
          letter-spacing: -.01em; line-height: 1.15;
        }
        .co-gv-stat-l {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .07em; color: rgba(255, 255, 255, .42);
        }
        .co-gv-runby { display: flex; flex-direction: column; gap: 10px; }
        .co-gv-runby-list { display: flex; flex-direction: column; gap: 8px; }
        .co-gv-runby-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: 14px;
          background: rgba(255, 255, 255, .03); border: 1px solid rgba(255, 255, 255, .06);
        }
        .co-gv-runby-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; align-items: flex-start; }
        .co-gv-runby-bio {
          font-size: 12px; color: rgba(255, 255, 255, .55); line-height: 1.4;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .co-gv-panel-label {
          font-family: var(--font-rounded); font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: .08em; color: rgba(255, 255, 255, .4);
        }
        .co-gv-text { margin: 7px 0 0; font-size: 14px; color: rgba(255, 255, 255, .78); line-height: 1.6; white-space: pre-wrap; }

        .co-gv-posts { margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
        .co-gv-postlist { display: flex; flex-direction: column; gap: 12px; }

        .co-gv-members { margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
        .co-gv-members-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 9px;
          width: 100%; border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .05);
          color: #fff; border-radius: 14px; padding: 13px 18px; cursor: pointer;
          font-family: var(--font-rounded); font-size: 14px; font-weight: 800;
          transition: background .15s, transform .12s;
        }
        .co-gv-members-btn:hover { background: rgba(255, 255, 255, .1); }
        .co-gv-members-btn:active { transform: scale(.985); }
        .co-gv-requests { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
        .co-gv-chead {
          display: flex; align-items: center; gap: 9px;
          font-family: var(--font-rounded); font-size: 14.5px; font-weight: 800; color: rgba(255, 255, 255, .95);
        }
        .co-gv-cpill {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 24px; height: 24px; border-radius: 999px;
          background: rgba(255, 255, 255, .09); color: rgba(255, 255, 255, .6);
          font-size: 12px; font-variant-numeric: tabular-nums;
        }
        .co-gv-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 1024px) {
          .co-gv-grid { grid-template-columns: repeat(4, 1fr); }
          .co-gv-cover { height: 260px; }
        }
        .co-gv-m {
          display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center;
          padding: 14px 10px; background: rgba(255, 255, 255, .04);
          border: 1px solid rgba(255, 255, 255, .08); border-radius: 18px;
          transition: border-color .15s;
        }
        .co-gv-m:hover { border-color: rgba(255, 255, 255, .18); }
        .co-gv-mavatar {
          width: 54px; height: 54px; border-radius: 50%; flex: none;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 800; color: #fff; background-color: #232329;
          box-shadow: 0 12px 26px -8px rgba(0, 0, 0, .8), inset 0 1px 0 rgba(255, 255, 255, .14);
        }
        .co-gv-mavatar.sm { width: 38px; height: 38px; font-size: 13px; }
        .co-gv-mname {
          display: flex; align-items: center; justify-content: center; gap: 5px; max-width: 100%;
          font-family: var(--font-rounded); font-size: 13px; font-weight: 700; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .co-gv-mname svg { flex: none; }
        .co-gv-mrole { font-size: 11.5px; font-weight: 600; color: rgba(255, 255, 255, .42); }
        .co-gv-req {
          display: flex; align-items: center; gap: 12px;
          padding: 12px; background: rgba(255, 255, 255, .04);
          border: 1px solid rgba(255, 255, 255, .08); border-radius: 16px;
        }
        .co-gv-reqinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
        .co-gv-none { font-size: 13px; color: rgba(255, 255, 255, .42); padding: 6px 2px; }

        .cg-actions-row { display: flex; gap: 9px; }
      `}</style>
    </div>
  )
}