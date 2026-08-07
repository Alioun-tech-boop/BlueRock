export default function ScoreCardView({ scorecard }) {
  if (!scorecard) return <p className="text-muted text-sm">Aucune donnée</p>

  const items = [
    { label: 'Rentabilité', value: scorecard.profitability_score, color: 'var(--accent-green)' },
    { label: 'Croissance', value: scorecard.growth_score, color: 'var(--accent-cyan)' },
    { label: 'Endettement', value: scorecard.debt_score, color: 'var(--accent-blue)' },
    { label: 'Liquidité', value: scorecard.liquidity_score, color: 'var(--accent-purple)' },
    { label: 'Valorisation', value: scorecard.valuation_score, color: 'var(--accent-yellow)' },
    { label: 'Moat', value: scorecard.moat_score, color: 'var(--accent-green)' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-muted">Score Global</div>
          <div className="font-bold" style={{ fontSize: '18px', color: '#8E95A3' }}>{scorecard.total_score?.toFixed(1) || '-'}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Rating</div>
          <span className="badge" style={{
            fontSize: '1.1rem', padding: '0.3rem 0.8rem',
            background: scorecard.rating === 'AAA' || scorecard.rating === 'AA' ? 'rgba(34,197,94,0.2)' :
                       scorecard.rating === 'A' || scorecard.rating === 'BBB' ? 'rgba(6,182,212,0.2)' :
                       'rgba(234,179,8,0.2)',
            color: scorecard.rating === 'AAA' || scorecard.rating === 'AA' ? 'var(--accent-green)' :
                   scorecard.rating === 'A' || scorecard.rating === 'BBB' ? 'var(--accent-cyan)' :
                   'var(--accent-yellow)'
          }}>
            {scorecard.rating || '-'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted">{item.label}</span>
              <span className="font-semibold">{item.value?.toFixed(1) || '-'}/10</span>
            </div>
            <div style={{ height: 4, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${((item.value || 0) / 10) * 100}%`,
                height: '100%',
                background: item.color,
                borderRadius: 2,
                transition: 'width 0.5s ease'
              }} />
            </div>
          </div>
        ))}
      </div>
      <style jsx>{`
        .text-xs.text-muted { font-size: 14px; font-weight: 400; color: #9AA3B2; }
        .font-bold { font-size: 18px; font-weight: 700; color: #8E95A3; font-variant-numeric: tabular-nums; }
        .font-semibold { font-size: 14px; font-weight: 500; color: #9AA3B2; font-variant-numeric: tabular-nums; }
        p.text-muted.text-sm { font-size: 14px; color: #6B7A94; }
      `}</style>
    </div>
  )
}
