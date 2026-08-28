import { useCallback, useEffect, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminGroups, adminGroupStatus, adminGroupCreate, adminGroupDelete, adminGroupUpdateBanner } from '../services/api'
import Pager from '../components/Pager'
import { t } from '../lib/i18n'
import { Plus, Trash2, Search, Image as ImageIcon } from 'lucide-react'

const PAGE = 20

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const statusBadge = { active: 'green', suspended: 'amber', archived: 'gray' }

const EMPTY_GROUP = { name: '', description: '', category: 'general', is_paid: false, price_xof: 0 }

export default function GroupsPage() {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [flash, setFlash] = useState('')
  const [flashErr, setFlashErr] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_GROUP)
  const [editingBanner, setEditingBanner] = useState(null)
  const [bannerForm, setBannerForm] = useState({ banner: '' })
  const [confirmDel, setConfirmDel] = useState(null)
  const debounce = useRef(null)
  const timer = useRef(null)

  const load = useCallback(() => {
    const params = { limit: PAGE, offset: page * PAGE }
    if (q.trim()) params.q = q.trim()
    adminGroups(params)
      .then(r => { setRows(r.data.items); setTotal(r.data.total) })
      .catch(() => setRows([]))
  }, [q, page])

  useEffect(() => { load() }, [load])

  const onSearch = (v) => {
    setQ(v); setPage(0)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => { setRows(null); load() }, 350)
  }

  const showFlash = (msg, isErr = false) => {
    setFlash(msg); setFlashErr(isErr)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash(''), 2400)
  }

  const setStatus = (id, status) => {
    adminGroupStatus(id, status)
      .then(() => { load(); showFlash(t('done')) })
      .catch(() => showFlash(t('loadError'), true))
  }

  const createGroup = () => {
    if (!form.name.trim()) return
    adminGroupCreate({ ...form, name: form.name.trim() })
      .then(() => { setCreating(false); setForm(EMPTY_GROUP); load(); showFlash('Communauté créée') })
      .catch(e => showFlash(e?.response?.data?.detail || t('loadError'), true))
  }

  const delGroup = () => {
    adminGroupDelete(confirmDel)
      .then(() => { setConfirmDel(null); load(); showFlash('Communauté supprimée (posts conservés)') })
      .catch(e => {
        const d = e?.response?.data?.detail
        showFlash(typeof d === 'string' ? d : t('loadError'), true)
      })
  }

  const editBanner = (group) => {
    setEditingBanner(group)
    setBannerForm({ banner: group.banner || '' })
  }

  const saveBanner = () => {
    if (!editingBanner) return
    adminGroupUpdateBanner(editingBanner.id, { banner: bannerForm.banner })
      .then(() => { setEditingBanner(null); setBannerForm({ banner: '' }); load(); showFlash('Photo de couverture mise à jour') })
      .catch(() => showFlash(t('loadError'), true))
  }

  return (
    <AdminLayout title={t('groupsTitle')} sub={t('groupsSub')}>
      <div className="adm-panel">
        <div className="head">
          <span className="title">{t('groupsTitle')} · <span className="adm-muted" style={{ fontWeight: 500 }}>{t('rowsTotal')(total)}</span></span>
          <div className="actions">
            <div className="adm-search">
              <Search size={15} />
              <input className="adm-input" style={{ width: 220 }} placeholder={t('searchPh')} value={q} onChange={e => onSearch(e.target.value)} />
            </div>
            <button className="adm-btn green" onClick={() => setCreating(true)}><Plus size={15} />Créer</button>
          </div>
        </div>

        {!rows ? <div className="adm-loading"><span className="spinner" />…</div> : rows.length === 0 ? (
          <div className="adm-empty">{t('noResults')}</div>
        ) : (
          <table className="adm-table">
<thead>
                <tr>
                  <th>{t('thTitle')}</th>
                  <th>Slug</th>
                  <th>{t('thCat')}</th>
                  <th>Couverture</th>
                  <th>Visibilité</th>
                  <th>{t('postsCount')}</th>
                  <th>Accès</th>
                  <th>{t('thStatus')}</th>
                  <th>{t('thCreated')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(g => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 700 }}>{g.name}</td>
                    <td className="adm-muted">{g.slug}</td>
                    <td><span className="adm-badge gray">{g.category || '—'}</span></td>
                    <td>
                      {g.banner ? (
                        <img src={g.banner} alt="" style={{ width: 60, height: 30, objectFit: 'cover', borderRadius: 4 }} />
                      ) : (
                        <span className="adm-muted">—</span>
                      )}
                    </td>
                    <td><span className="adm-badge amber">{g.visibility || '—'}</span></td>
                    <td className="adm-muted">{g.posts_count}</td>
                    <td>
                      {g.is_paid
                        ? <span className="adm-badge pro">{g.price_xof?.toLocaleString('fr-FR')} FCFA</span>
                        : <span className="adm-badge gray">Gratuit</span>}
                    </td>
                    <td><span className={`adm-badge ${statusBadge[g.status] || 'gray'}`}>{t('g' + (g.status === 'active' ? 'Active' : g.status === 'suspended' ? 'Suspended' : 'Archived'))}</span></td>
                    <td className="adm-muted">{fmtDate(g.created_at)}</td>
                    <td>
                      <div className="adm-flex" style={{ flexWrap: 'nowrap' }}>
                        <select
                          className="adm-select" style={{ fontSize: 11.5 }}
                          value={g.status} onChange={e => setStatus(g.id, e.target.value)}
                        >
                          <option value="active">{t('gActive')}</option>
                          <option value="suspended">{t('gSuspended')}</option>
                          <option value="archived">{t('gArchived')}</option>
                        </select>
                        <button className="adm-btn" onClick={() => editBanner(g)} title="Modifier la photo de couverture">
                          <ImageIcon size={14} />
                        </button>
                        <button className="adm-btn danger" onClick={() => setConfirmDel(g.id)} title="Supprimer (posts détachés, pas supprimés)">
                          <Trash2 size={14} />
                        </button>
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

      {creating && (
        <div className="adm-modal-bg" onClick={() => setCreating(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Créer une communauté</h3>
            <div className="adm-modal-field">
              <label>Nom *</label>
              <input className="adm-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={120} placeholder="Ex : Investisseurs Abidjan" />
            </div>
            <div className="adm-modal-field">
              <label>Description</label>
              <textarea className="adm-input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={2000} />
            </div>
            <div className="adm-flex">
              <div className="adm-modal-field" style={{ flex: 1 }}>
                <label>Catégorie</label>
                <input className="adm-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} maxLength={60} />
              </div>
              <div className="adm-modal-field" style={{ flex: 1 }}>
                <label>Accès payant</label>
                <label className="adm-flex" style={{ gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.is_paid} onChange={e => setForm({ ...form, is_paid: e.target.checked })} />
                  Activer
                </label>
              </div>
              {form.is_paid && (
                <div className="adm-modal-field" style={{ flex: 1 }}>
                  <label>Prix (FCFA)</label>
                  <input className="adm-input mono" type="number" min="0" value={form.price_xof} onChange={e => setForm({ ...form, price_xof: parseInt(e.target.value || '0', 10) })} />
                </div>
              )}
            </div>
            <div className="adm-flex" style={{ justifyContent: 'flex-end' }}>
              <button className="adm-btn" onClick={() => setCreating(false)}>{t('annCancel')}</button>
              <button className="adm-btn primary" onClick={createGroup}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel != null && (
        <div className="adm-modal-bg" onClick={() => setConfirmDel(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Supprimer cette communauté ?</h3>
            <p className="adm-muted" style={{ fontSize: 13 }}>Les publications seront détachées (conservées), les membres retirés. Action irréversible.</p>
            <div className="adm-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="adm-btn" onClick={() => setConfirmDel(null)}>{t('annCancel')}</button>
              <button className="adm-btn danger" onClick={delGroup}>{t('deleteBtn')}</button>
            </div>
          </div>
        </div>
      )}

      {editingBanner && (
        <div className="adm-modal-bg" onClick={() => { setEditingBanner(null); setBannerForm({ banner: '' }) }}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Modifier la photo de couverture</h3>
            <div className="adm-modal-field">
              <label>URL de l&apos;image (https://...)</label>
              <input className="adm-input" value={bannerForm.banner} onChange={e => setBannerForm({ ...bannerForm, banner: e.target.value })} placeholder="https://..." />
              {bannerForm.banner && (
                <img src={bannerForm.banner} alt="" style={{ maxWidth: 300, maxHeight: 150, borderRadius: 8, marginTop: 8, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
              )}
            </div>
            <div className="adm-flex" style={{ justifyContent: 'flex-end' }}>
              <button className="adm-btn" onClick={() => { setEditingBanner(null); setBannerForm({ banner: '' }) }}>{t('annCancel')}</button>
              <button className="adm-btn primary" onClick={saveBanner}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
