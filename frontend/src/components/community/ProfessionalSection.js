import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Search, BadgeCheck, ShieldCheck, Check, X, Award, Briefcase, Send, Clock, AlertTriangle, UserPlus, UserCheck,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  getProfessionalDirectory, applyProfessional, getMyProfessional,
  getProfessionalReviews, approveProfessional, rejectProfessional, getCommunityMe,
  followCommunityUser,
} from '../../services/api'
import TriLoader from '../TriLoader'
import { PhotoAvatar } from '../../lib/photo'

const CATS = ['analyst', 'fund_manager', 'broker', 'advisor', 'economist', 'journalist', 'accountant', 'other']
const CAT_KEY = {
  analyst: 'proCatAnalyst', fund_manager: 'proCatFundManager', broker: 'proCatBroker',
  advisor: 'proCatAdvisor', economist: 'proCatEconomist', journalist: 'proCatJournalist',
  accountant: 'proCatAccountant', other: 'proCatOther',
}
const STATUS_CHIP = { pending: 'proPending', approved: 'proApproved', rejected: 'proRejected' }

function ProBadge({ size = 12 }) {
  return <span className="ps-badge-pro"><BadgeCheck size={size} /> Pro</span>
}

function Avatar({ name, handle, size = 54 }) {
  return <PhotoAvatar seed={`pro-${handle || name}`} name={name} className="ps-avatar" size={size} />
}

