import { useRouter } from 'next/router'

export default function StockTable({ stocks, showSector = false }) {
  const router = useRouter()

  return (
    <table className="tv-table">
      <thead>
        <tr>
          <th>Symbole</th>
          {showSector && <th>Secteur</th>}
          <th className="text-right">Dernier</th>
          <th className="text-right">Var.</th>
          <th className="text-right">Volume</th>
        </tr>
      </thead>
      <tbody>
        {stocks.map((s, i) => {
          const chg = s.change_percent || 0
          const up = chg > 0
          return (
            <tr key={s.symbol || i} className={up ? 'bg-up-row' : chg < 0 ? 'bg-down-row' : ''}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/company?id=${s.id}`)}>
              <td className="font-semibold">{s.symbol}</td>
              {showSector && <td className="c-muted">{s.sector || '—'}</td>}
              <td className="text-right font-mono">
                {s.close_price?.toLocaleString('fr-FR') || s.current_price?.toLocaleString('fr-FR') || '—'}
              </td>
              <td className="text-right">
                <span className={`tv-badge ${up ? 'up' : chg < 0 ? 'down' : 'neutral'}`}>
                  {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                </span>
              </td>
              <td className="text-right font-mono c-muted">
                {s.volume ? (s.volume >= 1e6 ? (s.volume / 1e6).toFixed(1) + 'M' : s.volume >= 1e3 ? (s.volume / 1e3).toFixed(0) + 'k' : s.volume) : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
