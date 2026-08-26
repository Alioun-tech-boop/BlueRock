import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import {
  Send, Save, X, FileText, ImagePlus, FileUp, Link2, Tag, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import {
  createCommunityPost, saveCommunityDraft, publishCommunityDraft,
} from '../../services/api'

const SENTIMENTS = ['bullish', 'bearish', 'neutral']

function initialsOf(name) {
  return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const EMPTY = { symbol: '', sentiment: 'bullish', title: '', content: '', link_url: '', link_title: '' }

export default function Composer({ lang, me, onPublished, groupId = null, fullPage = false, onGoFull, onCancel }) {
  const router = useRouter()
  const [f, setF] = useState(EMPTY)
  const [flash, setFlash] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [draftId, setDraftId] = useState(null)
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState('')
  const [docFile, setDocFile] = useState(null)

  const symRef = useRef(null)
  const mediaRef = useRef(null)
  const docRef = useRef(null)
  const linkRef = useRef(null)

  const show = (msg) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2600)
  }

  const goCompose = () => {
    if (!me) return
    if (onGoFull) { onGoFull(); return }
    router.push(groupId ? `/community/compose?group=${groupId}` : '/community/compose')
  }

  const saveDraft = () => {
    if (publishing) return
    saveCommunityDraft({
      symbol: f.symbol.trim().toUpperCase(), sentiment: f.sentiment,
      title: f.title.trim(), content: f.content.trim(),
      link_url: f.link_url.trim(), link_title: f.link_title.trim(),
      group_id: groupId || undefined,
    })
      .then(r => { setDraftId(r.data.id); show(t(lang, 'cDraftSaved')) })
      .catch(() => show(t(lang, 'cDeleteError')))
  }

  const pickMedia = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (mediaPreview) try { URL.revokeObjectURL(mediaPreview) } catch {}
    setMediaFile(file)
    setMediaPreview(URL.createObjectURL(file))
  }

  // Cleanup blob URL on unmount or preview change
  useEffect(() => () => { if (mediaPreview) try { URL.revokeObjectURL(mediaPreview) } catch {} }, [mediaPreview])

  const reset = () => {
    setFlash('')
    setDraftId(null)
    if (mediaPreview) try { URL.revokeObjectURL(mediaPreview) } catch {}
    setMediaFile(null)
    setMediaPreview('')
    setDocFile(null)
    setF(EMPTY)
  }

  const publish = () => {
    if (publishing) return
    if (!f.symbol.trim() || f.title.trim().length < 2) {
      show(t(lang, 'cDeleteError'))
      return
    }
    setPublishing(true)
    const done = () => {
      reset()
      if (onPublished) onPublished()
    }
    if (draftId) {
      const fd = new FormData()
      // Envoi complet pour préserver éditions après saveDraft
      fd.append('symbol', f.symbol.trim().toUpperCase())
      fd.append('sentiment', f.sentiment)
      fd.append('title', f.title.trim())
      fd.append('content', f.content.trim())
      fd.append('link_url', f.link_url.trim())
      fd.append('link_title', f.link_title.trim() || f.link_url.trim())
      if (groupId) fd.append('group_id', groupId)
      if (mediaFile) fd.append('media', mediaFile)
      if (docFile) fd.append('file', docFile)
      publishCommunityDraft(draftId, fd)
        .then(done)
        .catch(err => show(typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : t(lang, 'cDeleteError')))
        .finally(() => setPublishing(false))
      return
    }
    const fd = new FormData()
    fd.append('symbol', f.symbol.trim().toUpperCase())
    fd.append('sentiment', f.sentiment)
    fd.append('title', f.title.trim())
    fd.append('content', f.content.trim())
    if (groupId) fd.append('group_id', groupId)
    if (mediaFile) fd.append('media', mediaFile)
    if (docFile) fd.append('file', docFile)
    if (f.link_url.trim()) {
      fd.append('link_url', f.link_url.trim())
      fd.append('link_title', f.link_title.trim() || f.link_url.trim())
    }
    createCommunityPost(fd)
      .then(done)
      .catch(err => show(typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : t(lang, 'cDeleteError')))
      .finally(() => setPublishing(false))
  }

  if (!me) {
    return <div className="comp-login-hint">{t(lang, 'cLoginRequired')}</div>
  }

  const sentIcon = (s) => s === 'bullish' ? <TrendingUp size={13} /> : s === 'bearish' ? <TrendingDown size={13} /> : <Minus size={13} />

  const formBody = (
    <>
      {flash && <div className={`comp-flash ${flash === t(lang, 'cDraftSaved') ? 'ok' : 'err'}`}>{flash}</div>}
      {draftId && <span className="comp-draft"><FileText size={12} />{t(lang, 'cDraft')} #{draftId}</span>}

      <div className="comp-frow">
        <input
          ref={symRef}
          className="comp-field"
          placeholder={t(lang, 'cPickSymbol')}
          value={f.symbol}
          onChange={e => setF(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
          maxLength={8}
        />
        <div className="comp-sent-row">
          {SENTIMENTS.map(s => (
            <button
              key={s}
              className={`comp-sent ${s} ${f.sentiment === s ? 'on' : ''}`}
              onClick={() => setF(prev => ({ ...prev, sentiment: s }))}
            >
              {sentIcon(s)}{t(lang, s === 'neutral' ? 'cSentiment' : 'c' + s[0].toUpperCase() + s.slice(1))}
            </button>
          ))}
        </div>
      </div>

      <input
        className="comp-field"
        placeholder={t(lang, 'cTitlePlaceholder')}
        value={f.title}
        onChange={e => setF(prev => ({ ...prev, title: e.target.value }))}
        maxLength={120}
      />
      <textarea
        className="comp-field"
        placeholder={t(lang, 'cContentPlaceholder')}
        value={f.content}
        onChange={e => setF(prev => ({ ...prev, content: e.target.value }))}
        maxLength={3000}
        rows={fullPage ? 10 : 4}
      />
      <input
        ref={linkRef}
        className="comp-field"
        placeholder={t(lang, 'cLinkUrl')}
        value={f.link_url}
        onChange={e => setF(prev => ({ ...prev, link_url: e.target.value }))}
        style={{ display: 'none' }}
      />

      {mediaPreview && (
        mediaFile && mediaFile.type.startsWith('video/')
          ? <video className="comp-prev" src={mediaPreview} controls muted />
          : <img className="comp-prev" src={mediaPreview} alt="" />
      )}

      <div className="comp-chips">
        <button type="button" className="comp-chip" onClick={() => symRef.current && symRef.current.focus()}>
          <Tag size={14} />{t(lang, 'coChipAnalyse')}
        </button>
        <button type="button" className="comp-chip" onClick={() => mediaRef.current && mediaRef.current.click()}>
          <ImagePlus size={14} />{t(lang, 'coChipMedia')}
        </button>
        <button type="button" className="comp-chip" onClick={() => docRef.current && docRef.current.click()}>
          <FileUp size={14} />{t(lang, 'coChipFile')}
        </button>
        <button type="button" className="comp-chip" onClick={() => linkRef.current && linkRef.current.focus()}>
          <Link2 size={14} />{t(lang, 'coChipLink')}
        </button>
      </div>

      <input ref={mediaRef} type="file" accept="image/*,video/*" hidden onChange={pickMedia} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" hidden
        onChange={e => setDocFile(e.target.files && e.target.files[0] || null)} />

      {(mediaFile || docFile) && (
        <div className="comp-frow">
          <button type="button" className="comp-btn" onClick={() => { if (mediaPreview) try { URL.revokeObjectURL(mediaPreview) } catch {}; setMediaFile(null); setMediaPreview(''); setDocFile(null) }}>
            <X size={14} />{(mediaFile || docFile).name}
          </button>
        </div>
      )}

      <div className="comp-frow end">
        <button type="button" className="comp-btn" onClick={() => (onCancel ? onCancel() : router.push('/community'))}>
          <X size={14} />{t(lang, 'cCancel')}
        </button>
        <button type="button" className="comp-btn" onClick={saveDraft} disabled={publishing}>
          <Save size={14} />{t(lang, 'cSaveDraft')}
        </button>
        <button type="button" className="comp-btn primary" onClick={publish} disabled={publishing || !f.symbol.trim() || f.title.trim().length < 2}>
          {draftId ? <><FileText size={15} />{t(lang, 'cPublishFromDraft')}</> : <><Send size={15} />{t(lang, 'cPublish')}</>}
        </button>
      </div>
    </>
  )

  if (fullPage) {
    return (
      <div className="comp-root full">
        <div className="comp-open">
          {formBody}
        </div>
      </div>
    )
  }

  return (
    <div className="comp-root">
      <div className="comp-bar">
        <span className="comp-ava" style={{ background: me.avatar_color || '#fff' }}>
          {initialsOf(me.display_name)}
        </span>
        <button className="comp-pill" onClick={goCompose} tabIndex={0}>
          {t(lang, 'cWritePost')}…
        </button>
      </div>
    </div>
  )
}