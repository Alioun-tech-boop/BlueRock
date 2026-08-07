export default function FinancialTable({ financials }) {
  if (!financials || financials.length === 0) return <p className="text-muted text-sm" style={{ padding: '1.5rem' }}>Aucun état financier disponible</p>

  return (
    <div>
      {financials.map((stmt, i) => (
        <div key={i} style={{ borderBottom: i < financials.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
          <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="font-semibold text-sm">{stmt.statement_type}</span>
            <span className="text-xs text-muted">{stmt.fiscal_year}{stmt.quarter ? ` Q${stmt.quarter}` : ''}</span>
          </div>
          {stmt.line_items?.length > 0 ? (
            <table className="table">
              <tbody>
                {stmt.line_items.map((item, j) => (
                  <tr key={j}>
                    <td style={{ paddingLeft: '2rem', fontSize: '14px' }}>{item.account_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {typeof item.value === 'number' ? item.value.toLocaleString('fr-FR', { minimumFractionDigits: 0 }) : item.value} XOF
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted text-xs" style={{ padding: '1rem' }}>Aucune ligne disponible</p>
          )}
        </div>
      ))}
      <style jsx>{`
        .font-semibold.text-sm { font-size: 14px; font-weight: 600; color: #F2F4F7; }
        span.text-muted.text-xs { font-size: 14px; color: #9AA3B2; }
        p.text-muted.text-sm { font-size: 14px; color: #6B7A94; }
        p.text-muted.text-xs { font-size: 14px; color: #6B7A94; }
        .table td { font-size: 14px; font-weight: 400; color: #9AA3B2; }
      `}</style>
    </div>
  )
}
