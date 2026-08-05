import { useRouter } from 'next/router'

export default function TopPerformers({ performers = [] }) {
  const router = useRouter()
  return (
    <div>
      {performers.slice(0, 5).map((p, i) => (
        <div key={p.symbol || i} className="flex items-center justify-between p-2"
             style={{ borderBottom: i < Math.min(performers.length, 5) - 1 ? '1px solid var(--tv-divider)' : 'none', cursor: 'pointer' }}
             onClick={() => router.push(`/company?id=${p.id}`)}>
          <div className="flex items-center gap-2">
            {p.logo_url ? (
              <img src={p.logo_url} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--tv-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--tv-text-secondary)' }}>{p.symbol?.[0]}</div>
            )}
            <span className="text-sm font-semibold">{p.symbol}</span>
            <span className="text-xs c-muted">{p.rating || '—'}</span>
          </div>
          <span className="font-mono text-sm" style={{ color: p.total_score >= 7 ? 'var(--tv-green)' : p.total_score >= 5 ? 'var(--tv-yellow)' : 'var(--tv-text-secondary)' }}>
            {p.total_score?.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  )
}
