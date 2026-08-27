import { useEffect, useState, useCallback } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminReports, adminReportResolve } from '../services/api'
import Pager from '../components/Pager'
import { Flag } from 'lucide-react'

const PAGE = 20

export default function Moderation() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('open')
  const [busy, setBusy] = useState(null)
  const [flash, setFlash] = useState(null)
  const [err, setErr] = useState(false)
  const [detail, setDetail] = useState(null)

  const load = useCallback(() => {
    adminReports({ status, limit: PAGE, offset: page * PAGE }).then(r => {
      setItems(r.data.items); setTotal(r.data.total)
    }).catch(() => setErr(true))
  }, [status, page])

  useEffect(() => { load() }, [load])

  const resolve = (rep, action) => {
    setBusy(rep.id + action)
    adminReportResolve(rep.id, action).then(() => {
      setFlash(action === 'dismiss' ? 'Signalement classé sans suite' : 'Action de modération appliquée à la communauté')
      load()
    }).catch(() => setFlash('Erreur lors de la résolution')).finally(() => setBusy(null))
  }

  const reasonLabel = { spam: 'Spam', harassment: 'Harcèlement', misinformation: 'Fausse info', other: 'Autre' }

  return (
    <AdminLayout title="File de modération" sub="Signalements de la communauté traités par le staff">
      {flash && <div className={`adm-flash ${flash.startsWith('Erreur') ? 'err' : ''}`} onClick={() => setFlash(null)}>{flash}</div>}
      {err && <div className="adm-empty">Impossible de charger la file.</div>}

      <div className="adm-panel">
        <div className="head">
          <div className="title"><span className="ic"><Flag size={15} /></span>Signalements</div>
          <div className="adm-flex">
            <div className="adm-seg">
              <button className={status === 'open' ? 'on' : ''} onClick={() => { setStatus('open'); setPage(0) }}>Ouverts</button>
              <button className={status === 'all' ? 'on' : ''} onClick={() => { setStatus('all'); setPage(0) }}>Tous</button>
              <button className={status === 'resolved' ? 'on' : ''} onClick={() => { setStatus('resolved'); setPage(0) }}>Résolus</button>
            </div>
          </div>
        </div>

        <table className="adm-table">
          <thead><tr><th>Cible</th><th>Motif</th><th>Détail</th><th>Date</th><th>Statut</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="adm-empty">Aucun signalement.</td></tr>}
            {items.map(r => (
              <tr key={r.id} className="row-btn" onClick={() => setDetail(r)}>
                <td>
                  <span className="adm-badge cyan">{r.target_type}</span>{' '}
                  {r.target ? (r.target.title || r.target.handle || '#' + r.target_id) : '#' + r.target_id}
                </td>
                <td>{reasonLabel[r.reason] || r.reason}</td>
                <td style={{ maxWidth: 320 }} className="adm-muted">{r.details || '—'}</td>
                <td className="adm-muted">{r.created_at ? r.created_at.slice(0, 10) : ''}</td>
                <td>
                  {r.status === 'open' ? <span className="adm-badge amber">ouvert</span> : <span className="adm-badge green">résolu · {r.action}</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="adm-flex" style={{ justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {r.status === 'open' && (
                      <>
                        {r.target_type === 'post' && <><button className="adm-btn danger" disabled={busy === r.id + 'hide'} onClick={() => resolve(r, 'hide')}>Masquer</button>
                          <button className="adm-btn danger" disabled={busy === r.id + 'delete'} onClick={() => resolve(r, 'delete')}>Suppr.</button></>}
                        {r.target_type === 'user' && <button className="adm-btn danger" disabled={busy === r.id + 'ban'} onClick={() => resolve(r, 'ban')}>Bannir</button>}
                        <button className="adm-btn ghost" disabled={busy === r.id + 'dismiss'} onClick={() => resolve(r, 'dismiss')}>Classer</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
      </div>

      {detail && (
        <div className="adm-modal-bg" onClick={() => setDetail(null)}>
          <div className="adm-modal wide" onClick={e => e.stopPropagation()}>
            <h3>Signalement #{detail.id}</h3>
            <div className="kv"><span className="k">Cible</span><span className="v">{detail.target_type} #{detail.target_id}</span></div>
            <div className="kv"><span className="k">Motif</span><span className="v">{reasonLabel[detail.reason] || detail.reason}</span></div>
            <div className="kv"><span className="k">Statut</span><span className="v">{detail.status}{detail.action ? ' · ' + detail.action : ''}</span></div>
            <div className="kv"><span className="k">Date</span><span className="v">{detail.created_at}</span></div>
            <div className="adm-modal-field" style={{ marginTop: 12 }}>
              <label>Détail du signalement</label>
              <div className="adm-post-body">{detail.details || 'Aucun détail fourni.'}</div>
            </div>
            {detail.target && detail.target_type === 'post' && (
              <div className="adm-modal-field">
                <label>Publication signalée</label>
                <div className="adm-post-body">{detail.target.title}</div>
              </div>
            )}
            <div className="status-actions">
              {detail.status === 'open' && (
                <>
                  {detail.target_type === 'post' && <><button className="adm-btn danger" onClick={() => { resolve(detail, 'hide'); setDetail(null) }}>Masquer la publication</button>
                    <button className="adm-btn danger" onClick={() => { resolve(detail, 'delete'); setDetail(null) }}>Supprimer</button></>}
                  {detail.target_type === 'user' && <button className="adm-btn danger" onClick={() => { resolve(detail, 'ban'); setDetail(null) }}>Bannir l’utilisateur</button>}
                  <button className="adm-btn ghost" onClick={() => { resolve(detail, 'dismiss'); setDetail(null) }}>Classer sans suite</button>
                </>
              )}
              <button className="adm-btn" onClick={() => setDetail(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
