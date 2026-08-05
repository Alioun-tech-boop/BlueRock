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
    </div>
  )
}
