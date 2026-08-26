import { useCallback, useEffect, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminUsers, adminSetRole, adminBanUser, adminUnbanUser, adminPromotePro } from '../services/api'
import Pager from '../components/Pager'
import { t } from '../lib/i18n'

const PAGE = 20

const ROLES = [
  ['user', t('roleUser')], ['analyst', t('roleAnalyst')], ['support', t('roleSupport')],
  ['compliance', t('roleCompliance')], ['security', t('roleSecurity')],
  ['admin', t('roleAdmin')], ['super_admin', t('roleSuperAdmin')],
]

const PRO_CATEGORIES = [
  ['advisor', 'Conseiller'], ['analyst', 'Analyste'], ['fund_manager', "Gestionnaire de fonds"],
  ['broker', 'Courtier'], ['economist', 'Économiste'], ['journalist', 'Journaliste'],
  ['accountant', 'Comptable'], ['other', 'Autre'],
]

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function UsersPage() {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [bannedOnly, setBannedOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [flash, setFlash] = useState('')
  const [flashErr, setFlashErr] = useState(false)
  const [banId, setBanId] = useState(null)
  const [banReason, setBanReason] = useState('')
  const debounce = useRef(null)
  const flashTimer = useRef(null)

  const [proEmail, setProEmail] = useState('')
  const [proCat, setProCat] = useState('advisor')
  const [proBusy, setProBusy] = useState(false)
  const [proMsg, setProMsg] = useState(null)

  const load = useCallback(() => {
    const params = { limit: PAGE, offset: page * PAGE }
    if (q.trim()) params.q = q.trim()
    if (bannedOnly) params.banned = true
    adminUsers(params)
      .then(r => { setRows(r.data.items); setTotal(r.data.total) })
      .catch(() => setRows([]))
  }, [q, bannedOnly, page])

  useEffect(() => { load() }, [load])

  const onSearch = (v) => {
    setQ(v); setPage(0)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => { setRows(null); load() }, 350)
  }

  const showFlash = (msg, isErr = false) => {
    setFlash(msg); setFlashErr(isErr)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 2400)
  }

  const setRole = (id, role) => {
    adminSetRole(id, role).then(() => { load(); showFlash(t('roleDone')) }).catch(() => showFlash(t('loadError'), true))
  }

  const confirmBan = (u) => { setBanId(u); setBanReason('') }
  const doBan = () => {
    if (banId == null) return
    adminBanUser(banId.id, banReason)
      .then(() => { setBanId(null); load(); showFlash(t('banDone')) })
      .catch(() => showFlash(t('loadError'), true))
  }
  const doUnban = (id) => {
    adminUnbanUser(id).then(() => { load(); showFlash(t('unbanDone')) }).catch(() => showFlash(t('loadError'), true))
  }

  const promote = () => {
    const email = proEmail.trim()
    if (!email) { setProMsg({ err: true, msg: 'Saisissez un email.' }); return }
    setProBusy(true)
    adminPromotePro({ email, category: proCat })
      .then(() => { setProMsg({ err: false, msg: `« ${email} » est maintenant professionnel.` }); setProEmail(''); load() })
      .catch(e => {
        const detail = e?.response?.data?.detail || t('loadError')
        setProMsg({ err: true, msg: detail })
      })
      .finally(() => setProBusy(false))
  }

  return (
    <AdminLayout title={t('usersTitle')} sub={t('usersSub')}>
      <div className="adm-panel">
        <div className="head">
          <span className="title"><span className="ic">⭐</span>Promouvoir un utilisateur en professionnel</span>
        </div>
        <div className="adm-chart" style={{ padding: '16px 18px' }}>
          <div className="adm-flex" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input
              className="adm-input adm-grow" style={{ minWidth: 220 }} placeholder="Email de l'utilisateur"
              value={proEmail} onChange={e => setProEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') promote() }}
            />
            <select className="adm-select" value={proCat} onChange={e => setProCat(e.target.value)}>
              {PRO_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="adm-btn primary" disabled={proBusy || !proEmail.trim()} onClick={promote}>
              {proBusy ? '…' : 'Promouvoir'}
            </button>
          </div>
          {proMsg && (
            <div className={`adm-flash ${proMsg.err ? 'err' : ''}`} style={{ position: 'static', transform: 'none', opacity: 1, animation: 'none', marginTop: 12, display: 'inline-block' }}>
              {proMsg.msg}
            </div>
          )}
        </div>
      </div>

      <div className="adm-panel">
        <div className="head">
          <span className="title">{t('usersTitle')} · <span className="adm-muted" style={{ fontWeight: 500 }}>{t('rowsTotal')(total)}</span></span>
          <div className="actions">
            <input
              className="adm-input" style={{ width: 240 }} placeholder={t('searchPh')}
              value={q} onChange={e => onSearch(e.target.value)}
            />
            <button className={`adm-btn ${bannedOnly ? 'primary' : ''}`} onClick={() => { setBannedOnly(v => !v); setPage(0); setRows(null) }}>
              {t('bannedOnly')}
            </button>
          </div>
        </div>

        {!rows ? <div className="adm-loading"><span className="spinner" />…</div> : rows.length === 0 ? (
          <div className="adm-empty">{t('noResults')}</div>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('thUser')}</th>
                <th>{t('thEmail')}</th>
                <th>{t('thRole')}</th>
                <th>{t('banBtn')}</th>
                <th>{t('thKyc')}</th>
                <th>{t('thCreated')}</th>
                <th>{t('thLast')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="adm-flex" style={{ gap: 4 }}>
                      <span style={{ fontWeight: 700 }}>{u.name}</span>
                      {u.email_verified && <span className="adm-badge green" style={{ fontSize: 9.5 }}>{t('verifiedTag')}</span>}
                      {u.is_pro && <span className="adm-badge pro" style={{ fontSize: 9.5 }}>⭐ Pro</span>}
                      {u.tier === 'pro' && <span className="adm-badge pro" style={{ fontSize: 9.5 }}>{t('proTag')}</span>}
                    </div>
                    <div className="adm-muted">@{u.id}</div>
                  </td>
                  <td className="adm-muted">{u.email}</td>
                  <td>
                    <select className="adm-select" style={{ fontSize: 11.5 }} value={u.role} onChange={e => setRole(u.id, e.target.value)}>
                      {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    {u.banned_at ? (
                      <span className="adm-badge red">{t('banBtn')} · {fmtDate(u.banned_at)}</span>
                    ) : (
                      <span className="adm-badge gray">{t('shownTag')}</span>
                    )}
                    {u.banned_reason && <div className="adm-muted" style={{ fontSize: 10.5 }}>{u.banned_reason}</div>}
                  </td>
                  <td>
                    {u.kyc_status ? (
                      <>
                        <span className={`adm-badge ${u.kyc_status === 'verified' ? 'green' : 'amber'}`}>{u.kyc_status.replace(/_/g, ' ')}</span>
                        {u.kyc_ready && <div className="adm-muted" style={{ fontSize: 10.5 }}>{t('readySgi')}</div>}
                      </>
                    ) : <span className="adm-muted">—</span>}
                  </td>
                  <td className="adm-muted">{fmtDate(u.created_at)}</td>
                  <td className="adm-muted">{fmtDate(u.last_login)}</td>
                  <td>
                    <div className="adm-flex">
                      {u.banned_at
                        ? <button className="adm-btn green" onClick={() => doUnban(u.id)}>{t('unbanBtn')}</button>
                        : <button className="adm-btn danger" onClick={() => confirmBan(u)}>{t('banBtn')}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows && <Pager page={page} pageSize={PAGE} total={total} onPage={p => { setPage(p); setRows(null) }} />}
      </div>

      {flash && <div className={`adm-flash ${flashErr ? 'err' : ''}`}>{flash}</div>}

      {banId && (
        <div className="adm-modal-bg" onClick={() => setBanId(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>{t('banConfirm')}<div className="adm-muted" style={{ fontWeight: 500, marginTop: 4 }}>{banId.name} · {banId.email}</div></h3>
            <div className="adm-modal-field">
              <label>{t('banReasonPh')}</label>
              <input className="adm-input" value={banReason} onChange={e => setBanReason(e.target.value)} placeholder={t('banReasonPh')} />
            </div>
            <div className="adm-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="adm-btn" onClick={() => setBanId(null)}>{t('annCancel')}</button>
              <button className="adm-btn danger" onClick={doBan}>{t('banBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}