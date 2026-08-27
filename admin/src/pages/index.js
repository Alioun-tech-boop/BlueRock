import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { adminStats, adminStatsTrend } from '../services/api'
import { Sparkline, AreaChart } from '../components/Charts'
import { t } from '../lib/i18n'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [trend, setTrend] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    Promise.all([adminStats().then(r => r.data), adminStatsTrend(30).then(r => r.data)])
      .then(([s, tr]) => { setStats(s); setTrend(tr) })
      .catch(() => setErr(true))
  }, [])

  if (err) return <AdminLayout title={t('dashTitle')} sub={t('dashSub')}><div className="adm-empty">{t('loadError')}</div></AdminLayout>
  if (!stats || !trend) return <AdminLayout title={t('dashTitle')} sub={t('dashSub')}><div className="adm-loading"><span className="spinner" />…</div></AdminLayout>

  const series = trend.series || []
  const pick = (k) => series.map(s => s[k] || 0)
  const delta = (k) => {
    const v = pick(k)
    if (v.length < 2) return 0
    const a = v[v.length - 1], b = v[0] || 1
    return b === 0 ? 0 : Math.round(((a - b) / b) * 100)
  }

  const cards = [
    { k: t('usersTitle'), v: stats.users, spark: pick('users'), dot: '#6E8BFF' },
    { k: t('banBtn') + 's', v: stats.banned_users, spark: null, red: stats.banned_users > 0, color: 'var(--red)' },
    { k: t('postsTitle'), v: stats.posts, spark: pick('posts'), dot: '#1FD996' },
    { k: t('hiddenTag'), v: stats.hidden_posts, spark: null, amber: stats.hidden_posts > 0, color: 'var(--amber)' },
    { k: t('groupsTitle'), v: stats.groups, spark: pick('groups'), dot: '#38D6E8' },
    { k: t('newsTitle'), v: stats.news, spark: null },
    { k: t('annTitle'), v: stats.active_announcements, green: true, color: 'var(--green)' },
    { k: t('kycVerified'), v: stats.kyc?.verified || 0, spark: pick('kyc'), dot: '#FFB23E' },
  ]

  return (
    <AdminLayout title={t('dashTitle')} sub={t('dashSub')}>
      <div className="adm-cards">
        {cards.map((c, i) => (
          <div className="adm-card" key={i}>
            <div className="k"><span className="dot" style={{ background: c.dot || c.color || 'var(--blue)' }} />{c.k}</div>
            <div className="v" style={{ color: c.color }}>{c.v?.toLocaleString('fr-FR')}</div>
            {c.spark ? <Sparkline values={c.spark} color={c.dot} /> : null}
          </div>
        ))}
      </div>

      <div className="adm-panel">
        <div className="head">
          <div className="title"><span className="ic">📈</span>Croissance de la plateforme · 30 jours</div>
          <div className="adm-flex">
            {[{ k: 'users', label: 'Utilisateurs', d: delta('users') }, { k: 'posts', label: 'Publications', d: delta('posts') }, { k: 'kyc', label: 'KYC', d: delta('kyc') }].map(x => (
              <span key={x.k} className="adm-badge gray">{x.label} <b style={{ color: x.d >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>{x.d >= 0 ? '+' : ''}{x.d}%</b></span>
            ))}
          </div>
        </div>
        <AreaChart series={series} days={trend.days} />
      </div>

      {stats.kyc && (
        <div className="adm-panel">
          <div className="head"><div className="title"><span className="ic">🛡️</span>{t('kycTitle')}</div></div>
          <div className="adm-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', margin: 0, padding: 16 }}>
            {Object.entries(stats.kyc).map(([k, v]) => (
              <div className="adm-card" key={k} style={{ padding: 12 }}>
                <div className="k">{k.replace(/_/g, ' ')}</div>
                <div className="v" style={{ fontSize: 20 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
