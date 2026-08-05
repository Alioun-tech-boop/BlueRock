export default function ValuationCard({ valuation }) {
  if (!valuation) return <p className="text-muted text-sm">Aucune donnée</p>

  return (
    <div>
      <div className="grid-2" style={{ gap: '0.75rem' }}>
        <div>
          <div className="text-xs text-muted">Valeur DCF</div>
          <div className="font-bold">{valuation.dcf_value?.toFixed(2) || '-'} XOF</div>
        </div>
        <div>
          <div className="text-xs text-muted">Valeur Graham</div>
          <div className="font-bold">{valuation.graham_value?.toFixed(2) || '-'} XOF</div>
        </div>
        <div>
          <div className="text-xs text-muted">Valeur Buffett</div>
          <div className="font-bold">{valuation.buffett_value?.toFixed(2) || '-'} XOF</div>
        </div>
        <div>
          <div className="text-xs text-muted">Prix Actuel</div>
          <div className="font-bold">{valuation.current_price?.toFixed(2) || '-'} XOF</div>
        </div>
      </div>
      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '0.5rem' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">Prix Cible</div>
            <div className="font-bold" style={{ fontSize: '1.25rem', color: 'var(--accent-cyan)' }}>{valuation.target_price?.toFixed(2) || '-'} XOF</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="text-xs text-muted">Décote</div>
            <div className="font-bold" style={{ fontSize: '1.25rem', color: (valuation.discount_percent || 0) > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {valuation.discount_percent ? `${valuation.discount_percent > 0 ? '+' : ''}${valuation.discount_percent.toFixed(1)}%` : '-'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
