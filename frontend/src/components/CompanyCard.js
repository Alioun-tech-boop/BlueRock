import { useRouter } from 'next/router'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import { detectLang, fmtPriceCur } from '../lib/i18n'

export default function CompanyCard({ company }) {
  const router = useRouter()
  const chg = company.change_percent || 0
  const up = chg > 0

  return (
    <div className="company-card" onClick={() => router.push(`/company?id=${company.id}`)}>
      <div className="card-header">
        {company.logo_url ? (
          <img
            src={company.logo_url} alt="" className="card-logo"
            onLoad={e => applyLogoBackground(e.currentTarget, e.currentTarget)}
            onError={onLogoError}
          />
        ) : (
          <div className="card-logo-fallback">{company.symbol?.[0]}</div>
        )}
        <div>
          <div className="card-title">{company.symbol}</div>
          <div className="card-subtitle">{company.name?.substring(0, 40)}</div>
        </div>
      </div>
      <div className="card-row">
        <span className="c-muted">Prix</span>
        <span className="val">{fmtPriceCur(detectLang(), company.current_price, company.currency)}</span>
      </div>
      <div className="card-row">
        <span className="c-muted">Variation</span>
        <span className={`val ${up ? 'c-green' : 'c-red'}`}>
          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
        </span>
      </div>
      <div className="card-row">
        <span className="c-muted">Volume</span>
        <span className="val c-muted">{company.volume?.toLocaleString('fr-FR') || '—'}</span>
      </div>
      {company.sector && (
        <div className="card-row">
          <span className="c-muted">Secteur</span>
          <span className="val c-muted" style={{ fontSize: 12 }}>{company.sector}</span>
        </div>
      )}
    </div>
  )
}
