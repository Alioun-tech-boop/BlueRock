import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Rocket, Repeat2, Eye, PenLine, MessageCircle, BadgeCheck, Crown,
  ChevronRight, TrendingUp, Activity, ArrowRight,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import { getCommunityMe } from '../../services/api'
import TriLoader from '../TriLoader'
import { PhotoAvatar } from '../../lib/photo'

const fmt = (n, lang) => (n ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')
const fmtC = (n, lang) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
    .format(n ?? 0)

function relTime(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const fm = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' })
  return fm.format(d)
}

function monthShort(d, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { month: 'short', year: '2-digit' }).format(d)
}
function dayShort(d, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' }).format(d)
}

function buildSeries(posts, period, lang) {
  if (period === '30d') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const days = []
    const idx = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(start)
      d.setDate(start.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      idx[key] = days.length
      days.push({ key, label: dayShort(d, lang), views: 0, rockets: 0, count: 0 })
    }
    posts.forEach(p => {
      const d = new Date(p.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const i = idx[key]
      if (i == null) return
      days[i].views += p.views || 0
      days[i].rockets += p.rockets || 0
      days[i].count += 1
    })
    return { labels: days.map(x => x.label), views: days.map(x => x.views), rockets: days.map(x => x.rockets), counts: days.map(x => x.count) }
  }
  const map = new Map()
  posts.forEach(p => {
    const d = new Date(p.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const e = map.get(key) || { label: monthShort(d, lang), views: 0, rockets: 0, count: 0 }
    e.views += p.views || 0
    e.rockets += p.rockets || 0
    e.count += 1
    map.set(key, e)
  })
  const arr = [...map.values()]
  return { labels: arr.map(e => e.label), views: arr.map(e => e.views), rockets: arr.map(e => e.rockets), counts: arr.map(e => e.count) }
}

function AudienceChart({ series, lang }) {
  const [hover, setHover] = useState(null)
  const W = 720
  const H = 250
  const L = 46
  const R = 14
  const T = 20
  const B = 34
  const plotW = W - L - R
  const plotH = H - T - B
  const n = series.views.length
  const maxV = Math.max(1, ...series.views)
  const x = i => (n === 1 ? L + plotW / 2 : L + (i * plotW) / (n - 1))
  const y = v => T + (1 - v / maxV) * plotH
  const bottom = T + plotH

  const areaPath = `M ${x(0)} ${bottom}` +
    series.views.map((v, i) => ` L ${x(i)} ${y(v)}`).join('') +
    ` L ${x(n - 1)} ${bottom} Z`
  const linePath = series.rockets
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`)
    .join(' ')

  const grids = [0, 0.33, 0.66, 1]
  const labelStep = Math.ceil(n / 7)
  const hoverIdx = hover == null ? null : Math.max(0, Math.min(n - 1, hover))

  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - L) / plotW) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="mp2-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
      >
        <defs>
          <linearGradient id="mp2Area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#E4E5EA" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#E4E5EA" stopOpacity="0" />
          </linearGradient>
        </defs>

        {grids.map(g => {
          const gy = T + g * plotH
          return (
            <g key={g}>
              <line x1={L} x2={W - R} y1={gy} y2={gy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={L - 8} y={gy + 3} textAnchor="end" fontSize="10" fill="rgba(160,175,200,0.45)">
                {fmtC(maxV * (1 - g), lang)}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill="url(#mp2Area)" />
        <path d={linePath} fill="none" stroke="#18C27C" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {hoverIdx != null && (
          <g>
            <line
              x1={x(hoverIdx)} x2={x(hoverIdx)} y1={T} y2={bottom}
              stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="3 3"
            />
            <circle cx={x(hoverIdx)} cy={y(series.views[hoverIdx])} r="5" fill="#fff" stroke="#000" strokeWidth="2" />
            <circle cx={x(hoverIdx)} cy={y(series.rockets[hoverIdx])} r="4" fill="#18C27C" stroke="#fff" strokeWidth="2" />
          </g>
        )}

        {series.labels.map((lb, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="rgba(160,175,200,0.5)">
              {lb}
            </text>
          ) : null
        )}
      </svg>

      {hoverIdx != null && (
        <div
          className="mp2-tip"
          style={{
            left: `${Math.min(88, Math.max(12, (x(hoverIdx) / W) * 100))}%`,
            top: `${Math.max(6, Math.min(70, (y(Math.max(series.views[hoverIdx], series.rockets[hoverIdx])) / H) * 100 - 6))}%`,
          }}
        >
          <div className="mp2-tip-d">{series.labels[hoverIdx]}</div>
          <div className="mp2-tip-row v"><Eye size={12} /> {fmt(series.views[hoverIdx], lang)} {t(lang, 'mpViews').toLowerCase()}</div>
          <div className="mp2-tip-row g"><Rocket size={12} /> {fmt(series.rockets[hoverIdx], lang)} {t(lang, 'cRockets').toLowerCase()}</div>
          {series.counts[hoverIdx] > 0 && <div className="mp2-tip-sub">{series.counts[hoverIdx]} {t(lang, 'cPosts').toLowerCase()}</div>}
        </div>
      )}
    </div>
  )
}

export default function MyPostsSection({ lang, onNewPost }) {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [posts, setPosts] = useState(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30d')

  useEffect(() => {
    let on = true
    getCommunityMe()
      .then(r => { if (on) { setMe(r.data.user || null); setPosts(r.data.posts || []) } })
      .catch(() => { if (on) setFailed(true) })
      .finally(() => { if (on) setLoading(false) })
    return () => { on = false }
  }, [])

  const u = me
  const sorted = useMemo(
    () => (posts || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [posts]
  )
  const series = useMemo(() => buildSeries(sorted, period, lang), [sorted, period, lang])

  const tiles = u && [
    { icon: PenLine, label: t(lang, 'mpPostsCount'), value: u.posts_count ?? sorted.length, c: '#FFFFFF', bg: 'rgba(255,255,255,0.12)' },
    { icon: Eye, label: t(lang, 'cViews'), value: u.views_received ?? 0, c: '#F0A03D', bg: 'rgba(240,160,61,0.12)' },
    { icon: Rocket, label: t(lang, 'cRockets'), value: u.rockets_received ?? 0, c: '#18C27C', bg: 'rgba(24,194,124,0.12)' },
    { icon: Repeat2, label: t(lang, 'cShares'), value: u.shares_received ?? 0, c: '#E4E5EA', bg: 'rgba(255,255,255,0.14)' },
  ]

  const totalViews = u?.views_received ?? 0
  const totalEng = (u?.rockets_received ?? 0) + (u?.shares_received ?? 0) + sorted.reduce((a, p) => a + (p.comments || 0), 0)
  const engRate = totalViews > 0 ? Math.round((totalEng / totalViews) * 1000) / 10 : 0
  const best = sorted.slice().sort((a, b) => (b.views || 0) - (a.views || 0))[0]
  const avgViews = sorted.length ? Math.round(totalViews / sorted.length) : 0

  if (loading) {
    return (
      <section className="mp2-root">
        <div className="mp2-load"><TriLoader compact label={t(lang, 'cMyStats')} /></div>
      </section>
    )
  }
  if (failed || !u) {
    return (
      <section className="mp2-root">
        <div className="mp2-empty-state">{t(lang, 'cLoginRequired')}</div>
      </section>
    )
  }

  const seedId = u.id || u.handle || 'me'

  return (
    <section className="mp2-root">
      {/* HERO : profil */}
      <div
        className="mp2-hero"
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06) 55%)`,
        }}
      >
        <div className="mp2-hero-fade" />
        <div className="mp2-hero-in">
          <PhotoAvatar name={u.display_name} avatar={u.avatar} color={u.avatar_color} className="mp2-ava" size={84} />
          <div className="mp2-iden">
            <div className="mp2-nm">
              {u.display_name || u.handle}
              {u.verified && <BadgeCheck size={16} color="#18C27C" />}
              {u.is_pro && <span className="mp2-pro">PRO</span>}
              {u.is_premium && <Crown size={15} color="#F5C518" />}
            </div>
            <div className="mp2-hdl">@{u.handle}</div>
            {u.bio && <div className="mp2-bio">{u.bio}</div>}
            <div className="mp2-chips">
              <span className="mp2-chip"><TrendingUp size={12} />{fmt(u.followers_count ?? 0, lang)} <em>{t(lang, 'cFollowers')}</em></span>
              <span className="mp2-chip"><Activity size={12} />{fmt(u.following_count ?? 0, lang)} <em>{t(lang, 'cFollowingCount')}</em></span>
              <span className="mp2-chip"><Crown size={12} />{fmt(u.reputation ?? 0, lang)} <em>{t(lang, 'cRepTitle')}</em></span>
              {u.level && <span className="mp2-chip">{t(lang, 'mpLevel')} · <em>{u.level}</em></span>}
            </div>
          </div>
          <button className="mp2-profil-btn" onClick={() => router.push('/profile')}>
            {t(lang, 'mpProfil')} <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* TILES STATS */}
      <div className="mp2-tiles">
        {tiles.map(tl => {
          const Icon = tl.icon
          return (
            <div className="mp2-tile" key={tl.label}>
              <span className="mp2-tile-ic" style={{ background: tl.bg, color: tl.c }}>
                <Icon size={17} />
              </span>
              <div className="mp2-tile-num">{fmt(tl.value, lang)}</div>
              <div className="mp2-tile-lb">{tl.label}</div>
            </div>
          )
        })}
      </div>

      {/* CHART AUDIENCE */}
      <div className="mp2-box">
        <div className="mp2-box-head">
          <div className="mp2-box-title">
            <span className="mp2-box-ic"><Activity size={16} /></span>
            <div>
              <div className="mp2-box-t">{t(lang, 'mpAudience')}</div>
              <div className="mp2-box-s">{t(lang, 'mpAudienceSub')}</div>
            </div>
          </div>
          <div className="mp2-seg">
            <button className={`mp2-seg-btn ${period === '30d' ? 'on' : ''}`} onClick={() => setPeriod('30d')}>{t(lang, 'mpPeriod30')}</button>
            <button className={`mp2-seg-btn ${period === 'all' ? 'on' : ''}`} onClick={() => setPeriod('all')}>{t(lang, 'mpPeriodAll')}</button>
          </div>
        </div>

        {sorted.length === 0 || (totalViews === 0 && (u.rockets_received ?? 0) === 0) ? (
          <div className="mp2-chart-empty">{t(lang, 'mpEmptyChart')}</div>
        ) : (
          <AudienceChart series={series} lang={lang} />
        )}

        <div className="mp2-chart-foot">
          <span className="mp2-cf"><b>{fmt(totalViews, lang)}</b>{t(lang, 'mpViews')}</span>
          <span className="mp2-cf"><b>{fmt(avgViews, lang)}</b>{t(lang, 'mpAvgViews')}</span>
          <span className="mp2-cf"><b>{engRate}%</b>{t(lang, 'mpEngRate')}</span>
          <span className="mp2-cf best"><b>{best ? best.symbol : '—'}</b>{t(lang, 'mpBestPost')}</span>
        </div>
      </div>

      {/* LISTE DES PUBLICATIONS */}
      <div className="mp2-box">
        <div className="mp2-box-head">
          <div className="mp2-box-title">
            <span className="mp2-box-ic"><PenLine size={16} /></span>
            <div>
              <div className="mp2-box-t">{t(lang, 'mpPerf')}</div>
              <div className="mp2-box-s">{fmt(sorted.length, lang)} {t(lang, 'cPosts').toLowerCase()}</div>
            </div>
          </div>
          {onNewPost && (
            <button className="mp2-new" onClick={onNewPost}>
              {t(lang, 'mpNewPost')} <ArrowRight size={14} />
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="mp2-no-posts">
            <PenLine size={22} className="mp2-no-ic" />
            <div>{t(lang, 'mpNoPosts')}</div>
            {onNewPost && <button className="mp2-new" onClick={onNewPost}>{t(lang, 'mpNewPost')} <ArrowRight size={14} /></button>}
          </div>
        ) : (
          <div className="mp2-list">
            {sorted.map((p, i) => (
              <div className="mp2-row" key={p.id}>
                <span className="mp2-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="mp2-ticker">{p.symbol}</span>
                <div className="mp2-row-main">
                  <div className="mp2-row-t">
                    {p.title}
                    {p.hidden && <span className="mp2-hidden">{t(lang, 'mpHidden')}</span>}
                  </div>
                  <div className="mp2-row-preview">{p.content}</div>
                </div>
                <div className="mp2-row-meta">
                  <span className="g"><Rocket size={12} />{fmt(p.rockets ?? 0, lang)}</span>
                  <span className="b"><Repeat2 size={12} />{fmt(p.shares ?? 0, lang)}</span>
                  <span className="p"><MessageCircle size={12} />{fmt(p.comments ?? 0, lang)}</span>
                  <span className="a"><Eye size={12} />{fmt(p.views ?? 0, lang)}</span>
                </div>
                <span className="mp2-date">{relTime(p.created_at, lang)}</span>
                <ChevronRight size={14} className="mp2-arrow" />
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .mp2-root { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
        .mp2-load, .mp2-empty-state {
          background: var(--c-surface-1); border: 1px solid var(--c-border);
          border-radius: 18px; padding: 30px; display: flex; align-items: center; justify-content: center;
          min-height: 120px;
        }
        .mp2-empty-state { color: rgba(255,255,255,0.5); font-size: 13.5px; font-family: var(--font-rounded); }

        /* HERO */
        .mp2-hero {
          position: relative; overflow: hidden; border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.09);
          background-size: cover; background-position: center 30%;
          box-shadow: 0 30px 70px -30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .mp2-hero-fade {
          position: absolute; inset: 0; z-index: 0;
          background: linear-gradient(180deg, rgba(5,7,10,0.25) 0%, rgba(5,7,10,0.78) 82%);
        }
        .mp2-hero-in {
          position: relative; z-index: 1; display: flex; align-items: center; gap: 18px;
          padding: 26px 24px 22px;
        }
        .mp2-ava {
          border-radius: 50% !important; flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(255,255,255,0.16), 0 0 0 7px rgba(5,7,10,0.6), 0 18px 40px -14px rgba(0,0,0,0.9);
        }
        .mp2-iden { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .mp2-nm {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          font-family: var(--font-rounded); font-size: 20px; font-weight: 900; letter-spacing: -0.02em; color: #fff;
        }
        .mp2-pro {
          background: linear-gradient(135deg, #fff, #E4E5EA); color: #000;
          font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; border-radius: 999px; padding: 2px 8px;
        }
        .mp2-hdl { color: rgba(180,195,220,0.6); font-size: 13px; font-weight: 500; }
        .mp2-bio { color: rgba(226,234,245,0.85); font-size: 12.5px; line-height: 1.5; max-width: 520px; }
        .mp2-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 6px; }
        .mp2-chip {
          display: inline-flex; align-items: center; gap: 5px;
          background: rgba(5,7,10,0.5); border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(6px); border-radius: 999px; padding: 4px 11px;
          font-family: var(--font-rounded); font-size: 11.5px; font-weight: 800; color: #E8EEF7;
          font-variant-numeric: tabular-nums;
        }
        .mp2-chip svg { color: #FFFFFF; }
        .mp2-chip em { font-style: normal; font-weight: 600; color: rgba(190,205,228,0.55); }
        .mp2-profil-btn {
          flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16);
          color: #fff; border-radius: 12px; padding: 9px 14px;
          font-family: var(--font-rounded); font-size: 12.5px; font-weight: 700; cursor: pointer;
          backdrop-filter: blur(8px); transition: background .16s, border-color .16s, transform .16s;
        }
        .mp2-profil-btn:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.3); transform: translateY(-1px); }

        /* TILES */
        .mp2-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .mp2-tile {
          display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
          background: linear-gradient(160deg, var(--c-surface-2), var(--c-surface-1));
          border: 1px solid var(--c-border); border-radius: 16px; padding: 14px;
          transition: transform .18s, border-color .18s;
        }
        .mp2-tile:hover { transform: translateY(-2px); border-color: var(--c-border-strong); }
        .mp2-tile-ic {
          width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          margin-bottom: 8px;
        }
        .mp2-tile-num { font-family: var(--font-rounded); font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: #fff; font-variant-numeric: tabular-nums; }
        .mp2-tile-lb { font-size: 11px; font-weight: 600; color: rgba(190,205,228,0.5); text-transform: uppercase; letter-spacing: 0.08em; }

        /* BOXES */
        .mp2-box {
          background: linear-gradient(170deg, var(--c-surface-2), var(--c-surface-1));
          border: 1px solid var(--c-border); border-radius: 20px; padding: 16px;
          box-shadow: 0 24px 60px -32px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.04);
          display: flex; flex-direction: column; gap: 14px;
        }
        .mp2-box-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .mp2-box-title { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .mp2-box-ic {
          width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.35); color: #fff;
          display: flex; align-items: center; justify-content: center;
        }
        .mp2-box-t { font-family: var(--font-rounded); font-size: 14.5px; font-weight: 800; color: #fff; letter-spacing: -0.01em; }
        .mp2-box-s { font-size: 11.5px; color: rgba(190,205,228,0.5); font-weight: 500; }

        .mp2-seg {
          display: inline-flex; gap: 3px; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 3px; flex-shrink: 0;
        }
        .mp2-seg-btn {
          border: none; background: none; color: rgba(190,205,228,0.55); cursor: pointer;
          font-family: var(--font-rounded); font-size: 11.5px; font-weight: 700; padding: 5px 12px; border-radius: 8px;
          transition: all .16s;
        }
        .mp2-seg-btn.on { background: #fff; color: #0a0e14; box-shadow: 0 2px 8px -2px rgba(0,0,0,0.6); }

        .mp2-chart { position: relative; }
        .mp2-chart-empty {
          height: 200px; display: flex; align-items: center; justify-content: center;
          color: rgba(190,205,228,0.45); font-size: 12.5px; font-family: var(--font-rounded);
          border: 1px dashed rgba(255,255,255,0.1); border-radius: 14px;
        }
        .mp2-tip {
          position: absolute; pointer-events: none; transform: translate(-50%, -100%);
          background: rgba(8,12,18,0.95); border: 1px solid rgba(255,255,255,0.14); border-radius: 12px;
          padding: 8px 11px; min-width: 132px;
          box-shadow: 0 16px 40px -12px rgba(0,0,0,0.85); backdrop-filter: blur(8px);
          z-index: 5;
        }
        .mp2-tip-d { font-family: var(--font-rounded); font-size: 11px; font-weight: 800; color: #fff; margin-bottom: 4px; }
        .mp2-tip-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .mp2-tip-row.v { color: #FFFFFF; }
        .mp2-tip-row.g { color: #18C27C; margin-top: 2px; }
        .mp2-tip-sub { font-size: 10.5px; color: rgba(190,205,228,0.55); margin-top: 3px; }

        .mp2-chart-foot {
          display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; padding-top: 2px;
          border-top: 1px solid var(--c-divider);
        }
        .mp2-cf {
          flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 1px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; padding: 9px 12px;
        }
        .mp2-cf b { font-family: var(--font-rounded); font-size: 16px; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
        .mp2-cf span:nth-child(2) { font-size: 10.5px; font-weight: 600; color: rgba(190,205,228,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
        .mp2-cf.best b { color: #F5C518; }

        /* LIST */
        .mp2-new {
          flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;
          background: #fff; color: #000;
          border: none; border-radius: 10px; padding: 8px 13px;
          font-family: var(--font-rounded); font-size: 11.5px; font-weight: 800; cursor: pointer;
          box-shadow: 0 10px 24px -10px rgba(255,255,255,0.35); transition: transform .16s, box-shadow .16s;
        }
        .mp2-new:hover { transform: translateY(-1px); background: #E4E5EA; box-shadow: 0 14px 30px -10px rgba(255,255,255,0.4); }
        .mp2-no-posts {
          display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 12px;
          color: rgba(190,205,228,0.55); font-size: 13px; font-family: var(--font-rounded);
          border: 1px dashed rgba(255,255,255,0.1); border-radius: 14px; text-align: center;
        }
        .mp2-no-ic { color: rgba(255,255,255,0.2); }
        .mp2-list { display: flex; flex-direction: column; }
        .mp2-row {
          display: flex; align-items: center; gap: 11px; padding: 10px 8px; border-radius: 12px;
          border-top: 1px solid var(--c-divider); transition: background .15s;
        }
        .mp2-row:first-child { border-top: none; }
        .mp2-row:hover { background: rgba(255,255,255,0.04); }
        .mp2-rank { font-family: var(--font-rounded); font-size: 11px; font-weight: 800; color: rgba(190,205,228,0.3); width: 22px; flex: none; font-variant-numeric: tabular-nums; }
        .mp2-ticker {
          font-family: 'Inter', sans-serif; font-weight: 800; font-size: 10.5px; flex: none;
          background: rgba(255,255,255,0.10); color: #fff; border: 1px solid rgba(255,255,255,0.35);
          border-radius: 7px; padding: 2px 8px; letter-spacing: 0.02em;
        }
        .mp2-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .mp2-row-t {
          display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 650; color: #E9EFF7;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .mp2-hidden {
          flex: none; font-size: 9.5px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;
          color: #FF7A70; background: rgba(240,68,56,0.12); border: 1px solid rgba(240,68,56,0.3); border-radius: 999px; padding: 1px 7px;
        }
        .mp2-row-preview { font-size: 11.5px; color: rgba(190,205,228,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mp2-row-meta { display: flex; gap: 11px; flex: none; }
        .mp2-row-meta span { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .mp2-row-meta .g { color: #18C27C; }
        .mp2-row-meta .b { color: #FFFFFF; }
        .mp2-row-meta .p { color: #B99AFF; }
        .mp2-row-meta .a { color: #F0A03D; }
        .mp2-date { flex: none; font-size: 11px; color: rgba(190,205,228,0.45); width: 54px; text-align: right; }
        .mp2-arrow { flex: none; color: rgba(255,255,255,0.18); transition: transform .16s, color .16s; }
        .mp2-row:hover .mp2-arrow { transform: translateX(2px); color: rgba(255,255,255,0.6); }

        @media (max-width: 640px) {
          .mp2-tiles { grid-template-columns: repeat(2, 1fr); }
          .mp2-hero-in { flex-direction: column; align-items: flex-start; padding: 18px; }
          .mp2-profil-btn { align-self: stretch; justify-content: center; }
          .mp2-row { flex-wrap: wrap; }
          .mp2-row-meta { width: 100%; order: 4; padding-left: 33px; }
        }
      `}</style>
    </section>
  )
}