export default function StatCard({ label, value, change, positive, accent = 'blue' }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {change != null && (
        <div className={`stat-change ${positive ? 'positive' : 'negative'}`}>
          {change}
        </div>
      )}
      <style jsx>{`
        .stat-label { font-size: 14px; font-weight: 400; color: #9AA3B2; }
        .stat-value { font-size: 18px; font-weight: 700; color: #8E95A3; font-variant-numeric: tabular-nums; }
        .stat-change { font-size: 16px; font-weight: 500; }
        .stat-change.positive { color: #18C27C; }
        .stat-change.negative { color: #F04438; }
      `}</style>
    </div>
  )
}
