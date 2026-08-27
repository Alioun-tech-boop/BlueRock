import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Users, UserPlus, Search, Plus, ArrowLeft, Lock, Crown, ShieldCheck,
  Ban, PauseCircle, RotateCcw, Check, X, EyeOff, Tag, BadgeCheck, Coins, Clock, MessageCircle, Share2, Link2,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getCommunityGroups, createCommunityGroup, getCommunityGroup,
  joinCommunityGroup, leaveCommunityGroup, inviteCommunityMember,
  acceptCommunityInvite, declineCommunityInvite, getCommunityGroupMembers,
  getCommunityGroupInvites, setCommunityMemberRole, suspendCommunityMember,
  banCommunityMember, restoreCommunityMember, getCommunityUsers,
  archiveCommunityGroup, getCommunityGroupPosts,
  approveCommunityMemberRequest, rejectCommunityMemberRequest,
} from '../../services/api'
import ServerDownArt from '../ServerDownArt'
import TriLoader from '../TriLoader'
import PostCard from './PostCard'
import Composer from './Composer'
import { getCommunityMe } from '../../services/api'
import { PhotoAvatar } from '../../lib/photo'

const CATEGORIES = ['general', 'trading', 'sector', 'pro', 'challenge']
const SCOPES = [
  { key: 'all', label: 'grpScopeAll' },
  { key: 'public', label: 'grpScopePublic' },
  { key: 'private', label: 'grpScopePrivate' },
  { key: 'bluerock', label: 'grpScopeBluerock' },
]
const VISIBILITIES = ['public', 'private', 'invite_only']
const ROLE_LABEL_KEY = { member: 'grpRoleMember', moderator: 'grpRoleModerator', admin: 'grpRoleAdmin', creator: 'grpRoleCreator' }
const STATUS_LABEL_KEY = { active: 'grpStatusActive', invited: 'grpStatusInvited', suspended: 'grpStatusSuspended', banned: 'grpStatusBanned' }

