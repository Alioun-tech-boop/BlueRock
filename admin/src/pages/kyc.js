import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminKycStats, adminKycList, adminBrokerAccounts, adminBrokerReview, adminBrokerProgress } from '../services/api'
import { t } from '../lib/i18n'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const kycBadge = (s) => {
  if (s === 'verified') return 'green'
  if (s === 'rejected' || s === 'error') return 'red'
  if (s === 'review_required') return 'amber'
  if (s && s !== 'not_started') return 'gray'
  return 'gray'
}

export default function KycPage() {
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState(null)
  const [accs, setAccs] = useState(null)
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [flash, setFlash] = useState('')
  const [flashErr, setFlashErr] = useState(false)

  const load = useCallback(() => {
    adminKycStats().then(r => setStats(r.data)).catch(() => {})
    const params = { limit: 100 }
    if (status) params.status = status
    adminKycList(params).then(r => setRows(r.data.items)).catch(() => setRows([]))
  }, [status])

  useEffect(() => { load() }, [load])

  const loadAccounts = (userId) => {
    adminBrokerAccounts({ user_id: userId })
      .then(r => setAccs(r.data.accounts))
      .catch(() => setAccs([]))
  }

  const openDetail = (item) => {
    setSelected(item)
    setAccs(null)
    loadAccounts(item.user.id)
  }

  const flashMsg = (msg, isErr = false) => {
    setFlash(msg); setFlashErr(isErr)
    setTimeout(() => setFlash(''), 2400)
  }

  const review = (accountId, decision) => {
    adminBrokerReview(accountId, decision, '')
      .then(() => { loadAccounts(selected?.user.id); load(); flashMsg(t('done')) })
      .catch(() => flashMsg(t('loadError'), true))
  }

  const progress = (accountId, stage) => {
    adminBrokerProgress(accountId, stage)
      .then(() => { loadAccounts(selected?.user.id); load(); flashMsg(t('done')) })
      .catch(() => flashMsg(t('loadError'), true))
  }

  const cards = stats ? [
    { k: t('kycVerified'), v: stats.verified, cls: 'green' },
    { k: t('kycReview'), v: stats.review, cls: 'amber' },
    { k: 'En cours', v: stats.pending, cls: '' },
    { k: t('kycRejected'), v: stats.rejected, cls: 'red' },
    { k: t('readySgi'), v: stats.ready_for_sgi, cls: 'green' },
    { k: t('transmitSgi'), v: stats.transmitted_to_sgi, cls: '' },
  ] : []

  return (
    <AdminLayout title={t('kycTitle')} sub={t('kycSub')}>
      {stats && (
        <div className="adm-cards">
          {cards.map((c, i) => (
            <div className="adm-card" key={i}>
              <div className="k">{c.k}</div>
              <div className="v" style={{ color: c.cls === 'green' ? 'var(--green)' : c.cls === 'red' ? 'var(--red)' : c.cls === 'amber' ? 'var(--amber)' : undefined }}>{c.v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="adm-panel">
        <div className="head">
          <span className="title">{t('kycTitle')}</span>
          <div className="actions">
            <select className="adm-select" value={status} onChange={e => { setStatus(e.target.value); setRows(null) }}>
              <option value="">{t('typeFilter')}</option>
              {['not_started', 'in_progress', 'document_submitted', 'verification_in_progress', 'verified', 'review_required', 'rejected', 'retry_required', 'error']
                .map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
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
                <th>{t('thStatus')}</th>
                <th>{t('thDate')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(k => (
                <tr key={k.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(k)}>
                  <td style={{ fontWeight: 600 }}>{k.user.name}</td>
                  <td className="adm-muted">{k.user.email}</td>
                  <td>
                    <span className={`adm-badge ${kycBadge(k.status)}`}>{k.status.replace(/_/g, ' ')}</span>
                    {k.ready_for_sgi && <span className="adm-badge green" style={{ marginLeft: 6 }}>{t('readySgi')}</span>}
                    {k.transmitted_to_sgi && <span className="adm-badge amber" style={{ marginLeft: 6 }}>{t('transmitSgi')}</span>}
                  </td>
                  <td className="adm-muted">{fmtDate(k.submitted_at)}</td>
                  <td><button className="adm-btn" onClick={(e) => { e.stopPropagation(); openDetail(k) }}>{t('kycDetail')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {flash && <div className={`adm-flash ${flashErr ? 'err' : ''}`}>{flash}</div>}

      {selected && (
        <div className="adm-modal-bg" onClick={() => setSelected(null)}>
          <div className="adm-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h3>{t('kycDetail')}<div className="adm-muted" style={{ fontWeight: 500, marginTop: 4 }}>{selected.user.name} · {selected.user.email}</div></h3>

            <div className="kv"><span className="k">{t('thStatus')}</span><span className="v">{selected.status.replace(/_/g, ' ')}</span></div>
            <div className="kv"><span className="k">{t('readySgi')}</span><span className="v">{selected.profile_complete ? '✓' : '✗'}</span></div>
            {selected.review_note && <div className="kv"><span className="k">Note</span><span className="v">{selected.review_note}</span></div>}

            <h3 style={{ marginTop: 18, fontSize: 13 }}>{t('thStatus')} SGI</h3>
            {!accs ? <div className="adm-loading" style={{ padding: 20 }}><span className="spinner" /></div> : accs.length === 0 ? (
              <div className="adm-muted">Aucun dossier SGI.</div>
            ) : accs.map(a => (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <div className="adm-flex" style={{ justifyContent: 'space-between' }}>
                  <b>{a.broker_name}</b>
                  <span className={`adm-badge ${kycBadge(a.status)}`}>{a.status.replace(/_/g, ' ')}</span>
                </div>
                <div className="adm-muted" style={{ fontSize: 11.5, marginTop: 4 }}>{a.full_name} · {a.id_type}: {a.id_number}</div>
                {a.sgi_note && <div className="adm-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{a.sgi_note}</div>}
                <div className="status-actions">
                  {(a.status === 'transmitted' || a.status === 'under_review' || a.status === 'info_requested') && (
                    <>
                      <button className="adm-btn green" onClick={() => review(a.id, 'approved')}>{t('reviewApprove')}</button>
                      <button className="adm-btn" onClick={() => review(a.id, 'info_requested')}>{t('reviewInfo')}</button>
                      <button className="adm-btn danger" onClick={() => review(a.id, 'refused')}>{t('reviewRefuse')}</button>
                    </>
                  )}
                  {a.status === 'approved' && (
                    <button className="adm-btn primary" onClick={() => progress(a.id, 'account_opening')}>{t('progressOpening')}</button>
                  )}
                  {a.status === 'account_opening' && (
                    <button className="adm-btn green" onClick={() => progress(a.id, 'account_open')}>{t('progressOpen')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}