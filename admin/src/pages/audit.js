import { useEffect, useState, useCallback } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminAudit } from '../services/api'
import Pager from '../components/Pager'
import { ScrollText } from 'lucide-react'

const PAGE = 25

export default function Audit() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    adminAudit({ limit: PAGE, offset: page * PAGE }).then(r => {
      const d = r.data.audit || []
      setItems(d)
      setTotal(r.data.total || d.length)
    }).catch(() => setErr(true))
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <AdminLayout title="Journal d’audit" sub="Traçabilité des actions sensibles de la plateforme">
      {err && <div className="adm-empty">Impossible de charger le journal.</div>}
      <div className="adm-panel">
        <div className="head"><div className="title"><span className="ic"><ScrollText size={15} /></span>Événements</div></div>
        <table className="adm-table">
          <thead><tr><th>Date</th><th>Action</th><th>Acteur</th><th>Cible</th><th>Détail</th></tr></thead>
          <tbody>
            {items.length === 0 && !err && <tr><td colSpan={5} className="adm-empty">Aucun événement.</td></tr>}
            {items.map((a, i) => (
              <tr key={i}>
                <td className="adm-muted">{a.timestamp ? String(a.timestamp).slice(0, 19).replace('T', ' ') : ''}</td>
                <td><span className="adm-badge role">{a.action || a.event || '—'}</span></td>
                <td>{a.admin_email || a.actor || (a.admin_id ? '#' + a.admin_id : '—')}</td>
                <td className="adm-muted">{a.target || a.resource || '—'}</td>
                <td className="adm-muted" style={{ maxWidth: 360 }}>{a.detail || a.note || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
      </div>
    </AdminLayout>
  )
}
