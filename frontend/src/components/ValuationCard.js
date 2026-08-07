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
            <div className="font-bold" style={{ fontSize: '18px', color: '#8E95A3' }}>{valuation.target_price?.toFixed(2) || '-'} XOF</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="text-xs text-muted">Décote</div>
            <div className="font-bold" style={{ fontSize: '16px', fontWeight: 500, color: (valuation.discount_percent || 0) > 0 ? '#18C27C' : '#F04438' }}>
              {valuation.discount_percent ? `${valuation.discount_percent > 0 ? '+' : ''}${valuation.discount_percent.toFixed(1)}%` : '-'}
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .text-xs.text-muted { font-size: 14px; font-weight: 400; color: #9AA3B2; }
        .font-bold { font-size: 18px; font-weight: 700; color: #8E95A3; font-variant-numeric: tabular-nums; }
        p.text-muted.text-sm { font-size: 14px; color: #6B7A94; }
      `}</style>
    </div>
  )
}