function hueOf(str) {
  let h = 0
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

function initialsOf(name) {
  return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function VisibilityBadge({ g, lang }) {
  if (g.visibility === 'public') return null
  const label = g.visibility === 'private' ? t(lang, 'grpVisPrivate') : t(lang, 'grpVisInvite')
  return (
    <span className={`cg-chip ${g.visibility === 'invite_only' ? 'inv' : 'priv'}`}>
      {g.visibility === 'invite_only' ? <EyeOff size={12.5} /> : <Lock size={12.5} />}
      {label}
    </span>
  )
}

export default function CommunityGroupsSection({ lang, user, onOpenMembers }) {
  const [groups, setGroups] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [version, setVersion] = useState(0)
  const mounted = useRef(true)
  const debounce = useRef(null)

  const load = useCallback((sc = scope, q = search) => {
    setLoading(true)
    setFailed(false)
    getCommunityGroups({ search: q, scope: sc, limit: 30 })
      .then(r => {
        if (!mounted.current) return
        setGroups(r.data.groups || [])
        setTotal(r.data.total || 0)
      })
      .catch(() => { if (mounted.current) setFailed(true) })
      .finally(() => { if (mounted.current) setLoading(false) })
  }, [scope, search])

  useEffect(() => {
    mounted.current = true
    load()
    return () => { mounted.current = false }
  }, [load])

  const onSearch = (q) => {
    setSearch(q)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => load(scope, q), 400)
  }

  const flashMsg = (msg) => {
    setFlash(msg)
    setTimeout(() => { if (mounted.current) setFlash('') }, 2600)
  }

  const copyGroupLink = async (g, e) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    const url = typeof window !== 'undefined' ? `${window.location.origin}/community/group/${g.slug}` : `/community/group/${g.slug}`
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(url)
      else { const ta=document.createElement('textarea'); ta.value=url; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
      flashMsg(t(lang,'grpLinkCopied')||'Lien copié !')
    } catch { flashMsg(url) }
  }

  const afterMutation = (fn) => fn()
    .then(r => {
      setVersion(v => v + 1)
      load()
      if (selected) fetchDetail(selected.slug)
      return r
    })
    .catch(e => { setError(e?.response?.data?.detail || t(lang, 'grpErrorGeneric')); throw e })

  const fetchDetail = (slug) => {
    getCommunityGroup(slug)
      .then(r => {
        if (!mounted.current) return
        setSelected(prev => (prev && prev.slug === slug ? { ...r.data } : prev))
        setError('')
      })
      .catch(e => {
        if (mounted.current) {
          setError(e?.response?.data?.detail || t(lang, 'grpErrorGeneric'))
          setSelected(prev => (prev && prev.slug === slug ? { ...prev, denied: true } : prev))
        }
      })
  }

  const openGroup = (g) => {
    setError('')
    setSelected({ ...g, denied: false })
    fetchDetail(g.slug)
  }

  return (
    <>
      {selected ? (
          <GroupDetail
            lang={lang}
            initial={selected}
            version={version}
            error={error}
            setError={setError}
            flashMsg={flashMsg}
            onBack={() => { setSelected(null); setError(''); load() }}
            onOpenMembers={onOpenMembers}
            onMutate={(fn, thenMsg, thenClose) => afterMutation(fn).then(() => { if (thenMsg) flashMsg(thenMsg); if (thenClose) setSelected(null) })}
          />
      ) : (
        <div className="cg-root">
          <div className="cg-intro">
            <div className="cg-intro-title">
              <Users size={18} color="#18C27C" />
              <span>{t(lang, 'grpTitle')}</span>
            </div>
            <span className="cg-intro-sub">{t(lang, 'grpSub')}</span>
          </div>

          <div className="cg-toolbar">
            <div className="cg-search">
              <Search size={15} color="#5C6776" />
              <input
                value={search}
                onChange={e => onSearch(e.target.value)}
                placeholder={t(lang, 'grpSearch')}
                aria-label={t(lang, 'grpSearch')}
              />
            </div>
            <button className="cg-create-btn" onClick={() => setCreateOpen(true)} aria-label={t(lang, 'grpCreate')}>
              <Plus size={17} strokeWidth={2.6} />
            </button>
          </div>

          <div className="cg-chips" role="tablist" aria-label={t(lang, 'grpScopeAll')}>
            {SCOPES.map(s => (
              <button
                key={s.key}
                role="tab"
                aria-selected={scope === s.key}
                className={`cg-chip scope${scope === s.key ? ' on' : ''}`}
                onClick={() => { setScope(s.key); load(s.key) }}
              >
                {(s.key === 'bluerock' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" fill="currentColor"/></svg>)}
                {t(lang, s.label)}
              </button>
            ))}
          </div>

          {error && <div className="cg-error">{error}</div>}
          {flash && <div className="cg-flash">{flash}</div>}

          {loading && groups.length === 0 ? (
            <div className="cg-skel"><TriLoader compact label={t(lang, 'loading')} /></div>
          ) : failed ? (
            <div className="cg-off">
              <ServerDownArt size={170} />
              <span className="cg-off-t">{t(lang, 'loadError')}</span>
              <button className="cg-retry" onClick={() => load()}>{t(lang, 'retry')}</button>
            </div>
          ) : groups.length === 0 ? (
            <div className="cg-empty">
              <Users size={30} />
              <span>{t(lang, 'grpEmpty')}</span>
            </div>
          ) : (
            <>
              <div className="cg-grid">
                {groups.map((g, i) => (
                  <button className="cg-card" key={g.id} onClick={() => openGroup(g)} style={{ animationDelay: `${i * 55}ms` }}>
                    <span
                      className="cg-banner"
                      style={{
                        backgroundImage: g.banner_url
                          ? `url('${g.banner_url}')`
                          : `linear-gradient(135deg, hsl(${hueOf(g.name)} 55% 22% / .55), hsl(${(hueOf(g.name) + 50) % 360} 45% 14% / .40))`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <span className="cg-banner-overlay" />
                      <span className="cg-banner-chips">
                        <VisibilityBadge g={g} lang={lang} />
                        {g.is_paid && <span className="cg-chip pay"><Coins size={11} /> {(g.price_xof ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} FCFA</span>}
                        {g.is_pending && <span className="cg-chip pend"><Clock size={11} />{t(lang, 'grpPending')}</span>}
                        {g.status !== 'active' && <span className={`cg-chip stat ${g.status}`}>{g.status === 'archived' ? t(lang, 'grpArchived') : t(lang, 'grpSuspended')}</span>}
                        <button className="cg-chip cg-share-mini" onClick={(e)=>copyGroupLink(g,e)} aria-label={t(lang,'grpShareLink')||'Partager'} title={t(lang,'grpShareLink')||'Copier le lien'}>
                          <Share2 size={11} />
                        </button>
                      </span>
                    </span>
                    <span className="cg-body">
                      <span className="cg-card-name">
                        {g.name}
                        {g.my_role === 'creator' && <Crown size={13} />}
                        {g.my_role === 'admin' && <ShieldCheck size={13} color="#18C27C" />}
                        {g.my_role && <span className={`cg-chip role ${g.my_role}`}>{t(lang, ROLE_LABEL_KEY[g.my_role])}</span>}
                      </span>
                      {g.description && <span className="cg-card-desc">{g.description}</span>}
                      <span className="cg-card-foot">
                        <span className="cg-count">
                          <Users size={13} /> {g.member_count} {g.member_count > 1 ? t(lang, 'grpMembers') : t(lang, 'grpMember')}
                          {g.admins && g.admins.length > 0 && (
                            <span className="cg-count-admin" title={t(lang, 'grpAdmins')}>
                              <ShieldCheck size={12} color="#18C27C" /> {g.admins[0].display_name}
                              {g.admins.length > 1 ? ` +${g.admins.length - 1}` : ''}
                            </span>
                          )}
                        </span>
                        <GroupAction g={g} lang={lang} onMutate={afterMutation} flashMsg={flashMsg} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="cg-more">{total} {t(lang, 'grpTitle').toLowerCase()}</div>
            </>
          )}
        </div>
      )}

      {createOpen && (
        <CreateModal
          lang={lang}
          onClose={() => setCreateOpen(false)}
          onCreated={(g) => {
            setCreateOpen(false)
            flashMsg(t(lang, 'grpCreated'))
            load()
            openGroup(g)
          }}
          showError={setError}
        />
      )}

      <style jsx global>{`
        .cg-root { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }
        .cg-intro { display: flex; flex-direction: column; gap: 4px; padding: 4px 2px 2px; }
        .cg-intro-title {
          display: flex; align-items: center; gap: 8px;
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 17px; font-weight: 700; color: #F8F8FA; letter-spacing: -0.01em;
        }
        .cg-intro-sub { font-size: 13.5px; color: #9AA3B2; line-height: 1.45; }

        .cg-toolbar { display: flex; gap: 10px; align-items: center; }
        .cg-search {
          flex: 1; display: flex; align-items: center; gap: 9px;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 14px; padding: 11px 14px;
        }
        .cg-search input {
          flex: 1; background: none; border: none; outline: none;
          color: #EDEFF2; font-family: inherit; font-size: 14px;
        }
        .cg-search input::placeholder { color: #5C6776; }
        .cg-create-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; border: none; cursor: pointer; border-radius: 14px;
          color: #000; background: #FFFFFF;
          box-shadow: 0 0 22px rgba(255,255,255,0.24), 0 6px 18px rgba(255,255,255,0.15);
          transition: transform 0.14s ease-out, background 0.14s;
        }
        .cg-create-btn:hover { background: #E4E5EA; }
        .cg-create-btn:active { transform: translateY(1.5px) scale(0.96); }

        .cg-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .cg-chip {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: #B9C0CC;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 10px; padding: 7px 11px;
        }
        .cg-chip svg { color: #7C8694; }
        .cg-chip.scope {
          cursor: pointer; border: none; border-radius: 999px;
          padding: 9px 18px; font-family: var(--font-rounded);
          font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.72);
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(6px);
          transition: background 0.18s ease, color 0.18s ease, transform 0.12s ease;
        }
        .cg-chip.scope svg { color: inherit; }
        .cg-chip.scope:hover { background: rgba(255,255,255,0.11); color: #fff; }
        .cg-chip.scope.on {
          background: linear-gradient(135deg, #1ED760, #1DB954);
          color: #04120a; box-shadow: 0 8px 26px -8px rgba(30, 215, 96, 0.55);
        }
        .cg-chip.scope.on:hover { background: linear-gradient(135deg, #2be97a, #1DB954); color: #04120a; }
        .cg-chip.scope:active { transform: scale(0.97); }
        .cg-chip.priv { color: #64b5ff; border-color: rgba(78,150,255,0.28); background: rgba(78,150,255,0.08); }
        .cg-chip.inv { color: #e4e5ea; border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.08); }
        .cg-chip.role { color: #E8B84B; border-color: rgba(232,184,75,0.28); background: rgba(232,184,75,0.08); }
        .cg-chip.role.admin { color: #fff; border-color: rgba(255,255,255,0.32); background: rgba(255,255,255,0.10); }
        .cg-chip.role.creator { color: #E8B84B; border-color: rgba(232,184,75,0.28); background: rgba(232,184,75,0.08); }
        .cg-badge-pro {
          display: inline-flex; align-items: center; gap: 3px;
          color: #E8B84B; border: 1px solid rgba(232,184,75,0.4);
          background: rgba(232,184,75,0.1); border-radius: 999px;
          font-size: 10px; font-weight: 700; padding: 1px 7px; letter-spacing: 0.02em;
        }
        .cg-chip.pend { color: #64b5ff; border-color: rgba(78,150,255,0.32); background: rgba(78,150,255,0.10); }
        .cg-chip.pay { color: #4fe0a0; border-color: rgba(24,194,124,0.32); background: rgba(24,194,124,0.10); }
        .cg-chip.stat.archived { color: #8b94a3; }
        .cg-chip.stat.suspended { color: #ffb45c; border-color: rgba(245,158,11,0.28); background: rgba(245,158,11,0.08); }
        .cg-share-mini { cursor:pointer; margin-left:auto; background: rgba(255,255,255,.10) !important; border-color: rgba(255,255,255,.18) !important; color:#fff !important; padding:5px 8px !important; }
        .cg-share-mini:hover { background: rgba(255,255,255,.18) !important; }
        .cg-share-mini:active { transform: scale(.95); }

        .cg-error {
          font-size: 13.5px; color: #ff9d92; background: rgba(240,68,56,0.10);
          border: 1px solid rgba(240,68,56,0.25); border-radius: 12px;
          padding: 11px 14px; line-height: 1.45;
        }
        .cg-flash {
          font-size: 13.5px; color: #4fe0a0; background: rgba(24,194,124,0.10);
          border: 1px solid rgba(24,194,124,0.28); border-radius: 12px;
          padding: 11px 14px; animation: fadeUp 0.3s ease both;
        }

        .cg-skel { display: flex; flex-direction: column; gap: 14px; }
        .cg-card.sk { pointer-events: none; min-height: 128px; justify-content: space-between; }
        .sk-ch { position: relative; overflow: hidden; border-radius: 8px; background: rgba(255,255,255,0.07); height: 13px; }
        .sk-ch::after { content: ''; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
          animation: chSkShimmer 1.5s ease-in-out infinite; transform: translateX(-100%); }
        @keyframes chSkShimmer { to { transform: translateX(100%); } }
        .cg-sk-last { height: 18px; width: 108px; border-radius: 10px; align-self: flex-end; }

        .cg-off { display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 42px 0 26px; text-align: center; animation: fadeUp 0.35s ease both; }
        .cg-off-t { font-size: 13.5px; font-weight: 500; color: #9AA3B2; line-height: 1.5; max-width: 300px; }
        .cg-retry {
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer; font-family: inherit;
          font-size: 14px; font-weight: 700; color: #000;
          background: #FFFFFF;
          border-radius: 10px; padding: 12px 30px;
          box-shadow: 0 0 22px rgba(255,255,255,0.24), 0 6px 18px rgba(255,255,255,0.15);
          transition: transform 0.14s ease-out, background 0.14s;
        }
        .cg-retry:hover { background: #E4E5EA; }
        .cg-retry:active { transform: translateY(1.5px) scale(0.985); }

        .cg-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 0; color: #6B7A94; font-size: 14px; }

        .cg-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 13px; align-items: stretch;
        }
        .cg-card {
          position: relative; display: flex; flex-direction: column;
          padding: 0; border-radius: 20px; text-align: left; cursor: pointer;
          font-family: inherit; color: #fff;
          overflow: hidden;
          background: linear-gradient(180deg, #15151c, #101016);
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px -28px rgba(0,0,0,0.75);
          animation: chCardIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
          transition: transform 0.18s ease-out, border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .cg-card:hover {
          transform: translateY(-3px); border-color: rgba(255, 255, 255, 0.4);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 36px -16px rgba(255, 255, 255, 0.30);
        }
        @keyframes chCardIn { from { opacity: 0; transform: translateY(12px) scale(0.985); } to { opacity: 1; transform: none; } }
        .cg-card:active { transform: scale(0.982); }
        .cg-banner { position: relative; height: 96px; flex: none; display: block; }
        .cg-banner-overlay {
          position: absolute; inset: 0; display: block;
          background: linear-gradient(180deg, transparent 30%, rgba(16, 16, 22, 0.2) 65%, #101016 100%);
        }
        .cg-banner-chips {
          position: absolute; top: 9px; left: 9px; right: 9px; z-index: 2;
          display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
        }
        .cg-banner-chips .cg-chip {
          padding: 3px 9px; font-size: 11px; border-radius: 999px; font-weight: 700;
          backdrop-filter: blur(4px);
        }
        .cg-body { display: flex; flex-direction: column; gap: 7px; padding: 10px 13px 13px; flex: 1; }
        .cg-card-name {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-size: 14.5px; font-weight: 800;
          letter-spacing: -0.01em; line-height: 1.25;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cg-card-desc {
          font-size: 12.5px; color: #9CA3B0; line-height: 1.45;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .cg-card-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .cg-card .cg-btn.small {
          padding: 6px 12px; font-size: 11.5px; border-radius: 999px;
          font-family: var(--font-rounded); white-space: nowrap;
        }
        .cg-count {
          display: inline-flex; align-items: center; gap: 5px; min-width: 0;
          font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.55);
          background: rgba(255, 255, 255, 0.06); border-radius: 999px; padding: 3px 9px;
        }
        .cg-count svg { color: #5C6776; flex: none; }
        .cg-count-admin {
          display: inline-flex; align-items: center; gap: 4px; max-width: 120px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cg-more { text-align: center; font-size: 12.5px; color: #5C6776; padding: 6px 0 2px; }

        .cg-avatar {
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0; border-radius: 12px; font-weight: 800; letter-spacing: 0.02em;
          color: #fff;
          background:
            radial-gradient(120% 120% at 20% 0%, rgba(255,255,255,0.18), transparent 55%),
            linear-gradient(150deg, #141419, #0C0C10);
          border: 1px solid rgba(255,255,255,0.26);
        }

        .cg-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          border: none; cursor: pointer; font-family: inherit;
          font-size: 13.5px; font-weight: 700; border-radius: 12px; padding: 10px 18px;
          transition: transform 0.13s ease-out, filter 0.13s;
        }
        .cg-btn:active { transform: translateY(1px) scale(0.97); }
        .cg-btn.primary { color: #000; background: #FFFFFF; }
        .cg-btn.primary:hover { background: #E4E5EA; }
        .cg-btn.ghost {
          color: #E3E6EA; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
        }
        .cg-btn.danger { color: #ffb4ac; background: rgba(240,68,56,0.12); border: 1px solid rgba(240,68,56,0.30); }
        .cg-btn.warn { color: #ffd9a0; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.30); }
        .cg-btn.small { padding: 8px 13px; font-size: 12.5px; }

        /* ---- Détail ---- */
        .cg-detail { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; animation: fadeUp 0.3s ease both; }
        .cg-detail-top { display: flex; align-items: center; gap: 12px; }
        .cg-back {
          display: inline-flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 12px; cursor: pointer;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10);
          color: #B9C0CC; transition: transform 0.13s;
        }
        .cg-back:active { transform: scale(0.95); }
        .cg-detail-title {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 22px; font-weight: 800; letter-spacing: -0.02em;
          display: flex; align-items: center; gap: 8px; min-width: 0;
        }
        .cg-detail-cover {
          position: relative; height: 210px; overflow: hidden; border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 30px 70px -30px rgba(0,0,0,0.9);
        }
        .cg-detail-cover-fade {
          position: absolute; inset: 0; z-index: 1;
          background: linear-gradient(180deg, rgba(10,10,13,0) 25%, rgba(10,10,13,0.55) 65%, rgba(10,10,13,0.95) 100%);
        }
        .cg-detail-cover-in {
          position: absolute; left: 18px; right: 18px; bottom: 15px; z-index: 2;
          display: flex; flex-direction: column; gap: 7px;
        }
        .cg-detail-cover-name {
          font-family: var(--font-rounded); font-size: clamp(22px, 5vw, 30px);
          font-weight: 850; color: #fff; letter-spacing: -0.02em; line-height: 1.15;
          text-shadow: 0 4px 22px rgba(0,0,0,0.6);
        }
        .cg-detail-cover-meta {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: var(--font-rounded); font-size: 13px; font-weight: 700;
          color: rgba(255,255,255,0.85); text-shadow: 0 3px 14px rgba(0,0,0,0.55);
        }
        .cg-detail-dot { opacity: 0.5; }
        .cg-detail-desc { font-size: 14px; color: #C3C9D2; line-height: 1.6; }

        .cg-preview { display: flex; flex-direction: column; gap: 14px; }
        .cg-preview-stats {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
        }
        @media (min-width: 920px) {
          .cg-preview-stats { grid-template-columns: repeat(4, 1fr); }
        }
        .cg-preview-stat {
          display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
          padding: 13px 15px; border-radius: 16px;
          background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.08);
        }
        .cg-preview-stat-n {
          font-family: var(--font-rounded); font-size: 18px; font-weight: 850; color: #fff;
          letter-spacing: -0.01em; line-height: 1.15; max-width: 100%;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cg-preview-stat-l {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: rgba(255,255,255,0.42);
        }
        .cg-preview-runby { display: flex; flex-direction: column; gap: 9px; }
        .cg-preview-label {
          font-family: var(--font-rounded); font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.4);
        }
        .cg-preview-admin-list { display: flex; flex-direction: column; gap: 8px; }
        .cg-preview-admin {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: 14px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
        }
        .cg-preview-admin-ava {
          width: 48px; height: 48px; border-radius: 50%; flex: none;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 800; color: #fff; background-color: #232329;
          box-shadow: 0 10px 22px -8px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.14);
        }
        .cg-preview-admin-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; align-items: flex-start; }
        .cg-preview-admin-name {
          display: flex; align-items: center; gap: 5px;
          font-family: var(--font-rounded); font-size: 13.5px; font-weight: 700; color: #fff;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cg-preview-admin-role { font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,0.42); }
        .cg-preview-join {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 9px;
          background: linear-gradient(135deg, #1ED760, #1DB954); color: #04120a;
          border: none; border-radius: 999px; padding: 13px 30px;
          font-family: var(--font-rounded); font-size: 14.5px; font-weight: 850;
          cursor: pointer; box-shadow: 0 12px 34px -10px rgba(30, 215, 96, 0.6);
          transition: transform 0.13s ease, filter 0.15s;
        }
        .cg-preview-join:hover { filter: brightness(1.06); }
        .cg-preview-join:active { transform: translateY(1px) scale(0.98); }
        .cg-preview-join:disabled { opacity: 0.55; cursor: default; }
        .cg-col { display: flex; flex-direction: column; gap: 14px; }
        .cg-box {
          background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px; padding: 16px 16px 14px;
        }
        .cg-box-title {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 14px; font-weight: 700; color: #EDEFF2;
          display: flex; align-items: center; gap: 7px; margin-bottom: 11px;
        }
        .cg-box-title svg { color: #FFFFFF; }
        .cg-rules { font-size: 13.5px; color: #9CA3B0; line-height: 1.55; white-space: pre-wrap; }

        .cg-member-row {
          display: flex; align-items: center; gap: 11px;
          padding: 10px 2px; border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .cg-member-row:last-child { border-bottom: none; }
        .cg-member-avatar {
          display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
          width: 38px; height: 38px; border-radius: 12px; font-size: 13px; font-weight: 800;
          color: #fff; background: linear-gradient(150deg, #23282f, #171a21);
          border: 1px solid rgba(255,255,255,0.10);
        }
        .cg-member-info { flex: 1; min-width: 0; }
        .cg-member-name { font-size: 14px; font-weight: 600; color: #EDEFF2; display: flex; align-items: center; gap: 6px; }
        .cg-member-sub { font-size: 12px; color: #7C8694; }
        .cg-member-actions { display: flex; align-items: center; gap: 6px; }
        .cg-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
          border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.05);
          color: #B9C0CC; transition: transform 0.12s, color 0.15s;
        }
        .cg-icon-btn:active { transform: scale(0.93); }
        .cg-icon-btn.ban { color: #ff9d92; }
        .cg-icon-btn.ok { color: #4fe0a0; }
        .cg-icon-btn.warn { color: #ffb45c; }

        .cg-select {
          background: rgba(255,255,255,0.06); color: #EDEFF2;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 9px;
          font-family: inherit; font-size: 12.5px; padding: 6px 8px; outline: none;
        }
        .cg-select option { background: #14161c; }

        .cg-detail-actions { display: flex; flex-direction: column; gap: 9px; }
        .cg-pending-invite {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: rgba(78,150,255,0.08); border: 1px solid rgba(78,150,255,0.28);
          border-radius: 14px; padding: 13px 15px;
        }
        .cg-pending-invite .txt { font-size: 13.5px; color: #BFD9FF; }
        .cg-actions-row { display: flex; gap: 9px; }

        /* ---- Modale création ---- */
        .cg-modal-backdrop {
          position: fixed; inset: 0; z-index: 70;
          background: rgba(0,0,0,0.72); backdrop-filter: blur(6px);
          display: flex; align-items: flex-end; justify-content: center;
          animation: fadeUp 0.22s ease both;
        }
        .cg-modal {
          width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto;
          background: linear-gradient(168deg, #0D131C 0%, #0A0F16 60%, #090E15 100%);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 20px 20px 0 0; padding: 18px 22px 26px;
          animation: chCardIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .cg-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .cg-modal-title {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 18px; font-weight: 800; letter-spacing: -0.02em;
        }
        .cg-modal-close {
          width: 32px; height: 32px; border-radius: 10px; cursor: pointer;
          border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.06);
          color: #B9C0CC; display: inline-flex; align-items: center; justify-content: center;
        }
        .cg-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 13px; }
        .cg-label { font-size: 12.5px; font-weight: 600; color: #9AA3B2; }
        .cg-input, .cg-textarea {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11);
          border-radius: 12px; padding: 11px 13px; color: #EDEFF2;
          font-family: inherit; font-size: 14px; outline: none;
        }
        .cg-input:focus, .cg-textarea:focus { border-color: rgba(255,255,255,0.55); }
        .cg-textarea { resize: vertical; min-height: 70px; line-height: 1.5; }
        .cg-file {
          width: 100%; font-family: inherit; font-size: 13px; color: #EDEFF2;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11);
          border-radius: 12px; padding: 10px 12px; cursor: pointer;
        }
        .cg-file::file-selector-button {
          margin-right: 12px; border: none; border-radius: 8px; padding: 7px 12px;
          background: rgba(255,255,255,0.1); color: #EDEFF2; cursor: pointer; font-family: inherit; font-size: 12.5px; font-weight: 700;
        }
        .cg-banner-prev {
          margin-top: 10px; border-radius: 14px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1); aspect-ratio: 16 / 7; background: #14161c;
        }
        .cg-banner-prev img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .cg-field-err { font-size: 12.5px; color: #ff9d92; margin-top: 6px; }
        .cg-vis-grid { display: flex; flex-direction: column; gap: 8px; }
        .cg-vis-opt {
          display: flex; align-items: center; gap: 10px; padding: 11px 13px;
          border-radius: 12px; cursor: pointer;
          border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.03);
          transition: border-color 0.15s, background 0.15s;
        }
        .cg-vis-opt.on { border-color: rgba(255,255,255,0.40); background: rgba(255,255,255,0.07); }
        .cg-vis-radio {
          width: 17px; height: 17px; border-radius: 50%; flex-shrink: 0;
          border: 2px solid #4A5568; display: inline-flex; align-items: center; justify-content: center;
        }
        .cg-vis-opt.on .cg-vis-radio { border-color: #FFFFFF; }
        .cg-vis-opt.on .cg-vis-radio::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #FFFFFF; }
        .cg-vis-txt { display: flex; flex-direction: column; gap: 1px; }
        .cg-vis-name { font-size: 14px; font-weight: 600; color: #EDEFF2; }
        .cg-vis-sub { font-size: 12px; color: #7C8694; }

        .cg-invite-list { display: flex; flex-direction: column; max-height: 240px; overflow-y: auto; }
        .cg-invite-row {
          display: flex; align-items: center; gap: 10px; padding: 9px 4px;
          border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;
        }
        .cg-invite-row:active { background: rgba(255,255,255,0.04); }
        .cg-invite-row .pick { margin-left: auto; color: #FFFFFF; }
      `}</style>
    </>
  )
}

function GroupAction({ g, lang, onMutate, flashMsg }) {
  const busy = useRef(false)
  const act = (fn, okMsg) => {
    if (busy.current) return
    busy.current = true
    onMutate(fn).then(r => {
      const d = r && r.data
      if (d && d.requires_payment && d.payment_url) {
        window.open(d.payment_url, '_blank', 'noopener')
        if (okMsg) flashMsg(okMsg)
      } else if (d && d.requested) {
        flashMsg(t(lang, 'grpRequested'))
      } else if (d && d.joined && okMsg) {
        flashMsg(okMsg)
      }
    }).catch(() => {}).finally(() => { busy.current = false })
  }
  if (g.is_invited) {
    return (
      <span className="cg-actions-row">
        <button className="cg-btn primary small" onClick={e => { e.stopPropagation(); act(() => acceptCommunityInvite(g.slug), t(lang, 'grpJoinedNow')) }}>
          <Check size={13} strokeWidth={3} /> {t(lang, 'grpAccept')}
        </button>
        <button className="cg-btn ghost small" onClick={e => { e.stopPropagation(); act(() => declineCommunityInvite(g.slug), '') }}>
          <X size={13} strokeWidth={3} /> {t(lang, 'grpDecline')}
        </button>
      </span>
    )
  }
  if (g.is_pending) {
    return (
      <span className="cg-chip pend">
        <Clock size={12} /> {t(lang, 'grpRequested')}
      </span>
    )
  }
  if (g.is_member) {
    return (
      <button className="cg-btn ghost small" onClick={e => { e.stopPropagation(); act(() => leaveCommunityGroup(g.slug), t(lang, 'grpLeft')) }}>
        {t(lang, 'grpLeave')}
      </button>
    )
  }
  return (
    <button className="cg-btn primary small" onClick={e => { e.stopPropagation(); act(() => joinCommunityGroup(g.slug), '') }}>
      <UserPlus size={13.5} /> {g.is_paid ? `${t(lang, 'grpJoin')} · ${(g.price_xof ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}` : t(lang, 'grpJoin')}
    </button>
  )
}

function GroupDetail({ lang, initial, version, error, setError, flashMsg, onBack, onOpenMembers, onMutate }) {
  const [g, setG] = useState(initial)
  const [members, setMembers] = useState([])
  const [requests, setRequests] = useState([])
  const [invites, setInvites] = useState([])
  const [posts, setPosts] = useState([])
  const [postsTotal, setPostsTotal] = useState(0)
  const [canPost, setCanPost] = useState(false)
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    getCommunityMe().then(r => setMe(r.data.user || null)).catch(() => {})
  }, [])

  const joinThis = () => {
    if (joining) return
    setJoining(true)
    onMutate(() => joinCommunityGroup(g.slug), '')
      .then(r => {
        if (r?.data?.requires_payment && r.data.payment_url) {
          window.open(r.data.payment_url, '_blank', 'noopener')
          flashMsg(t(lang, 'grpPayOpen'))
        } else if (r?.data?.requested) {
          flashMsg(t(lang, 'grpRequested'))
        } else if (r?.data?.joined) {
          flashMsg(t(lang, 'grpJoinedNow'))
        }
      })
      .catch(() => {})
      .finally(() => setJoining(false))
  }

  const load = useCallback(() => {
    setLoading(true)
    getCommunityGroup(g.slug).then(r => setG(prev => ({ ...prev, ...r.data }))).catch(() => {})
    getCommunityGroupMembers(g.slug, { limit: 100 }).then(r => setMembers(r.data.members || [])).catch(() => {})
    if (g.is_admin) {
      getCommunityGroupInvites(g.slug).then(r => setInvites(r.data.invites || [])).catch(() => {})
      getCommunityGroupMembers(g.slug, { limit: 50, status: 'pending' }).then(r => setRequests(r.data.members || [])).catch(() => {})
    }
    if (g.is_member) {
      getCommunityGroupPosts(g.slug, { limit: 20, admin_only: true }).then(r => {
        setPosts(r.data.posts || [])
        setPostsTotal(r.data.total || 0)
        setCanPost(!!r.data.can_post)
      }).catch(() => {})
    }
  }, [g.slug, g.is_admin, g.is_member])

  useEffect(() => { load() }, [load, version])

  const mutate = (fn, thenMsg, thenClose) => onMutate(fn, thenMsg, thenClose)

  const decide = (profileId, approve) => {
    const call = approve ? approveCommunityMemberRequest(g.slug, profileId) : rejectCommunityMemberRequest(g.slug, profileId)
    mutate(call, approve ? t(lang, 'grpApproved') : t(lang, 'grpRejected'))
  }

  const memberActions = (m) => {
    const actions = []
    if (g.is_admin && m.role !== 'creator') {
      actions.push(
        <button key="sus" className="cg-icon-btn warn" title={t(lang, 'grpSuspend')} onClick={() => mutate(() => suspendCommunityMember(g.slug, m.profile_id), '')}>
          <PauseCircle size={15} />
        </button>,
        <button key="ban" className="cg-icon-btn ban" title={t(lang, 'grpBan')} onClick={() => mutate(() => banCommunityMember(g.slug, m.profile_id), '')}>
          <Ban size={15} />
        </button>,
      )
    }
    if (m.status !== 'active' && g.is_admin && m.role !== 'creator') {
      actions.push(
        <button key="res" className="cg-icon-btn ok" title={t(lang, 'grpRestore')} onClick={() => mutate(() => restoreCommunityMember(g.slug, m.profile_id), '')}>
          <RotateCcw size={15} />
        </button>,
      )
    }
    if (g.is_admin && m.role !== 'creator' && m.status === 'active') {
      actions.push(<MemberRoleSelect key="role" g={g} m={m} lang={lang} onChange={(role) => mutate(() => setCommunityMemberRole(g.slug, m.profile_id, role), t(lang, 'grpRoleUpdated'))} />)
    }
    return actions
  }

  return (
    <div className="cg-detail">
      <div className="cg-detail-top">
        <button className="cg-back" onClick={onBack} aria-label={t(lang, 'grpBack')}>
          <ArrowLeft size={17} />
        </button>
        <span className="cg-detail-title">
          {g.name}
          {g.my_role === 'creator' && <Crown size={16} />}
          {g.my_role === 'admin' && <ShieldCheck size={16} color="#18C27C" />}
        </span>
        <button className="cg-back" style={{marginLeft:'auto'}} onClick={async()=>{ const url=typeof window!=='undefined'?`${window.location.origin}/community/group/${g.slug}`:`/community/group/${g.slug}`; try{ if(navigator.clipboard) await navigator.clipboard.writeText(url); else {const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta)} flashMsg(t(lang,'grpLinkCopied')||'Lien copié !')}catch{flashMsg(url)} }} aria-label={t(lang,'grpShareLink')||'Partager'} title={t(lang,'grpShareLink')||'Copier le lien'}>
          <Share2 size={16} />
        </button>
      </div>

      <div
        className="cg-detail-cover"
        style={{
          backgroundImage: g.banner_url
            ? `url('${g.banner_url}')`
            : `linear-gradient(135deg, hsl(${hueOf(g.name)} 55% 24% / .45), hsl(${(hueOf(g.name) + 50) % 360} 45% 12% / .55))`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="cg-detail-cover-fade" />
        <div className="cg-detail-cover-in">
          <span className="cg-detail-cover-name">{g.name}</span>
          <span className="cg-detail-cover-meta">
            <Users size={13} /> {g.member_count} {g.member_count > 1 ? t(lang, 'grpMembers') : t(lang, 'grpMember')}
            <span className="cg-detail-dot">·</span>
            {g.category ? t(lang, `grpCat${g.category[0].toUpperCase()}${g.category.slice(1)}`) : g.category}
          </span>
        </div>
      </div>

      {!g.is_member && !g.is_pending && !g.is_invited && g.status === 'active' && (
        <div className="cg-preview">
          <div className="cg-preview-stats">
            <div className="cg-preview-stat">
              <Users size={16} color="#1ED760" />
              <span className="cg-preview-stat-n">{(g.member_count ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}</span>
              <span className="cg-preview-stat-l">{t(lang, 'grpMembers')}</span>
            </div>
            <div className="cg-preview-stat">
              <MessageCircle size={16} color="#1ED760" />
              <span className="cg-preview-stat-n">{g.posts_count ?? 0}</span>
              <span className="cg-preview-stat-l">{t(lang, 'grpPostsTitle')}</span>
            </div>
            <div className="cg-preview-stat">
              <Tag size={16} color="#1ED760" />
              <span className="cg-preview-stat-n">{g.category ? t(lang, `grpCat${g.category[0].toUpperCase()}${g.category.slice(1)}`) : (g.category || '—')}</span>
              <span className="cg-preview-stat-l">{t(lang, 'grpCategory')}</span>
            </div>
            <div className="cg-preview-stat">
              {g.is_paid && g.price_xof ? <Coins size={16} color="#1ED760" /> : <Lock size={16} color="#1ED760" />}
              <span className="cg-preview-stat-n">
                {g.is_paid && g.price_xof
                  ? `${(g.price_xof).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} FCFA`
                  : t(lang, g.visibility === 'public' ? 'grpVisPublic' : g.visibility === 'private' ? 'grpVisPrivate' : 'grpVisInvite')}
              </span>
              <span className="cg-preview-stat-l">{g.is_paid ? t(lang, 'grpVisibility') : t(lang, 'grpVisibility')}</span>
            </div>
          </div>

          {g.admins && g.admins.length > 0 && (
            <div className="cg-preview-runby">
              <span className="cg-preview-label">{t(lang, 'grpRunBy')}</span>
              <div className="cg-preview-admin-list">
                {g.admins.slice(0, 3).map(m => (
                  <div className="cg-preview-admin" key={`${m.id || m.profile_id}-${m.role}`}>
                    <PhotoAvatar name={m.display_name} avatar={m.avatar} color={m.avatar_color} className="cg-preview-admin-ava" size={48} />
                    <span className="cg-preview-admin-info">
                      <span className="cg-preview-admin-name">
                        {m.display_name}
                        {m.verified && <BadgeCheck size={12} color="#18C27C" />}
                        {m.role === 'creator' && <Crown size={12} color="#E8B84B" />}
                        {m.role === 'admin' && <ShieldCheck size={12} color="#18C27C" />}
                      </span>
                      <span className="cg-preview-admin-role">
                        {m.role === 'creator' ? t(lang, 'grpRoleCreator') : t(lang, 'grpRoleAdmin')}
                        {m.handle ? ` · @${m.handle}` : ''}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="cg-preview-join" onClick={joinThis} disabled={joining}>
            <UserPlus size={17} />
            {g.is_paid && g.price_xof
              ? `${t(lang, 'grpJoin')} · ${(g.price_xof).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} FCFA`
              : t(lang, 'grpJoin')}
          </button>
        </div>
      )}

      {g.description && <div className="cg-detail-desc">{g.description}</div>}
      {error && <div className="cg-error">{error}</div>}

      {g.is_invited && (
        <div className="cg-pending-invite">
          <span className="txt">{t(lang, 'grpStatusInvited')}</span>
          <span className="cg-actions-row">
            <button className="cg-btn primary small" onClick={() => mutate(() => acceptCommunityInvite(g.slug), t(lang, 'grpJoinedNow'))}>
              <Check size={13} strokeWidth={3} /> {t(lang, 'grpAccept')}
            </button>
            <button className="cg-btn ghost small" onClick={() => mutate(() => declineCommunityInvite(g.slug), '')}>
              <X size={13} strokeWidth={3} /> {t(lang, 'grpDecline')}
            </button>
          </span>
        </div>
      )}

      {g.is_pending && (
        <div className="cg-pending-invite">
          <span className="txt"><Clock size={13} /> {t(lang, 'grpRequested')}</span>
        </div>
      )}

      {g.status !== 'active' && (
        <div className="cg-error">{t(lang, 'grpPrivateLocked')}</div>
      )}

      {g.rules && (
        <div className="cg-box">
          <div className="cg-box-title"><Tag size={14} /> {t(lang, 'grpGroupRules')}</div>
          <div className="cg-rules">{g.rules}</div>
        </div>
      )}

      <div className="cg-box">
        <div className="cg-box-title">
          <Users size={14} /> {t(lang, 'grpMembersTitle')} · {g.member_count}
          {onOpenMembers && (
            <button className="cg-btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => onOpenMembers(g.slug)}>
              <Users size={13} /> {t(lang, 'grpViewMembers')}
            </button>
          )}
          {g.is_moderator && (
            <button className="cg-btn ghost small" onClick={() => setInviteOpen(true)}>
              <UserPlus size={13} /> {t(lang, 'grpInviteBtn')}
            </button>
          )}
        </div>
        {loading && members.length === 0 ? (
          <div className="cg-skel"><TriLoader compact /></div>
        ) : (
          members.map(m => (
            <div className="cg-member-row" key={m.profile_id}>
              <span className="cg-member-avatar">{m.display_name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'}</span>
              <span className="cg-member-info">
                <span className="cg-member-name">
                  {m.display_name}
                  {m.handle && <span className="cg-member-sub">@{m.handle}</span>}
                  {m.is_pro && <span className="cg-badge-pro" title={t(lang, 'proBadge')}><BadgeCheck size={12} /> {t(lang, 'proBadge')}</span>}
                  {m.verified && <ShieldCheck size={12} color="#18C27C" />}
                  {m.is_me && <span className="cg-chip role">{t(lang, 'grpJoined')}</span>}
                </span>
                <span className="cg-member-sub">
                  <span className="cg-chip role" style={{ marginTop: 4 }}>
                    {t(lang, ROLE_LABEL_KEY[m.role] || 'grpRoleMember')}
                  </span>
                  {m.status !== 'active' && <span className="cg-chip stat" style={{ marginTop: 4 }}>{t(lang, STATUS_LABEL_KEY[m.status] || 'grpStatusActive')}</span>}
                </span>
              </span>
              <span className="cg-member-actions">{memberActions(m)}</span>
            </div>
          ))
        )}
      </div>

      {g.is_member && (
        <div className="cg-box">
          <div className="cg-box-title">
            <MessageCircle size={14} /> {t(lang, 'grpPostsTitle')} · {postsTotal}
          </div>
          {canPost && <Composer lang={lang} me={me} groupId={g.id} onPublished={load} />}
          {posts.length === 0 ? (
            <div className="cg-empty" style={{ padding: '22px 0' }}>{t(lang, 'grpNoPosts')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {posts.map((p, i) => (
                <PostCard key={p.id} p={p} lang={lang} me={me} delay={i} />
              ))}
            </div>
          )}
        </div>
      )}

      {g.is_admin && requests.length > 0 && (
        <div className="cg-box">
          <div className="cg-box-title"><UserPlus size={14} /> {t(lang, 'grpRequestsTitle')} · {requests.length}</div>
          {requests.map(m => (
            <div className="cg-member-row" key={m.profile_id}>
              <span className="cg-member-avatar">{m.display_name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'}</span>
              <span className="cg-member-info">
                <span className="cg-member-name">{m.display_name} <span className="cg-member-sub">@{m.handle}</span></span>
                <span className="cg-member-sub"><span className="cg-chip pend">{t(lang, 'grpPending')}</span></span>
              </span>
              <span className="cg-member-actions">
                <button className="cg-icon-btn ok" title={t(lang, 'grpApprove')} onClick={() => decide(m.profile_id, true)}>
                  <Check size={15} />
                </button>
                <button className="cg-icon-btn ban" title={t(lang, 'grpDecline')} onClick={() => decide(m.profile_id, false)}>
                  <X size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {g.is_admin && invites.length > 0 && (
        <div className="cg-box">
          <div className="cg-box-title"><UserPlus size={14} /> {t(lang, 'grpInvitesTitle')} · {invites.length}</div>
          {invites.map(inv => (
            <div className="cg-member-row" key={inv.profile_id}>
              <span className="cg-member-avatar">{inv.display_name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'}</span>
              <span className="cg-member-info">
                <span className="cg-member-name">{inv.display_name} <span className="cg-member-sub">@{inv.handle}</span></span>
                <span className="cg-member-sub"><span className="cg-chip pend">{t(lang, 'grpStatusInvited')}</span></span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="cg-detail-actions">
        {g.is_member && g.my_role !== 'creator' && (
          <button className="cg-btn danger" onClick={() => mutate(() => leaveCommunityGroup(g.slug), t(lang, 'grpLeft'), true)}>
            {t(lang, 'grpLeave')}
          </button>
        )}
        {g.is_admin && (
          <button className="cg-btn warn" onClick={() => mutate(() => archiveCommunityGroup(g.slug), t(lang, 'grpArchivedDone'), true)}>
            {t(lang, 'grpArchivedDone')}…
          </button>
        )}
      </div>

      {inviteOpen && (
        <InviteModal
          lang={lang}
          g={g}
          onClose={() => setInviteOpen(false)}
          onInvited={() => { setInviteOpen(false); flashMsg(t(lang, 'grpInviteSent')) }}
          onError={setError}
          creating={creatingInvite}
          setCreating={setCreatingInvite}
        />
      )}
    </div>
  )
}

function MemberRoleSelect({ g, m, lang, onChange }) {
  const val = m.role || 'member'
  return (
    <select
      className="cg-select"
      value={val}
      onChange={e => { if (e.target.value !== val) onChange(e.target.value) }}
      aria-label={t(lang, 'grpRoleMember')}
    >
      <option value="member">{t(lang, 'grpRoleMember')}</option>
      <option value="moderator">{t(lang, 'grpRoleModerator')}</option>
      {g.my_role === 'creator' && <option value="admin">{t(lang, 'grpRoleAdmin')}</option>}
    </select>
  )
}

function CreateModal({ lang, onClose, onCreated, showError }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [visibility, setVisibility] = useState('public')
  const [rules, setRules] = useState('')
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState('')
  const [bannerErr, setBannerErr] = useState('')
  const [busy, setBusy] = useState(false)

  const onPickBanner = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setBannerErr(t(lang, 'grpCoverRequired'))
      setBannerFile(null)
      setBannerPreview('')
      return
    }
    setBannerErr('')
    setBannerFile(f)
    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
    setBannerPreview(URL.createObjectURL(f))
  }

  const submit = () => {
    if (name.trim().length < 3 || busy) return
    if (!bannerFile) {
      setBannerErr(t(lang, 'grpCoverRequired'))
      return
    }
    setBusy(true)
    showError('')
    const fd = new FormData()
    fd.append('name', name.trim())
    fd.append('description', description.trim())
    fd.append('category', category)
    fd.append('visibility', visibility)
    fd.append('rules', rules.trim())
    fd.append('banner', bannerFile)
    createCommunityGroup(fd)
      .then(r => onCreated(r.data))
      .catch(e => showError(e?.response?.data?.detail || t(lang, 'grpErrorGeneric')))
      .finally(() => setBusy(false))
  }

  return (
    <div className="cg-modal-backdrop" onClick={onClose}>
      <div className="cg-modal" onClick={e => e.stopPropagation()}>
        <div className="cg-modal-head">
          <span className="cg-modal-title">{t(lang, 'grpCreateTitle')}</span>
          <button className="cg-modal-close" onClick={onClose} aria-label={t(lang, 'grpBack')}>
            <X size={16} />
          </button>
        </div>

        <div className="cg-field">
          <label className="cg-label">{t(lang, 'grpName')}</label>
          <input className="cg-input" value={name} onChange={e => setName(e.target.value)} placeholder={t(lang, 'grpNamePh')} maxLength={120} />
        </div>

        <div className="cg-field">
          <label className="cg-label">{t(lang, 'grpDesc')}</label>
          <textarea className="cg-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder={t(lang, 'grpDescPh')} maxLength={2000} />
        </div>

        <div className="cg-field">
          <label className="cg-label">{t(lang, 'grpCategory')}</label>
          <div className="cg-chips">
            {CATEGORIES.map(c => (
              <button
                key={c}
                className={`cg-chip cat${category === c ? ' on' : ''}`}
                onClick={() => setCategory(c)}
                type="button"
              >
                <Tag size={12.5} /> {t(lang, `grpCat${c[0].toUpperCase()}${c.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label">{t(lang, 'grpVisibility')}</label>
          <div className="cg-vis-grid">
            {VISIBILITIES.map(v => (
              <div key={v} className={`cg-vis-opt${visibility === v ? ' on' : ''}`} onClick={() => setVisibility(v)} role="button">
                <span className="cg-vis-radio" />
                <span className="cg-vis-txt">
                  <span className="cg-vis-name">{t(lang, `grpVis${v[0].toUpperCase()}${v.slice(1).replace('_', '')}`)}</span>
                  <span className="cg-vis-sub">{t(lang, `grpVis${v[0].toUpperCase()}${v.slice(1).replace('_', '')}Sub`)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label">{t(lang, 'grpRules')}</label>
          <textarea className="cg-textarea" value={rules} onChange={e => setRules(e.target.value)} placeholder={t(lang, 'grpRulesPh')} maxLength={4000} />
        </div>

        <div className="cg-field">
          <label className="cg-label">{t(lang, 'grpCover')} *</label>
          <input type="file" accept="image/*" onChange={onPickBanner} className="cg-file" />
          {bannerPreview && (
            <div className="cg-banner-prev">
              <img src={bannerPreview} alt="" />
            </div>
          )}
          {bannerErr && <div className="cg-field-err">{bannerErr}</div>}
        </div>

        <button className="cg-btn primary" style={{ width: '100%' }} onClick={submit} disabled={busy || name.trim().length < 3 || !bannerFile}>
          {busy ? '…' : <><Plus size={15} strokeWidth={2.8} /> {t(lang, 'grpCreateBtn')}</>}
        </button>
      </div>
    </div>
  )
}

function InviteModal({ lang, g, onClose, onInvited, onError, creating, setCreating }) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState([])
  const [searched, setSearched] = useState(false)
  const debounce = useRef(null)

  const searchUsers = (q) => {
    setQuery(q)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      getCommunityUsers(q, 12)
        .then(r => { setUsers(r.data.users || []); setSearched(true) })
        .catch(() => { setUsers([]); setSearched(true) })
    }, 300)
  }

  const invite = (profileId) => {
    if (creating) return
    setCreating(true)
    onError('')
    inviteCommunityMember(g.slug, profileId)
      .then(onInvited)
      .catch(e => onError(e?.response?.data?.detail || t(lang, 'grpErrorGeneric')))
      .finally(() => setCreating(false))
  }

  return (
    <div className="cg-modal-backdrop" onClick={onClose}>
      <div className="cg-modal" onClick={e => e.stopPropagation()}>
        <div className="cg-modal-head">
          <span className="cg-modal-title">{t(lang, 'grpInviteTitle')}</span>
          <button className="cg-modal-close" onClick={onClose} aria-label={t(lang, 'grpBack')}>
            <X size={16} />
          </button>
        </div>

        <div className="cg-field">
          <label className="cg-label">{t(lang, 'grpInvitePh')}</label>
          <div className="cg-search">
            <Search size={15} color="#5C6776" />
            <input value={query} onChange={e => searchUsers(e.target.value)} placeholder={t(lang, 'grpInvitePh')} autoFocus />
          </div>
        </div>

        <div className="cg-invite-list">
          {users.map(u => (
            <div key={u.id} className="cg-invite-row" onClick={() => invite(u.id)}>
              <span className="cg-member-avatar" style={{ width: 32, height: 32, fontSize: 11 }}>
                {u.display_name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'}
              </span>
              <span className="cg-member-info">
                <span className="cg-member-name">{u.display_name}</span>
                <span className="cg-member-sub">@{u.handle} · {u.followers_count} {t(lang, 'grpMembers')}</span>
              </span>
              <UserPlus size={15} className="pick" />
            </div>
          ))}
          {searched && users.length === 0 && (
            <div className="cg-empty" style={{ padding: '24px 0' }}>{t(lang, 'grpEmpty')}</div>
          )}
        </div>
      </div>
    </div>
  )
}