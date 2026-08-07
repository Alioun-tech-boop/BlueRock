import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies, ingestPdf, getIngestionStatements, getMacroLatest } from '../services/api'
import { ArrowLeft, Upload, FileText, Database, CheckCircle2, XCircle, Globe2 } from 'lucide-react'
import { t, detectLang, fmtPrice } from '../lib/i18n'

function fmt(n, lang) {
  return fmtPrice(lang, n, 0)
}

const MACRO_LABELS = {
  inflation: 'inflMacro',
  taux_directeur: 'tauxMacro',
  croissance_pib: 'pibMacro',
  pib_md_fcfa: 'pibMdMacro',
  taux_credit_moyen: 'creditMacro',
  taux_change_eur_xof: 'eurMacro',
}

export default function Donnees() {
  const router = useRouter()
  const [lang] = useState(() => detectLang())
  const fileRef = useRef(null)

  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [fiscalYear, setFiscalYear] = useState('')
  const [quarter, setQuarter] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const [statements, setStatements] = useState([])
  const [loadingStmt, setLoadingStmt] = useState(false)
  const [macro, setMacro] = useState([])

  useEffect(() => {
    getCompanies({ limit: 47 }).then(r => setCompanies(r.data.companies || [])).catch(() => {})
    getMacroLatest().then(r => setMacro(r.data || [])).catch(() => {})
  }, [])

  const loadStatements = () => {
    if (!companyId) return
    setLoadingStmt(true)
    getIngestionStatements(companyId, fiscalYear || undefined)
      .then(r => setStatements(r.data || []))
      .catch(() => setStatements([]))
      .finally(() => setLoadingStmt(false))
  }

  const doUpload = async () => {
    if (!companyId || !fiscalYear || !file) {
      setError(t('ingestRequired'))
      return
    }
    setUploading(true)
    setError(null)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('company_id', companyId)
    fd.append('fiscal_year', fiscalYear)
    if (quarter) fd.append('quarter', quarter)
    try {
      const res = await ingestPdf(fd)
      setResult(res.data)
      loadStatements()
    } catch (e) {
      setError(e.response?.data?.detail || e.message || t('ingestError'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="dt-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div className="dt-title">
            <span>{t('data')}</span>
            <span className="dt-sub">{t('dtSub')}</span>
          </div>
          <div className="icon-btn spacer" />
        </header>

        <div className="card">
          <div className="card-title"><FileText size={15} /> {t('ingestPdfTitle')}</div>
          <div className="form-row">
            <select value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">{t('companyPlaceholder')}</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.symbol} — {c.name?.substring(0, 30)}</option>
              ))}
            </select>
            <input
              type="number" min="2000" max="2030" placeholder={t('year')}
              value={fiscalYear} onChange={e => setFiscalYear(e.target.value)}
            />
            <select value={quarter} onChange={e => setQuarter(e.target.value)}>
              <option value="">{t('annual')}</option>
              <option value="1">T1</option>
              <option value="2">T2</option>
              <option value="3">T3</option>
              <option value="4">T4</option>
            </select>
          </div>

          <div className={`dropzone ${file ? 'has-file' : ''}`} onClick={() => fileRef.current?.click()}>
            <Upload size={22} />
            <span>{file ? file.name : t('dropzone')}</span>
            <input
              ref={fileRef} type="file" accept="application/pdf"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <button className={`upload-btn ${(uploading || !file || !companyId || !fiscalYear) ? 'disabled' : ''}`} onClick={doUpload} disabled={uploading}>
            {uploading ? t('extracting') : t('extractImport')}
          </button>

          {error && (
            <div className="error-box"><XCircle size={14} /> {error}</div>
          )}

          {result && (
            <div className="result-box">
              <div className="result-ok"><CheckCircle2 size={14} /> {t('importOk')}</div>
              <div className="result-grid">
                <div><span>{result.stored?.statements || 0}</span><small>{t('statements')}</small></div>
                <div><span>{result.stored?.line_items || 0}</span><small>{t('lineItems')}</small></div>
                <div><span>{result.ratios_recomputed ? 'OK' : '—'}</span><small>{t('ratios')}</small></div>
                <div><span>{result.detected_scale || '—'}</span><small>{t('scale')}</small></div>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <Database size={15} /> {t('storedStatements')}
            <button className="mini-btn" onClick={loadStatements} disabled={!companyId || loadingStmt}>
              {loadingStmt ? '...' : t('refresh')}
            </button>
          </div>

          {statements.length === 0 && !loadingStmt ? (
            <div className="empty-note">{t('noStatements')}</div>
          ) : (
            statements.map(s => (
              <div key={s.id} className="stmt-block">
                <div className="stmt-head">
                  <span className="stmt-type">{s.type}</span>
                  <span className="stmt-meta">{s.fiscal_year}{s.quarter ? ` · T${s.quarter}` : ''} · {s.currency}</span>
                </div>
                {s.line_items.slice(0, 15).map((li, i) => (
                  <div key={i} className="line-item">
                    <span>{li.account}</span>
                    <span className="li-val">{fmt(li.value, lang)}</span>
                  </div>
                ))}
                {s.line_items.length > 15 && (
                  <div className="stmt-more">+ {s.line_items.length - 15} {t('moreItems')}</div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-title"><Globe2 size={15} /> {t('macroTitle')}</div>
          <div className="macro-grid">
            {macro.map(m => (
              <div key={m.indicator} className="macro-item">
                <span className="macro-name">{t(MACRO_LABELS[m.indicator] || '') || m.indicator}</span>
                <span className="macro-val">{m.value?.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}{m.unit}</span>
                <span className="macro-date">{m.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BottomNav />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #0E1627; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .dt-header {
          display: flex; align-items: center; justify-content: space-between; height: 60px;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .spacer { opacity: 0; }
        .dt-title { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .dt-title span:first-child { font-size: 17px; font-weight: 700; }
        .dt-sub { font-size: 11px; color: #9AA3B2; }
        .card { background: #141414; border-radius: 18px; padding: 16px; margin-bottom: 16px; }
        .card-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 14px; font-weight: 600; margin-bottom: 14px; color: #e0e0e0;
        }
        .form-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .form-row select, .form-row input {
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #fff; font-size: 12px; font-family: inherit; outline: none;
          height: 42px; padding: 0 10px; min-width: 0;
        }
        .form-row select { flex: 2; }
        .form-row input { flex: 1; width: 70px; }
        .dropzone {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          flex-direction: column; text-align: center;
          border: 1px dashed #333; border-radius: 14px;
          padding: 22px 14px; cursor: pointer; margin-bottom: 12px;
          color: #9AA3B2; font-size: 12px;
        }
        .dropzone.has-file { border-color: #18C27C; color: #18C27C; }
        .upload-btn {
          width: 100%; height: 44px;
          background: #8b5cf6; border: none; border-radius: 14px;
          color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .upload-btn.disabled { opacity: 0.4; }
        .error-box {
          display: flex; align-items: center; gap: 8px;
          margin-top: 12px; padding: 10px 12px;
          background: rgba(240,68,56,0.1); color: #ff7b7b;
          border-radius: 12px; font-size: 12px;
        }
        .result-box { margin-top: 12px; }
        .result-ok {
          display: flex; align-items: center; gap: 6px;
          color: #18C27C; font-size: 13px; font-weight: 600; margin-bottom: 10px;
        }
        .result-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .result-grid div {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          background: #1B1B1B; border-radius: 12px; padding: 10px 4px;
        }
        .result-grid span { font-size: 14px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .result-grid small { font-size: 10px; color: #9AA3B2; }
        .mini-btn {
          margin-left: auto; background: #1B1B1B; border: none; border-radius: 10px;
          color: #9AA3B2; font-size: 11px; padding: 5px 12px; cursor: pointer; font-family: inherit;
        }
        .empty-note { color: #666; font-size: 12px; text-align: center; padding: 12px 0; }
        .stmt-block { border: 1px solid #1f1f1f; border-radius: 14px; padding: 12px; margin-bottom: 10px; }
        .stmt-head {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
        }
        .stmt-type { font-size: 12px; font-weight: 700; color: #a78bfa; }
        .stmt-meta { font-size: 11px; color: #666; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .line-item {
          display: flex; justify-content: space-between; gap: 8px;
          padding: 6px 0; border-bottom: 1px solid #1a1a1a;
          font-size: 12px; color: #d0d0d0;
        }
        .line-item:last-child { border-bottom: none; }
        .li-val { font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; color: #fff; text-align: right; }
        .stmt-more { font-size: 11px; color: #666; text-align: center; padding-top: 6px; }
        .macro-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .macro-item {
          display: flex; flex-direction: column; gap: 2px;
          background: #1B1B1B; border-radius: 12px; padding: 10px 12px;
        }
        .macro-name { font-size: 11px; color: #9AA3B2; }
        .macro-val { font-size: 14px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .macro-date { font-size: 10px; color: #666; }
      `}</style>
    </div>
  )
}
