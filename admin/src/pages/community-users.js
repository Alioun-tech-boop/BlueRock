import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import {
  adminCommunityUsers, adminCommunityUserBan, adminCommunityUserUnban,
  adminCommunityUserVerify, adminCommunityUserTogglePro,
} from '../services/api'
import { t } from '../lib/i18n'
import { UserRound, Search, ShieldOff, ShieldCheck, BadgeCheck, Gem } from 'lucide-react'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CommunityUsers() {
  const [items, setItems] = useState(null)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all') // all | banned | pros
  const [page, setPage] = useState(0)
  const [limit] = useState(50)
  const [flash, setFlash] = useState('')
  const [flashErr, setFlashErr] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    const params = { limit, offset: page * limit }
    if (q.trim()) params.q = q.trim()
    if (filter === 'banned') params.banned = true
    if (filter === 'pros') params.is_pro = true
    setItems(null)
    adminCommunityUsers(params)
      .then(r => { setItems(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(() => setItems([]))
  }, [q, filter, page, limit])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPage(0) }, [q, filter])

  const flashMsg = (msg, isErr = false) => {
    setFlash(msg); setFlashErr(isErr)
    setTimeout(() => setFlash(''), 2400)
  }

  const act = (fn, id, msg) => {
    setBusyId(id)
    fn(id)
      .then(() => { flashMsg(msg); load() })
      .catch(() => flashMsg(t('loadError'), true))
      .finally(() => setBusyId(null))
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminLayout title="Membres de la communauté" sub={`${total.toLocaleString('fr-FR')} profils · réputation, vérification, modération`}>
      <div className="adm-flex" style={{ marginBottom: 16 }}>
        <div className="adm-search">
          <Search size={15} />
          <input className="adm-input" style={{ width: 280 }} placeholder={t('searchPh')} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="adm-seg">
          {[{ k: 'all', l: 'Tous' }, { k: 'pros', l: 'Pros' }, { k: 'banned', l: 'Bannis' }].map(x => (
            <button key={x.k} className={filter === x.k ? 'on' : ''} onClick={() => setFilter(x.k)}>{x.l}</button>
          ))}
        </div>
      </div>

      <div className="adm-panel">
        {!items ? (
          <div className="adm-loading"><span className="spinner" />…</div>
        ) : items.length === 0 ? (
          <div className="adm-empty">{t('noResults')}</div>
        ) : (
          <>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>Email</th>
                  <th>Réputation</th>
                  <th>Statut</th>
                  <th>Inscrit le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="adm-flex" style={{ flexWrap: 'nowrap' }}>
                        <span className="adm-avatar" style={{ background: u.avatar_color || '#3B6BFF' }}>
                          {(u.display_name || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {u.display_name}
                            {u.verified && <BadgeCheck size={14} color="#1FD996" />}
                          </div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>@{u.handle}</div>
                        </span>
                      </div>
                    </td>
                    <td className="adm-muted">{u.email || '—'}</td>
                    <td><b className="mono">{(u.reputation || 0).toLocaleString('fr-FR')}</b></td>
                    <td>
                      <div className="adm-flex" style={{ flexWrap: 'nowrap' }}>
                        {u.is_pro && <span className="adm-badge pro">PRO</span>}
                        {u.banned ? <span className="adm-badge red">Banni</span> : <span className="adm-badge green">Actif</span>}
                      </div>
                    </td>
                    <td className="adm-muted">{fmtDate(u.created_at)}</td>
                    <td>
                      <div className="adm-flex" style={{ flexWrap: 'nowrap' }}>
                        <button
                          className="adm-btn ghost"
                          title={u.verified ? 'Retirer la vérification' : 'Vérifier'}
                          disabled={busyId === u.id}
                          onClick={() => act(adminCommunityUserVerify, u.id, t('done'))}
                        >
                          <BadgeCheck size={14} color={u.verified ? '#1FD996' : undefined} />
                        </button>
                        <button
                          className="adm-btn ghost"
                          title={u.is_pro ? 'Retirer Pro' : 'Passer Pro'}
                          disabled={busyId === u.id}
                          onClick={() => act(adminCommunityUserTogglePro, u.id, t('done'))}
                        >
                          <Gem size={14} color={u.is_pro ? '#FFB23E' : undefined} />
                        </button>
                        {u.banned ? (
                          <button className="adm-btn green" disabled={busyId === u.id} onClick={() => act(adminCommunityUserUnban, u.id, 'Débanné')}>
                            <ShieldCheck size={14} />Débannir
                          </button>
                        ) : (
                          <button
                            className="adm-btn danger"
                            disabled={busyId === u.id}
                            onClick={() => {
                              const reason = window.prompt('Motif du bannissement communauté :', '')
                              if (reason === null) return
                              setBusyId(u.id)
                              adminCommunityUserBan(u.id, reason)
                                .then(() => { flashMsg('Banni'); load() })
                                .catch(() => flashMsg(t('loadError'), true))
                                .finally(() => setBusyId(null))
                            }}
                          >
                            <ShieldOff size={14} />Bannir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="adm-pager">
              <span className="info">{total.toLocaleString('fr-FR')} membres · page {page + 1} / {totalPages}</span>
              <div className="pg">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
              </div>
            </div>
          </>
        )}
      </div>

      {flash && <div className={`adm-flash ${flashErr ? 'err' : ''}`}>{flash}</div>}
    </AdminLayout>
  )
}