export default function ProfessionalSection({ lang }) {
  const [tab, setTab] = useState('directory')
  const [authed, setAuthed] = useState(false)
  const [staff, setStaff] = useState(false)

  const [pros, setPros] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadingDir, setLoadingDir] = useState(true)

  const [me, setMe] = useState(null)
  const [form, setForm] = useState({ category: '', title: '', company: '', license: '', website: '', bio_pro: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [reviews, setReviews] = useState([])
  const [reviewTotal, setReviewTotal] = useState(0)
  const [rejectFor, setRejectFor] = useState(null)
  const [note, setNote] = useState('')
  const [workingId, setWorkingId] = useState(null)
  const [followState, setFollowState] = useState({})
  const [followBusy, setFollowBusy] = useState(null)

  const router = useRouter()

  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const mounted = useRef(true)
  const debounce = useRef(null)

  const flashMsg = (msgKey) => {
    setFlash(t(lang, msgKey))
    setTimeout(() => { if (mounted.current) setFlash('') }, 2600)
  }

  const loadMe = useCallback(() => {
    getMyProfessional()
      .then(r => {
        if (!mounted.current) return
        setAuthed(true)
        setMe(r.data.pro || null)
      })
      .catch(e => {
        if (!mounted.current) return
        if (e?.response?.status === 401) { setAuthed(false); setMe(null); return }
        setAuthed(true)
        setMe(null)
      })
  }, [])

  const loadDir = useCallback((cat = category, q = search) => {
    setLoadingDir(true)
    setLoadFailed(false)
    getProfessionalDirectory({ search: q, category: cat, limit: 50 })
      .then(r => {
        if (!mounted.current) return
        setPros(r.data.professionals || [])
        setTotal(r.data.total || 0)
      })
      .catch(() => { if (mounted.current) setLoadFailed(true) })
      .finally(() => { if (mounted.current) setLoadingDir(false) })
  }, [category, search])

  const loadReviews = useCallback(() => {
    getProfessionalReviews().then(r => {
      if (!mounted.current) return
      setReviews(r.data.reviews || [])
      setReviewTotal(r.data.total || 0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    mounted.current = true
    loadMe()
    loadDir()
    getCommunityMe()
      .then(r => { if (mounted.current) setStaff(!!r.data.user?.staff) })
      .catch(() => {})
    return () => { mounted.current = false }
  }, [loadMe, loadDir])

  const onSearch = (q) => {
    setSearch(q)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => loadDir(category, q), 400)
  }

  const apply = () => {
    if (!form.category || !form.title.trim()) {
      setError(t(lang, 'proErrorInvalidCat'))
      return
    }
    setSubmitting(true)
    setError('')
    applyProfessional({
      category: form.category, title: form.title.trim(), company: form.company.trim(),
      license: form.license.trim(), website: form.website.trim(), bio_pro: form.bio_pro.trim(),
    })
      .then(() => {
        setFormOpen(false)
        flashMsg('proApplied')
        loadMe()
      })
      .catch(e => {
        const s = e?.response?.status
        setError(s === 409 ? t(lang, 'proErrorExists') : s === 422 ? t(lang, 'proErrorInvalidCat') : t(lang, 'proErrorGeneric'))
      })
      .finally(() => { if (mounted.current) setSubmitting(false) })
  }

  const openReapply = () => {
    setForm(me ? {
      category: me.category || '', title: me.title || '', company: me.company || '',
      license: me.license || '', website: me.website || '', bio_pro: me.bio_pro || '',
    } : { category: '', title: '', company: '', license: '', website: '', bio_pro: '' })
    setError('')
    setFormOpen(true)
  }

  const doApprove = (profileId) => {
    setWorkingId(profileId)
    setError('')
    approveProfessional(profileId)
      .then(() => { flashMsg('proApprovedDone'); loadReviews(); loadMe() })
      .catch(e => setError(e?.response?.data?.detail || t(lang, 'proErrorGeneric')))
      .finally(() => { if (mounted.current) setWorkingId(null) })
  }

  const doReject = () => {
    if (!note.trim()) return
    setWorkingId(rejectFor)
    setError('')
    rejectProfessional(rejectFor, note.trim())
      .then(() => { setRejectFor(null); setNote(''); flashMsg('proRejectedDone'); loadReviews(); loadMe() })
      .catch(e => setError(e?.response?.data?.detail || t(lang, 'proErrorGeneric')))
      .finally(() => { if (mounted.current) setWorkingId(null) })
  }

  const goTab = (tabName) => {
    setError('')
    setTab(tabName)
    if (tabName === 'reviews' && staff) loadReviews()
  }

  const openProfile = (profileId) => router.push(`/community/user/${profileId}`)

  const toggleFollow = (e, p) => {
    e.stopPropagation()
    if (!authed) { router.push('/login'); return }
    if (followBusy === p.profile_id) return
    const next = !(followState[p.profile_id] ?? p.is_following)
    setFollowState(s => ({ ...s, [p.profile_id]: next }))
    setFollowBusy(p.profile_id)
    followCommunityUser(p.profile_id)
      .catch(() => setFollowState(s => ({ ...s, [p.profile_id]: !next })))
      .finally(() => setFollowBusy(null))
  }

  return (
    <div className="ps-root">
      <nav className="ps-tabs">
        <button className={`ps-tab${tab === 'directory' ? ' on' : ''}`} onClick={() => goTab('directory')}>
          <Search size={13.5} /> {t(lang, 'proTabDirectory')}
        </button>
        {authed && (
          <button className={`ps-tab${tab === 'me' ? ' on' : ''}`} onClick={() => goTab('me')}>
            <BadgeCheck size={13.5} /> {t(lang, 'proTabMe')}
          </button>
        )}
        {staff && (
          <button className={`ps-tab${tab === 'reviews' ? ' on' : ''}`} onClick={() => goTab('reviews')}>
            <ShieldCheck size={13.5} /> {t(lang, 'proTabReviews')}
          </button>
        )}
      </nav>

      {flash && <div className="ps-flash">{flash}</div>}
      {error && <div className="ps-error"><AlertTriangle size={13} /> {error}</div>}

      {tab === 'directory' && (
        <>
          <div className="ps-filters">
            <div className="ps-search">
              <Search size={14} />
              <input
                value={search}
                onChange={e => onSearch(e.target.value)}
                placeholder={t(lang, 'proSearch')}
              />
            </div>
            <select className="ps-select" value={category} onChange={e => { setCategory(e.target.value); loadDir(e.target.value, search) }}>
              <option value="">{t(lang, 'proAllCategories')}</option>
              {CATS.map(c => <option key={c} value={c}>{t(lang, CAT_KEY[c])}</option>)}
            </select>
          </div>

          {loadingDir ? (
            <div className="ps-skel"><TriLoader compact label={t(lang, 'loading')} /></div>
          ) : loadFailed ? (
            <div className="ps-empty">{t(lang, 'proErrorGeneric')}</div>
          ) : pros.length === 0 ? (
            <div className="ps-empty">{t(lang, 'proEmpty')}</div>
          ) : (
            <>
              <div className="ps-grid">
                {pros.map(p => (
                  <div className="ps-card" key={p.profile_id} onClick={() => openProfile(p.profile_id)}>
                    <div
                      className="ps-card-cover"
                      style={{
                        backgroundImage: `radial-gradient(120px 70px at 20% 0%, rgba(255,255,255,.10), transparent 70%), radial-gradient(120px 70px at 85% 90%, rgba(255,255,255,.06), transparent 70%), linear-gradient(rgba(8,8,11,.28), rgba(8,8,11,.42)), url('${coverPhoto(`pro-${p.handle || p.profile_id}`)}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <span className="ps-cover-ring">
                        <Avatar name={p.display_name} handle={p.handle} />
                      </span>
                      {p.verified && <span className="ps-verif"><ShieldCheck size={14} color="#18C27C" /></span>}
                      <ProBadge />
                    </div>
                    <div className="ps-card-body">
                      <div className="ps-card-name">
                        {p.display_name}
                        {p.verified && <ShieldCheck size={12} color="#18C27C" />}
                      </div>
                      <div className="ps-card-sub">@{p.handle}</div>
                      <div className="ps-card-title">{p.pro?.title || t(lang, 'proCat' + (p.pro?.category ? '' : 'Other'))}</div>
                      {p.pro?.company && (
                        <div className="ps-card-meta">
                          <Briefcase size={11} /> {p.pro.company}
                        </div>
                      )}
                      {p.pro?.category && <span className="ps-chip">{t(lang, CAT_KEY[p.pro.category] || 'proCatOther')}</span>}
                      {p.pro?.bio_pro && <div className="ps-card-bio">{p.pro.bio_pro}</div>}
                      <button
                        className={`ps-follow ${followState[p.profile_id] ?? p.is_following ? 'on' : ''}`}
                        onClick={(e) => toggleFollow(e, p)}
                        disabled={followBusy === p.profile_id}
                      >
                        {followState[p.profile_id] ?? p.is_following
                          ? <><UserCheck size={12} /> {t(lang, 'cFollowing')}</>
                          : <><UserPlus size={12} /> {t(lang, 'cFollow')}</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ps-count">{total} professionnel{total > 1 ? 's' : ''}</div>
            </>
          )}
        </>
      )}

      {tab === 'me' && (
        <div className="ps-box">
          {authed && me === null && !formOpen && (
            <div className="ps-me-empty">
              <Award size={26} className="ps-me-icon" />
              <div className="ps-me-title">{t(lang, 'proNoProfile')}</div>
              <div className="ps-me-sub">{t(lang, 'proApplyDesc')}</div>
              <button className="ps-btn primary" onClick={openReapply}>
                <Send size={13.5} /> {t(lang, 'proApplyTitle')}
              </button>
            </div>
          )}

          {authed && me !== null && (
            <div className="ps-me-card">
              <div className={`ps-status ${me.status}`}>
                {me.status === 'approved' && <BadgeCheck size={16} />}
                {me.status === 'pending' && <Clock size={16} />}
                {me.status === 'rejected' && <X size={16} />}
                <span>{t(lang, STATUS_CHIP[me.status] || 'proPending')}</span>
                {me.status === 'approved' && <ProBadge size={13} />}
              </div>
              <div className="ps-me-fields">
                <div><span className="ps-k">{t(lang, 'proCategory')}</span><span>{t(lang, CAT_KEY[me.category] || 'proCatOther')}</span></div>
                <div><span className="ps-k">{t(lang, 'proTitleField')}</span><span>{me.title || '-'}</span></div>
                {me.company && <div><span className="ps-k">{t(lang, 'proCompany')}</span><span>{me.company}</span></div>}
                {me.license && <div><span className="ps-k">{t(lang, 'proLicense')}</span><span>{me.license}</span></div>}
                {me.website && <div><span className="ps-k">{t(lang, 'proWebsite')}</span><span className="ps-link">{me.website}</span></div>}
                {me.bio_pro && <div className="ps-bio-row"><span className="ps-k">{t(lang, 'proBioPro')}</span><span>{me.bio_pro}</span></div>}
              </div>
              {me.status === 'rejected' && (
                <div className="ps-reject-note">
                  <span className="ps-k">{t(lang, 'proReviewNote')} :</span> {me.review_note || '-'}
                </div>
              )}
              {me.status === 'rejected' && (
                <button className="ps-btn primary" style={{ marginTop: 12 }} onClick={openReapply}>
                  <Send size={13.5} /> {t(lang, 'proReapply')}
                </button>
              )}
            </div>
          )}

          {formOpen && (
            <div className="ps-form">
              <div className="ps-form-title">{t(lang, 'proApplyTitle')}</div>
              <div className="ps-form-sub">{t(lang, 'proApplyDesc')}</div>
              <label className="ps-lbl">{t(lang, 'proCategory')} *</label>
              <select className="ps-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">—</option>
                {CATS.map(c => <option key={c} value={c}>{t(lang, CAT_KEY[c])}</option>)}
              </select>
              <label className="ps-lbl">{t(lang, 'proTitleField')} *</label>
              <input className="ps-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <label className="ps-lbl">{t(lang, 'proCompany')}</label>
              <input className="ps-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
              <label className="ps-lbl">{t(lang, 'proLicense')}</label>
              <input className="ps-input" value={form.license} onChange={e => setForm({ ...form, license: e.target.value })} />
              <label className="ps-lbl">{t(lang, 'proWebsite')}</label>
              <input className="ps-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://…" />
              <label className="ps-lbl">{t(lang, 'proBioPro')}</label>
              <textarea className="ps-input" rows={3} value={form.bio_pro} onChange={e => setForm({ ...form, bio_pro: e.target.value })} />
              <div className="ps-form-actions">
                <button className="ps-btn ghost" onClick={() => setFormOpen(false)}>{t(lang, 'proCancel')}</button>
                <button className="ps-btn primary" onClick={apply} disabled={submitting}>
                  {submitting ? t(lang, 'proApplying') : t(lang, 'proSubmit')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'reviews' && staff && (
        <div className="ps-box">
          <div className="ps-rev-title"><ShieldCheck size={14} /> {t(lang, 'proReviewsPending')} · {reviewTotal}</div>
          {reviews.length === 0 ? (
            <div className="ps-empty">{t(lang, 'proNoReviews')}</div>
          ) : (
            reviews.map(r => (
              <div className="ps-rev-row" key={r.profile_id}>
                <Avatar name={r.display_name} size={40} />
                <div className="ps-rev-body">
                  <div className="ps-card-name">{r.display_name}</div>
                  <div className="ps-card-sub">@{r.handle} · {t(lang, CAT_KEY[r.pro?.category] || 'proCatOther')}</div>
                  {r.pro?.title && <div className="ps-card-title">{r.pro.title}{r.pro.company ? ` — ${r.pro.company}` : ''}</div>}
                  {r.pro?.license && <div className="ps-card-meta">{t(lang, 'proLicense')}: {r.pro.license}</div>}
                  {r.pro?.bio_pro && <div className="ps-card-bio">{r.pro.bio_pro}</div>}
                </div>
                <div className="ps-rev-actions">
                  <button className="ps-btn ok" disabled={workingId === r.profile_id} onClick={() => doApprove(r.profile_id)}>
                    <Check size={13} /> {t(lang, 'proApprove')}
                  </button>
                  <button className="ps-btn danger" disabled={workingId === r.profile_id} onClick={() => { setRejectFor(r.profile_id); setNote(''); setError('') }}>
                    <X size={13} /> {t(lang, 'proReject')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {rejectFor !== null && (
        <div className="ps-modal">
          <div className="ps-modal-box">
            <div className="ps-form-title">{t(lang, 'proConfirmReject')}</div>
            <textarea
              className="ps-input"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t(lang, 'proNotePlaceholder')}
            />
            <div className="ps-form-actions">
              <button className="ps-btn ghost" onClick={() => setRejectFor(null)}>{t(lang, 'proCancel')}</button>
              <button className="ps-btn danger" disabled={!note.trim()} onClick={doReject}>
                {t(lang, 'proReject')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .ps-root { display: flex; flex-direction: column; gap: 14px; }

        /* --- Onglets : navigation discrète type Spotify --- */
        .ps-tabs { display: flex; gap: 4px; border-bottom: 1px solid rgba(255, 255, 255, .07); padding: 0 0 10px; }
        .ps-tab {
          display: inline-flex; align-items: center; gap: 6px;
          background: none; border: none; border-radius: 999px;
          color: rgba(255, 255, 255, .45); padding: 8px 13px;
          font-family: var(--font-rounded); font-size: 13px; font-weight: 700;
          cursor: pointer; transition: all .15s;
        }
        .ps-tab:hover { color: rgba(255, 255, 255, .85); background: rgba(255, 255, 255, .05); }
        .ps-tab.on { color: #fff; background: rgba(255, 255, 255, .09); }
        .ps-tab.on svg { color: #18C27C; }

        /* --- Notifications --- */
        .ps-flash {
          border: 1px solid rgba(24, 194, 124, .35); background: rgba(24, 194, 124, .08);
          color: #4fe0a0; border-radius: 999px; padding: 9px 14px; font-size: 12.5px; font-weight: 600;
          font-family: var(--font-rounded);
        }
        .ps-error {
          display: flex; align-items: center; gap: 6px;
          border: 1px solid rgba(225, 29, 72, .35); background: rgba(225, 29, 72, .08);
          color: #ff8a8a; border-radius: 999px; padding: 9px 14px; font-size: 12.5px; font-weight: 600;
          font-family: var(--font-rounded);
        }

        /* --- Filtres : recherche verre + select monochrome --- */
        .ps-filters { display: flex; flex-direction: column; gap: 10px; }
        @media (min-width: 640px) { .ps-filters { flex-direction: row; align-items: center; } }
        .ps-search {
          flex: 1; display: flex; align-items: center; gap: 9px;
          background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 999px; padding: 10px 16px; color: rgba(255, 255, 255, .4);
          transition: border-color .15s, box-shadow .15s;
        }
        .ps-search:focus-within { border-color: rgba(255, 255, 255, .3); box-shadow: 0 0 0 3px rgba(255, 255, 255, .08); }
        .ps-search input {
          flex: 1; background: transparent; border: none; outline: none;
          color: #fff; font-size: 13.5px; font-family: inherit;
        }
        .ps-search input::placeholder { color: rgba(255, 255, 255, .32); }
        .ps-select {
          background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1); color: #fff;
          border-radius: 999px; padding: 10px 16px; font-size: 13px; font-family: inherit; outline: none;
        }
        .ps-select option { background: #14141a; }

        /* --- Grille de tuiles type Spotify --- */
        .ps-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (min-width: 900px) { .ps-grid { grid-template-columns: repeat(auto-fill, minmax(225px, 1fr)); } }
        .ps-card {
          cursor: pointer;
          display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
          background: rgba(12, 12, 15, .66);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 18px; padding: 12px; position: relative;
          box-shadow: 0 20px 50px -24px rgba(0, 0, 0, .85), inset 0 1px 0 rgba(255, 255, 255, .05);
          transition: transform .22s cubic-bezier(.22,.8,.24,1), border-color .22s, box-shadow .22s;
        }
        .ps-card:hover {
          transform: translateY(-2px); border-color: rgba(255, 255, 255, .18);
          box-shadow: 0 26px 60px -26px rgba(0, 0, 0, .9), inset 0 1px 0 rgba(255, 255, 255, .06);
        }
        .ps-card-cover {
          position: relative; width: 100%; height: 84px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 14px; overflow: visible; margin-bottom: 4px;
          background:
            radial-gradient(120px 70px at 20% 0%, rgba(255, 255, 255, .07), transparent 70%),
            radial-gradient(120px 70px at 85% 90%, rgba(255, 255, 255, .04), transparent 70%),
            rgba(255, 255, 255, .03);
          border: 1px solid rgba(255, 255, 255, .07);
        }
        .ps-cover-ring {
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%; padding: 3px;
          background: rgba(255, 255, 255, .1);
        }
        .ps-avatar {
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #2b2b31, #17171b);
          color: rgba(255, 255, 255, .92); border-radius: 50%; font-weight: 800; flex-shrink: 0;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12);
        }
        .ps-verif {
          position: absolute; right: 44px; bottom: 6px;
          display: flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 50%;
          background: #101014; border: 1px solid rgba(255, 255, 255, .18);
        }
        .ps-badge-pro {
          position: absolute; top: 8px; right: 8px;
          display: inline-flex; align-items: center; gap: 3px;
          color: rgba(255, 255, 255, .62); font-size: 10px; font-weight: 800; letter-spacing: .03em;
          background: rgba(10, 10, 13, .7); border: 1px solid rgba(255, 255, 255, .16);
          border-radius: 999px; padding: 3px 8px; backdrop-filter: blur(8px);
        }
        .ps-card-body { flex: 1; min-width: 0; width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
        .ps-card-name {
          display: flex; align-items: center; gap: 5px;
          font-family: var(--font-rounded); font-weight: 800; font-size: 13.5px; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
        }
        .ps-card-name svg { flex: none; }
        .ps-card-sub { color: rgba(255, 255, 255, .4); font-size: 11.5px; font-weight: 500; }
        .ps-card-title { color: rgba(255, 255, 255, .85); font-size: 12.5px; font-weight: 700; margin-top: 3px; }
        .ps-card-meta {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          color: rgba(255, 255, 255, .5); font-size: 11.5px; font-weight: 500; margin-top: 3px;
        }
        .ps-chip {
          margin-top: 4px;
          background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1);
          color: rgba(255, 255, 255, .6); border-radius: 999px; padding: 2px 9px;
          font-size: 10.5px; font-weight: 700;
        }
        .ps-card-bio {
          color: rgba(255, 255, 255, .48); font-size: 12px; line-height: 1.5; margin-top: 5px;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .ps-count { color: rgba(255, 255, 255, .35); font-size: 11.5px; font-weight: 600; text-align: center; padding: 4px 0 8px; }

        /* --- Bouton Suivre sur la tuile pro --- */
        .ps-follow {
          margin-top: 8px; align-self: flex-start;
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 999px; padding: 7px 15px; font-size: 12px; font-weight: 800;
          font-family: var(--font-rounded); cursor: pointer; border: 1px solid transparent; transition: all .15s;
          background: #fff; color: #0c0c0f;
        }
        .ps-follow.on { background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .85); border-color: rgba(255, 255, 255, .18); }
        .ps-follow:hover:not(:disabled) { opacity: .9; }
        .ps-follow:disabled { opacity: .5; cursor: default; }

        .ps-skel { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (min-width: 900px) { .ps-skel { grid-template-columns: repeat(auto-fill, minmax(225px, 1fr)); } }
        .ps-skel .ps-card { height: 168px; }
        .ps-sk-av { width: 54px; height: 54px; border-radius: 50%; margin-bottom: 10px; }
        .ps-sk-line { height: 12px; border-radius: 999px; }

        .ps-empty {
          border: 1px dashed rgba(255, 255, 255, .14); border-radius: 18px;
          padding: 30px 16px; text-align: center; color: rgba(255, 255, 255, .42);
          font-size: 13px; font-family: var(--font-rounded);
        }

        /* --- Panneaux (Mon espace / formulaire) : verre sombre --- */
        .ps-box { display: flex; flex-direction: column; gap: 12px; }
        .ps-me-empty {
          display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
          background: rgba(12, 12, 15, .66); border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 22px; padding: 34px 18px;
        }
        .ps-me-icon { color: rgba(255, 255, 255, .55); }
        .ps-me-title { font-family: var(--font-rounded); font-weight: 800; font-size: 15.5px; }
        .ps-me-sub { color: rgba(255, 255, 255, .45); font-size: 12.5px; max-width: 260px; }
        .ps-me-card, .ps-form {
          background: rgba(12, 12, 15, .66); border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 20px; padding: 16px;
          box-shadow: 0 20px 50px -24px rgba(0, 0, 0, .85), inset 0 1px 0 rgba(255, 255, 255, .05);
          display: flex; flex-direction: column; gap: 10px;
        }
        .ps-status {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 999px; padding: 6px 13px; font-size: 12px; font-weight: 700; align-self: flex-start;
          font-family: var(--font-rounded);
        }
        .ps-status.approved { color: #4fe0a0; background: rgba(24, 194, 124, .1); border: 1px solid rgba(24, 194, 124, .3); }
        .ps-status.pending { color: #E8B84B; background: rgba(232, 184, 75, .1); border: 1px solid rgba(232, 184, 75, .3); }
        .ps-status.rejected { color: #ff8a8a; background: rgba(225, 29, 72, .1); border: 1px solid rgba(225, 29, 72, .3); }
        .ps-me-fields { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
        .ps-me-fields > div { display: flex; align-items: baseline; gap: 8px; }
        .ps-me-fields > div > span:last-child { color: rgba(255, 255, 255, .85); }
        .ps-k { color: rgba(255, 255, 255, .38); font-size: 11.5px; font-weight: 600; min-width: 92px; flex-shrink: 0; }
        .ps-bio-row { align-items: flex-start !important; }
        .ps-link { color: #c9cdd4; word-break: break-all; }
        .ps-reject-note {
          border: 1px solid rgba(225, 29, 72, .3); background: rgba(225, 29, 72, .07);
          border-radius: 14px; padding: 10px 13px; font-size: 12.5px; color: rgba(255, 255, 255, .75);
        }
        .ps-form-title { font-family: var(--font-rounded); font-weight: 800; font-size: 15px; }
        .ps-form-sub { color: rgba(255, 255, 255, .45); font-size: 12px; margin-bottom: 4px; }
        .ps-lbl { color: rgba(255, 255, 255, .5); font-size: 11.5px; font-weight: 700; margin-top: 4px; }
        .ps-input {
          background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1); color: #fff;
          border-radius: 14px; padding: 10px 14px; font-size: 13.5px; font-family: inherit; outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .ps-input::placeholder { color: rgba(255, 255, 255, .32); }
        .ps-input:focus { border-color: rgba(255, 255, 255, .3); box-shadow: 0 0 0 3px rgba(255, 255, 255, .08); }
        .ps-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
        .ps-btn {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 999px; padding: 10px 18px; font-size: 12.5px; font-weight: 800;
          font-family: var(--font-rounded); cursor: pointer; border: 1px solid transparent; transition: all .15s;
        }
        .ps-btn.primary { background: #fff; color: #0c0c0f; }
        .ps-btn.primary:hover:not(:disabled) { background: #e8e8ec; }
        .ps-btn.primary:disabled { opacity: .5; cursor: default; }
        .ps-btn.ok { background: rgba(24, 194, 124, .12); color: #4fe0a0; border-color: rgba(24, 194, 124, .3); }
        .ps-btn.danger { background: rgba(225, 29, 72, .12); color: #ff8a8a; border-color: rgba(225, 29, 72, .3); }
        .ps-btn.danger:disabled { opacity: .5; cursor: default; }
        .ps-btn.ghost { background: transparent; border-color: rgba(255, 255, 255, .16); color: rgba(255, 255, 255, .7); }
        .ps-btn.ghost:hover { background: rgba(255, 255, 255, .07); }

        /* --- Reviews staff --- */
        .ps-rev-title {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--font-rounded); font-weight: 800; font-size: 13.5px; color: rgba(255, 255, 255, .9);
        }
        .ps-rev-row {
          display: flex; gap: 12px; align-items: flex-start;
          background: rgba(12, 12, 15, .66); border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 18px; padding: 13px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .05);
        }
        .ps-rev-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .ps-rev-actions { display: flex; flex-direction: column; gap: 6px; }

        /* --- Modal --- */
        .ps-modal {
          position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
          background: rgba(5, 5, 8, .68); backdrop-filter: blur(12px); padding: 22px;
        }
        .ps-modal-box {
          width: 100%; max-width: 360px;
          background: rgba(18, 18, 21, .97);
          border: 1px solid rgba(255, 255, 255, .12); border-radius: 22px; padding: 18px;
          display: flex; flex-direction: column; gap: 10px;
          box-shadow: 0 30px 70px -20px rgba(0, 0, 0, .9);
        }
        .sk-ch { background: rgba(255, 255, 255, .07); border-radius: 12px; }
      `}</style>
    </div>
  )
}