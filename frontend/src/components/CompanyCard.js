import { useRouter } from 'next/router'

export default function CompanyCard({ company }) {
  const router = useRouter()
  const chg = company.change_percent || 0
  const up = chg > 0

  return (
    <div className="company-card" onClick={() => router.push(`/company?id=${company.id}`)}>
      <div className="card-header">
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="card-logo" />
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
        <span className="val">{company.current_price?.toLocaleString('fr-FR') || '—'}</span>
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
