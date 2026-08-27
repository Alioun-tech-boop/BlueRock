import { useCallback, useEffect, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminPosts, adminPostHide, adminPostUnhide, adminPostDelete } from '../services/api'
import Pager from '../components/Pager'
import { t } from '../lib/i18n'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const sentColor = { bullish: 'green', bearish: 'red', neutral: 'amber' }
const sentLabel = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutre' }

const PAGE = 20

export default function PostsPage() {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [hiddenOnly, setHiddenOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [flash, setFlash] = useState('')
  const [flashErr, setFlashErr] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [detail, setDetail] = useState(null)
  const debounce = useRef(null)
  const timer = useRef(null)

  const load = useCallback(() => {
    const params = { limit: PAGE, offset: page * PAGE }
    if (q.trim()) params.q = q.trim()
    if (hiddenOnly) params.hidden = true
    adminPosts(params)
      .then(r => { setRows(r.data.items); setTotal(r.data.total) })
      .catch(() => setRows([]))
  }, [q, hiddenOnly, page])

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

  const hide = (id) => adminPostHide(id).then(() => { load(); showFlash(t('done')) }).catch(() => showFlash(t('loadError'), true))
  const unhide = (id) => adminPostUnhide(id).then(() => { load(); showFlash(t('done')) }).catch(() => showFlash(t('loadError'), true))
  const doDelete = () => {
    if (confirmDel == null) return
    adminPostDelete(confirmDel).then(() => { setConfirmDel(null); load(); showFlash(t('done')) }).catch(() => showFlash(t('loadError'), true))
  }

  return (
    <AdminLayout title={t('postsTitle')} sub={t('postsSub')}>
      <div className="adm-panel">
        <div className="head">
          <span className="title">{t('postsTitle')} · <span className="adm-muted" style={{ fontWeight: 500 }}>{t('rowsTotal')(total)}</span></span>
          <div className="actions">
            <input className="adm-input" style={{ width: 240 }} placeholder={t('searchPh')} value={q} onChange={e => onSearch(e.target.value)} />
            <button className={`adm-btn ${hiddenOnly ? 'primary' : ''}`} onClick={() => { setHiddenOnly(v => !v); setPage(0); setRows(null) }}>{t('onlyHidden')}</button>
          </div>
        </div>

        {!rows ? <div className="adm-loading"><span className="spinner" />…</div> : rows.length === 0 ? (
          <div className="adm-empty">{t('noResults')}</div>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('thTitle')}</th>
                <th>{t('thAuthor')}</th>
                <th>{t('thGroup')}</th>
                <th>{t('thSymbol')}</th>
                <th>{t('thSent')}</th>
                <th>{t('thViews')}</th>
                <th>{t('thVisible')}</th>
                <th>{t('thDate')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="row-btn" onClick={() => setDetail(p)}>
                  <td style={{ maxWidth: 300 }}>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    {p.content && <div className="adm-muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{p.content}</div>}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.author_name}</div>
                    <div className="adm-muted" style={{ fontSize: 10.5 }}>#{p.author_id}</div>
                  </td>
                  <td>{p.group_name || <span className="adm-muted">—</span>}</td>
                  <td><b>{p.symbol}</b></td>
                  <td>{p.sentiment && <span className={`adm-badge ${sentColor[p.sentiment] || 'gray'}`}>{sentLabel[p.sentiment]}</span>}</td>
                  <td className="adm-muted">{p.views}</td>
                  <td>
                    {p.hidden
                      ? <span className="adm-badge amber">{t('hiddenTag')}</span>
                      : <span className="adm-badge green">{t('shownTag')}</span>}
                  </td>
                  <td className="adm-muted">{fmtDate(p.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="adm-flex" style={{ flexWrap: 'nowrap' }}>
                      {p.hidden
                        ? <button className="adm-btn green" onClick={() => unhide(p.id)}>{t('unhideBtn')}</button>
                        : <button className="adm-btn" onClick={() => hide(p.id)}>{t('hideBtn')}</button>}
                      <button className="adm-btn danger" onClick={() => setConfirmDel(p.id)}>{t('deleteBtn')}</button>
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

      {detail && (
        <div className="adm-modal-bg" onClick={() => setDetail(null)}>
          <div className="adm-modal wide" onClick={e => e.stopPropagation()}>
            <h3>Publication #{detail.id}</h3>
            <div className="kv"><span className="k">Auteur</span><span className="v">{detail.author_name} · #{detail.author_id}</span></div>
            <div className="kv"><span className="k">Symbole</span><span className="v">{detail.symbol || '—'}</span></div>
            <div className="kv"><span className="k">Sentiment</span><span className="v">{detail.sentiment ? sentLabel[detail.sentiment] : '—'}</span></div>
            <div className="kv"><span className="k">Vues</span><span className="v">{detail.views}</span></div>
            <div className="kv"><span className="k">Visibilité</span><span className="v">{detail.hidden ? 'Masquée' : 'Visible'}</span></div>
            <div className="kv"><span className="k">Date</span><span className="v">{fmtDate(detail.created_at)}</span></div>
            <div className="adm-modal-field" style={{ marginTop: 12 }}>
              <label>Contenu</label>
              <div className="adm-post-body">{detail.content || detail.title}</div>
            </div>
            <div className="status-actions">
              {detail.hidden
                ? <button className="adm-btn green" onClick={() => { unhide(detail.id); setDetail(null) }}>{t('unhideBtn')}</button>
                : <button className="adm-btn" onClick={() => { hide(detail.id); setDetail(null) }}>{t('hideBtn')}</button>}
              <a className="adm-btn" href={`/community/post/${detail.id}`} target="_blank" rel="noreferrer">Voir sur le site</a>
              <button className="adm-btn danger" onClick={() => { setConfirmDel(detail.id); setDetail(null) }}>{t('deleteBtn')}</button>
              <button className="adm-btn" onClick={() => setDetail(null)}>{t('annCancel')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel != null && (
        <div className="adm-modal-bg" onClick={() => setConfirmDel(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>{t('deleteConfirm')}<div className="adm-muted" style={{ fontWeight: 500, marginTop: 4 }}>#{confirmDel}</div></h3>
            <div className="adm-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="adm-btn" onClick={() => setConfirmDel(null)}>{t('annCancel')}</button>
              <button className="adm-btn danger" onClick={doDelete}>{t('deleteBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
