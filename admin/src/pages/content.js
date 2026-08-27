import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import AdminLayout from '../components/AdminLayout'
import {
  adminNews, adminNewsDelete, adminNewsCreate, adminNewsUpdate, adminNewsRefresh,
  adminAnnouncements, adminAnnouncementCreate, adminAnnouncementUpdate, adminAnnouncementDelete,
} from '../services/api'
import { t } from '../lib/i18n'
import { Newspaper, Megaphone, Plus, Pencil, Trash2, RefreshCw, Search } from 'lucide-react'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const EMPTY_NEWS = { title: '', url: '', image: '', source: '', category: 'Presse', symbol: '', published_at: '' }
const EMPTY_ANN = { title: '', body: '', source: '', category: 'general', link_url: '', image: '', active: true }

export default function Content() {
  const router = useRouter()
  const tab = router.query.tab === 'ann' ? 'ann' : 'news'
  const [news, setNews] = useState(null)
  const [newsTotal, setNewsTotal] = useState(0)
  const [anns, setAnns] = useState(null)
  const [annTotal, setAnnTotal] = useState(0)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [flash, setFlash] = useState('')
  const [flashErr, setFlashErr] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | id
  const [form, setForm] = useState(EMPTY_NEWS)
  const [editingAnn, setEditingAnn] = useState(null)
  const [formAnn, setFormAnn] = useState(EMPTY_ANN)
  const [confirmDel, setConfirmDel] = useState(null)

  const loadNews = useCallback(() => {
    const params = { limit: 60 }
    if (q.trim()) params.q = q.trim()
    setNews(null)
    adminNews(params).then(r => { setNews(r.data.items); setNewsTotal(r.data.total) }).catch(() => setNews([]))
  }, [q])

  const loadAnns = useCallback(() => {
    adminAnnouncements({ limit: 100 }).then(r => { setAnns(r.data.items); setAnnTotal(r.data.total) }).catch(() => setAnns([]))
  }, [])

  useEffect(() => {
    if (tab === 'news') loadNews()
    else loadAnns()
  }, [tab, loadNews, loadAnns])

  const flashMsg = (msg, isErr = false) => {
    setFlash(msg); setFlashErr(isErr)
    setTimeout(() => setFlash(''), 2400)
  }

  // ---------- News ----------
  const openNewNews = () => { setEditing('new'); setForm(EMPTY_NEWS) }
  const openEditNews = (n) => {
    setEditing(n.id)
    setForm({
      title: n.title || '', url: n.url_real || n.url || '', image: n.image || '',
      source: n.source || '', category: n.category || 'Presse',
      symbol: n.symbol || '', published_at: n.published_at ? n.published_at.slice(0, 10) : '',
    })
  }

  const saveNews = () => {
    if (!form.title.trim()) return
    const payload = { ...form, title: form.title.trim(), symbol: form.symbol.trim().toUpperCase() || null }
    const p = editing === 'new' ? adminNewsCreate(payload) : adminNewsUpdate(editing, payload)
    p.then(() => { setEditing(null); loadNews(); flashMsg(t('done')) })
      .catch(e => flashMsg(e?.response?.data?.detail || t('loadError'), true))
  }

  const refreshFeeds = () => {
    setRefreshing(true)
    adminNewsRefresh()
      .then(() => { flashMsg('Rafraîchissement lancé'); setTimeout(() => { loadNews(); setRefreshing(false) }, 4000) })
      .catch(() => { flashMsg(t('loadError'), true); setRefreshing(false) })
  }

  // ---------- Announcements ----------
  const openNewAnn = () => { setEditingAnn('new'); setFormAnn(EMPTY_ANN) }
  const openEditAnn = (a) => {
    setEditingAnn(a.id)
    setFormAnn({ title: a.title, body: a.body || '', source: a.source || '', category: a.category || 'general', link_url: a.link_url || '', image: a.image || '', active: a.active })
  }

  const saveAnn = () => {
    if (!formAnn.title.trim()) return
    const payload = { ...formAnn, title: formAnn.title.trim() }
    const p = editingAnn === 'new' ? adminAnnouncementCreate(payload) : adminAnnouncementUpdate(editingAnn, payload)
    p.then(() => { setEditingAnn(null); loadAnns(); flashMsg(t('done')) })
      .catch(() => flashMsg(t('loadError'), true))
  }

  const delAnn = () => {
    adminAnnouncementDelete(confirmDel.id).then(() => { setConfirmDel(null); loadAnns(); flashMsg(t('done')) }).catch(() => flashMsg(t('loadError'), true))
  }

  const delNews = () => {
    adminNewsDelete(confirmDel.id).then(() => { setConfirmDel(null); loadNews(); flashMsg(t('done')) }).catch(() => flashMsg(t('loadError'), true))
  }

  return (
    <AdminLayout
      title={tab === 'news' ? t('newsTitle') : t('annTitle')}
      sub={tab === 'news' ? `${newsTotal.toLocaleString('fr-FR')} articles · agrégation temps réel + édition manuelle` : t('annSub')}
    >
      <div className="adm-flex" style={{ marginBottom: 16 }}>
        <div className="adm-seg">
          <button className={tab === 'news' ? 'on' : ''} onClick={() => router.push('/content?tab=news')}>
            <Newspaper size={14} style={{ verticalAlign: -2, marginRight: 5 }} />{t('newsTitle')}
          </button>
          <button className={tab === 'ann' ? 'on' : ''} onClick={() => router.push('/content?tab=ann')}>
            <Megaphone size={14} style={{ verticalAlign: -2, marginRight: 5 }} />{t('annTitle')}
          </button>
        </div>

        {tab === 'news' ? (
          <>
            <div className="adm-search" style={{ marginLeft: 'auto' }}>
              <Search size={15} />
              <input className="adm-input" style={{ width: 240 }} placeholder={t('searchPh')} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button className="adm-btn" onClick={refreshFeeds} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'spin-icon' : ''} />Actualiser flux
            </button>
            <button className="adm-btn green" onClick={openNewNews}>
              <Plus size={15} />{t('newAnn')}
            </button>
          </>
        ) : (
          <button className="adm-btn green" style={{ marginLeft: 'auto' }} onClick={openNewAnn}>
            <Plus size={15} />{t('newAnn')}
          </button>
        )}
      </div>

      {tab === 'news' ? (
        <div className="adm-panel">
          {!news ? <div className="adm-loading"><span className="spinner" />…</div> : news.length === 0 ? (
            <div className="adm-empty">{t('noResults')}</div>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t('thTitle')}</th>
                  <th>{t('thSource')}</th>
                  <th>{t('thCat')}</th>
                  <th>{t('thSymbol')}</th>
                  <th>{t('thDate')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {news.map(n => (
                  <tr key={n.id}>
                    <td style={{ maxWidth: 340 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                      <div className="adm-muted" style={{ fontSize: 10.5 }}>{n.url_real || n.url}</div>
                    </td>
                    <td>{n.source || '—'}</td>
                    <td><span className={`adm-badge ${n.category === 'BRVM' ? 'green' : n.category === 'Société' ? 'amber' : 'gray'}`}>{n.category || '—'}</span></td>
                    <td>{n.symbol ? <b className="mono">{n.symbol}</b> : '—'}</td>
                    <td className="adm-muted">{fmtDate(n.published_at)}</td>
                    <td>
                      <div className="adm-flex" style={{ flexWrap: 'nowrap' }}>
                        <button className="adm-btn" onClick={() => openEditNews(n)}><Pencil size={14} /></button>
                        <button className="adm-btn danger" onClick={() => setConfirmDel({ kind: 'news', id: n.id })}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="adm-panel">
          {!anns ? <div className="adm-loading"><span className="spinner" />…</div> : anns.length === 0 ? (
            <div className="adm-empty">{t('noResults')}</div>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t('thTitle')}</th>
                  <th>{t('thCat')}</th>
                  <th>{t('thSource')}</th>
                  <th>{t('thStatus')}</th>
                  <th>{t('thDate')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {anns.map(a => (
                  <tr key={a.id}>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      {a.body && <div className="adm-muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{a.body}</div>}
                    </td>
                    <td><span className="adm-badge gray">{a.category}</span></td>
                    <td>{a.source || '—'}</td>
                    <td>{a.active ? <span className="adm-badge green">{t('shownTag')}</span> : <span className="adm-badge gray">{t('hiddenTag')}</span>}</td>
                    <td className="adm-muted">{fmtDate(a.published_at)}</td>
                    <td>
                      <div className="adm-flex" style={{ flexWrap: 'nowrap' }}>
                        <button className="adm-btn" onClick={() => openEditAnn(a)}><Pencil size={14} />{t('editAnn')}</button>
                        <button className="adm-btn danger" onClick={() => setConfirmDel({ kind: 'ann', id: a.id })}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {flash && <div className={`adm-flash ${flashErr ? 'err' : ''}`}>{flash}</div>}

      {/* ---------- Modal News ---------- */}
      {editing !== null && (
        <div className="adm-modal-bg" onClick={() => setEditing(null)}>
          <div className="adm-modal wide" onClick={e => e.stopPropagation()}>
            <h3>{editing === 'new' ? 'Publier une actualité' : "Modifier l'actualité"}</h3>
            <div className="adm-modal-field">
              <label>Titre *</label>
              <input className="adm-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} maxLength={255} placeholder="Ex : La BRVM clôt en hausse de 0,42%" />
            </div>
            <div className="adm-flex" style={{ alignItems: 'flex-start' }}>
              <div className="adm-modal-field" style={{ flex: 1 }}>
                <label>Catégorie</label>
                <select className="adm-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="BRVM">BRVM</option>
                  <option value="Société">Société</option>
                  <option value="Presse">Presse</option>
                </select>
              </div>
              <div className="adm-modal-field" style={{ flex: 1 }}>
                <label>Symbole (optionnel)</label>
                <input className="adm-input mono" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })} maxLength={12} placeholder="ETIT" />
              </div>
              <div className="adm-modal-field" style={{ flex: 1 }}>
                <label>Date</label>
                <input className="adm-input" type="date" value={form.published_at} onChange={e => setForm({ ...form, published_at: e.target.value })} />
              </div>
            </div>
            <div className="adm-modal-field">
              <label>Lien URL</label>
              <input className="adm-input" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} maxLength={600} placeholder="https://…" />
            </div>
            <div className="adm-modal-field">
              <label>Image (URL)</label>
              <input className="adm-input" value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} maxLength={600} placeholder="https://…/cover.jpg" />
              {form.image && (
                <img src={form.image} alt="" style={{ maxWidth: 220, maxHeight: 110, borderRadius: 10, marginTop: 8, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
              )}
            </div>
            <div className="adm-modal-field">
              <label>Source</label>
              <input className="adm-input" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} maxLength={120} placeholder="BlueRock, Sika Finance…" />
            </div>
            <div className="adm-flex" style={{ justifyContent: 'flex-end' }}>
              <button className="adm-btn" onClick={() => setEditing(null)}>{t('annCancel')}</button>
              <button className="adm-btn primary" onClick={saveNews}>{editing === 'new' ? 'Publier' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal Announcement ---------- */}
      {editingAnn !== null && (
        <div className="adm-modal-bg" onClick={() => setEditingAnn(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>{editingAnn === 'new' ? t('newAnn') : t('editAnn')}</h3>
            <div className="adm-modal-field">
              <label>{t('annFormTitle')}</label>
              <input className="adm-input" value={formAnn.title} onChange={e => setFormAnn({ ...formAnn, title: e.target.value })} />
            </div>
            <div className="adm-modal-field">
              <label>{t('annFormBody')}</label>
              <textarea className="adm-input" rows={4} value={formAnn.body} onChange={e => setFormAnn({ ...formAnn, body: e.target.value })} />
            </div>
            <div className="adm-flex">
              <div className="adm-modal-field" style={{ flex: 1 }}>
                <label>{t('annFormCategory')}</label>
                <select className="adm-select" value={formAnn.category} onChange={e => setFormAnn({ ...formAnn, category: e.target.value })}>
                  <option value="general">{t('annCatGeneral')}</option>
                  <option value="market">{t('annCatMarket')}</option>
                  <option value="feature">{t('annCatFeature')}</option>
                  <option value="event">{t('annCatEvent')}</option>
                </select>
              </div>
              <div className="adm-modal-field" style={{ flex: 1 }}>
                <label>{t('annFormSource')}</label>
                <input className="adm-input" value={formAnn.source} onChange={e => setFormAnn({ ...formAnn, source: e.target.value })} />
              </div>
            </div>
            <div className="adm-modal-field">
              <label>{t('annFormLink')}</label>
              <input className="adm-input" value={formAnn.link_url} onChange={e => setFormAnn({ ...formAnn, link_url: e.target.value })} />
            </div>
            <div className="adm-flex" style={{ marginBottom: 12 }}>
              <label className="adm-flex" style={{ gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={formAnn.active} onChange={e => setFormAnn({ ...formAnn, active: e.target.checked })} />
                {t('annFormActive')}
              </label>
            </div>
            <div className="adm-flex" style={{ justifyContent: 'flex-end' }}>
              <button className="adm-btn" onClick={() => setEditingAnn(null)}>{t('annCancel')}</button>
              <button className="adm-btn primary" onClick={saveAnn}>{t('annSave')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="adm-modal-bg" onClick={() => setConfirmDel(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>{confirmDel.kind === 'news' ? t('deleteNews') : t('deleteConfirm')}</h3>
            <div className="adm-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="adm-btn" onClick={() => setConfirmDel(null)}>{t('annCancel')}</button>
              <button className="adm-btn danger" onClick={confirmDel.kind === 'news' ? delNews : delAnn}>{t('deleteBtn')}</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .spin-icon { animation: spin 0.9s linear infinite; }
      `}</style>
    </AdminLayout>
  )
}
