import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminChallenges, adminChallengeCreate, adminChallengeUpdate, adminChallengeDelete } from '../services/api'
import { t } from '../lib/i18n'
import { Plus, Trash2, Pencil } from 'lucide-react'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function toInputDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const EMPTY = { name:'', tagline:'', description:'', status:'upcoming', start_date:'', end_date:'', registration_end:'', prize_pool:0, entry_fee:0, max_participants:0, starting_capital:10000000, is_featured:false, prizes:'', rules:''}
const statusBadge = { upcoming:'gray', open:'green', live:'amber', ended:'gray' }

export default function ChallengesPage(){
  const [rows,setRows]=useState(null)
  const [flash,setFlash]=useState('')
  const [flashErr,setFlashErr]=useState(false)
  const [modalOpen,setModalOpen]=useState(false)
  const [editing,setEditing]=useState(null)
  const [form,setForm]=useState(EMPTY)
  const [confirmDel,setConfirmDel]=useState(null)

  const load=useCallback(()=>{ adminChallenges().then(r=>setRows(r.data.items||[])).catch(()=>setRows([]))},[])
  useEffect(()=>{load()},[load])
  const showFlash=(m,e=false)=>{ setFlash(m); setFlashErr(e); setTimeout(()=>setFlash(''),2400)}

  const openCreate=()=>{ setEditing(null); setForm(EMPTY); setModalOpen(true)}
  const openEdit=(c)=>{ setEditing(c); setForm({ name:c.name||'', tagline:c.tagline||'', description:c.description||'', status:c.status||'upcoming', start_date:toInputDate(c.start_date), end_date:toInputDate(c.end_date), registration_end:toInputDate(c.registration_end), prize_pool:c.prize_pool||0, entry_fee:c.entry_fee||0, max_participants:c.max_participants||0, starting_capital:c.starting_capital||10000000, is_featured:!!c.is_featured, prizes:c.prizes||'', rules:c.rules||''}); setModalOpen(true) }

  const submit=()=>{
    if(!form.name.trim()){ showFlash('Nom requis',true); return}
    const payload={ ...form, name:form.name.trim(), start_date: form.start_date ? new Date(form.start_date).toISOString():null, end_date: form.end_date ? new Date(form.end_date).toISOString():null, registration_end: form.registration_end ? new Date(form.registration_end).toISOString():null, prize_pool:Number(form.prize_pool)||0, entry_fee:Number(form.entry_fee)||0, max_participants:parseInt(form.max_participants||0,10)||0, starting_capital:Number(form.starting_capital)||10000000 }
    const call= editing ? adminChallengeUpdate(editing.id, payload) : adminChallengeCreate(payload)
    call.then(()=>{ setModalOpen(false); setEditing(null); setForm(EMPTY); load(); showFlash(editing?'Défi mis à jour':'Défi créé')}).catch(e=>showFlash(e?.response?.data?.detail||t('loadError'),true))
  }
  const del=()=>{ adminChallengeDelete(confirmDel).then(()=>{ setConfirmDel(null); load(); showFlash('Défi supprimé')}).catch(()=>showFlash(t('loadError'),true)) }

  return (
    <AdminLayout title="Défis" sub="Toute la gestion des challenges se fait ici — les utilisateurs ne peuvent plus créer de défis côté plateforme.">
      <div className="adm-panel">
        <div className="head">
          <span className="title">Défis · <span className="adm-muted" style={{fontWeight:500}}>{rows? `${rows.length} au total`:'…'}</span></span>
          <div className="actions"><button className="adm-btn green" onClick={openCreate}><Plus size={15}/>Créer un défi</button></div>
        </div>
        {!rows ? <div className="adm-loading"><span className="spinner"/>…</div> : rows.length===0 ? <div className="adm-empty">Aucun défi</div> : (
          <table className="adm-table">
            <thead><tr><th>Nom</th><th>Statut</th><th>Début</th><th>Fin</th><th>Prix</th><th>Frais</th><th>Vedette</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map(c=>(
                <tr key={c.id}>
                  <td style={{fontWeight:700}}>{c.name}<div className="adm-muted" style={{fontSize:12}}>{c.tagline||'—'}</div></td>
                  <td><span className={`adm-badge ${statusBadge[c.status]||'gray'}`}>{c.status}</span></td>
                  <td className="adm-muted">{fmtDate(c.start_date)}</td>
                  <td className="adm-muted">{fmtDate(c.end_date)}</td>
                  <td className="adm-muted">{(c.prize_pool||0).toLocaleString('fr-FR')} FCFA</td>
                  <td className="adm-muted">{(c.entry_fee||0).toLocaleString('fr-FR')}</td>
                  <td>{c.is_featured?'⭐':'—'}</td>
                  <td><div className="adm-flex" style={{flexWrap:'nowrap'}}><button className="adm-btn" onClick={()=>openEdit(c)}><Pencil size={14}/></button><button className="adm-btn danger" onClick={()=>setConfirmDel(c.id)}><Trash2 size={14}/></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {flash && <div className={`adm-flash ${flashErr?'err':''}`}>{flash}</div>}
      {modalOpen && (
        <div className="adm-modal-bg" onClick={()=>{setModalOpen(false); setEditing(null)}}>
          <div className="adm-modal" onClick={e=>e.stopPropagation()} style={{maxWidth:720}}>
            <h3>{editing ? 'Modifier le défi' : 'Créer un défi'}</h3>
            <div className="adm-modal-field"><label>Nom *</label><input className="adm-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} maxLength={160} placeholder="Ex : Défi BRVM 2025"/></div>
            <div className="adm-modal-field"><label>Slogan (tagline)</label><input className="adm-input" value={form.tagline} onChange={e=>setForm({...form,tagline:e.target.value})} maxLength={300} placeholder="Affrontez les meilleurs traders..."/></div>
            <div className="adm-modal-field"><label>Description</label><textarea className="adm-input" rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Description détaillée..." /></div>
            <div className="adm-flex">
              <div className="adm-modal-field" style={{flex:1}}><label>Statut</label><select className="adm-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="upcoming">upcoming</option><option value="open">open</option><option value="live">live</option><option value="ended">ended</option></select></div>
              <div className="adm-modal-field" style={{flex:1, display:'flex', alignItems:'center', gap:8}}><label style={{display:'flex', alignItems:'center', gap:6, cursor:'pointer'}}><input type="checkbox" checked={form.is_featured} onChange={e=>setForm({...form,is_featured:e.target.checked})}/> Vedette</label></div>
            </div>
            <div className="adm-flex">
              <div className="adm-modal-field" style={{flex:1}}><label>Début</label><input className="adm-input" type="datetime-local" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></div>
              <div className="adm-modal-field" style={{flex:1}}><label>Fin</label><input className="adm-input" type="datetime-local" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></div>
              <div className="adm-modal-field" style={{flex:1}}><label>Fin inscriptions</label><input className="adm-input" type="datetime-local" value={form.registration_end} onChange={e=>setForm({...form,registration_end:e.target.value})}/></div>
            </div>
            <div className="adm-flex">
              <div className="adm-modal-field" style={{flex:1}}><label>Prix total (FCFA)</label><input className="adm-input mono" type="number" value={form.prize_pool} onChange={e=>setForm({...form,prize_pool:e.target.value})}/></div>
              <div className="adm-modal-field" style={{flex:1}}><label>Frais entrée (FCFA)</label><input className="adm-input mono" type="number" value={form.entry_fee} onChange={e=>setForm({...form,entry_fee:e.target.value})}/></div>
              <div className="adm-modal-field" style={{flex:1}}><label>Max participants (0=illimité)</label><input className="adm-input mono" type="number" value={form.max_participants} onChange={e=>setForm({...form,max_participants:e.target.value})}/></div>
              <div className="adm-modal-field" style={{flex:1}}><label>Capital départ (FCFA)</label><input className="adm-input mono" type="number" value={form.starting_capital} onChange={e=>setForm({...form,starting_capital:e.target.value})}/></div>
            </div>
            <div className="adm-modal-field"><label>Règles (JSON ou une par ligne)</label><textarea className="adm-input" rows={2} value={form.rules} onChange={e=>setForm({...form,rules:e.target.value})} placeholder='["Règle 1","Règle 2"] ou texte libre'/></div>
            <div className="adm-modal-field"><label>Prix (JSON)</label><textarea className="adm-input" rows={2} value={form.prizes} onChange={e=>setForm({...form,prizes:e.target.value})} placeholder='[{"rank":1,"amount":500000}]'/></div>
            <div className="adm-flex" style={{justifyContent:'flex-end'}}><button className="adm-btn" onClick={()=>{setModalOpen(false); setEditing(null)}}>{t('annCancel')}</button><button className="adm-btn primary" onClick={submit}>{editing?'Mettre à jour':'Créer'}</button></div>
          </div>
        </div>
      )}
      {confirmDel!=null && (
        <div className="adm-modal-bg" onClick={()=>setConfirmDel(null)}>
          <div className="adm-modal" onClick={e=>e.stopPropagation()}>
            <h3>Supprimer ce défi ?</h3>
            <p className="adm-muted" style={{fontSize:13}}>Les participations seront supprimées.</p>
            <div className="adm-flex" style={{justifyContent:'flex-end', marginTop:14}}><button className="adm-btn" onClick={()=>setConfirmDel(null)}>{t('annCancel')}</button><button className="adm-btn danger" onClick={del}>{t('deleteBtn')}</button></div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
