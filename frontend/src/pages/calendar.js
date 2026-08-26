import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import { getMarketCalendar } from '../services/api'
import { t, detectLang } from '../lib/i18n'
import DataErrorState from '../components/DataErrorState'
import { ArrowLeft, ChevronDown, ChevronRight, BarChart3, TrendingUp, Newspaper, Briefcase } from 'lucide-react'

const TYPE_KEYS = [
  { key: 'all', icon: BarChart3, i18n: 'calFilterAll' },
  { key: 'financier', icon: BarChart3, i18n: 'calFilterResults' },
  { key: 'brvm', icon: Newspaper, i18n: 'calFilterAnnounce' },
  { key: 'macro', icon: TrendingUp, i18n: 'calFilterMacro' },
  { key: 'cotation', icon: Briefcase, i18n: 'calFilterListings' },
]

const PERIODS = [
  { key: '7d', i18n: 'calPeriod7', days: 7 },
  { key: '30d', i18n: 'calPeriod30', days: 30 },
  { key: 'all', i18n: 'calPeriodAll', days: null },
]

const IMPORTANCE = [
  { key: 'all', i18n: 'calImportance', min: 0 },
  { key: 'high', i18n: 'calImportanceHigh', min: 3 },
  { key: 'medium', i18n: 'calImportanceMedium', min: 2 },
  { key: 'low', i18n: 'calImportanceLow', min: 1 },
]

const FLAGS = {
  CI: '🇨🇮', BJ: '🇧🇯', BF: '🇧🇫', ML: '🇲🇱', NE: '🇳🇪', SN: '🇸🇳', TG: '🇹🇬', UEMOA: '🏛️',
}

function ImportanceBars({ level }) {
  const heights = level >= 3 ? [14, 22, 30] : level === 2 ? [10, 18, 0] : [18, 0, 0]
  return (
    <svg width="13" height="24" viewBox="0 0 16 30" fill="none">
      {heights.map((h, i) => (
        <rect key={i} x={i * 6} y={30 - h} width="4" height={h} rx="1" fill={h > 0 ? '#9AA3B2' : '#333333'} />
      ))}
    </svg>
  )
}

function dayLabel(lang, dateStr, now) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return t(lang, 'calToday')
  if (diff === 1) return t(lang, 'calTomorrow')
  if (diff === -1) return t(lang, 'calYesterday')
  const opts = lang === 'fr'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
  const label = d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', opts)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function countdownText(lang, dateStr, now) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return t(lang, 'calToday')
  if (diff === 1) return t(lang, 'calTomorrow')
  return t(lang, 'calInDays').replace('{n}', diff)
}

function timeLabel(e, lang) {
  if (e.time) return e.time
  return t(lang, 'calAllDay')
}

export default function Calendar() {
  const router = useRouter()
  const [lang] = useState(() => detectLang())
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [typeIdx, setTypeIdx] = useState(0)
  const [periodIdx, setPeriodIdx] = useState(0)
  const [impIdx, setImpIdx] = useState(0)
  const [now, setNow] = useState(new Date())
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const mounted = { ok: true }
    getMarketCalendar()
      .then(r => { if (mounted.ok) setItems(r.data.items || []) })
      .catch(() => { if (mounted.ok) setError(true) })
      .finally(() => { if (mounted.ok) setLoading(false) })
    const clock = setInterval(() => setNow(new Date()), 60000)
    return () => { mounted.ok = false; clearInterval(clock) }
  }, [reload])

  const filtered = useMemo(() => {
    const period = PERIODS[periodIdx]
    const imp = IMPORTANCE[impIdx]
    let out = items
    if (typeIdx > 0) out = out.filter(e => (e.type || '').toLowerCase() === TYPE_KEYS[typeIdx].key)
    if (period.days) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - period.days)
      const c = cutoff.toISOString().slice(0, 10)
      out = out.filter(e => (e.date || '') >= c)
    }
    if (imp.min > 0) out = out.filter(e => (e.importance || 0) >= imp.min)
    return [...out].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }, [items, typeIdx, periodIdx, impIdx])

  const groups = useMemo(() => {
    const g = {}
    filtered.forEach(e => {
      const d = e.date || 'unknown'
      ;(g[d] = g[d] || []).push(e)
    })
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const activeType = TYPE_KEYS[typeIdx]
  const ActiveIcon = activeType.icon

  const openEvent = (e) => {
    if (e.symbol) {
      router.push(`/quote?symbol=${e.symbol}`)
    } else if (e.detail && /^https?:/i.test(e.detail)) {
      window.open(e.detail, '_blank', 'noopener')
    }
  }

  return (
    <div className="mobile-root">
      <div className="top-bar">
        <button className="back-btn" onClick={() => router.back()} aria-label={t('back')}>
          <ArrowLeft size={24} strokeWidth={2} color="#fff" />
        </button>
      </div>

      <div className="content">
        <h1 className="title">{t('calTitle')}</h1>

        <div className="filter-row">
          <button className="filter-btn" onClick={() => setTypeIdx((typeIdx + 1) % TYPE_KEYS.length)}>
            <ActiveIcon size={13} strokeWidth={2} color="#fff" />
            <span>{t(activeType.i18n)}</span>
          </button>
          <button className="filter-btn" onClick={() => setPeriodIdx((periodIdx + 1) % PERIODS.length)}>
            <span>{t(PERIODS[periodIdx].i18n)}</span>
            <ChevronDown size={13} strokeWidth={2} color="#fff" />
          </button>
          <button className="filter-btn" onClick={() => setImpIdx((impIdx + 1) % IMPORTANCE.length)}>
            <span className="trunc">{t(IMPORTANCE[impIdx].i18n)}</span>
          </button>
        </div>

        {error ? (
          <DataErrorState lang={lang} size={150} message={t('loadError')} retry={() => setReload(x => x + 1)} />
        ) : loading ? (
          <div className="state-box"><TriLoader compact label={t('calLoading')} /></div>
        ) : groups.length === 0 ? (
          <div className="state-box">{t('calNoEvents')}</div>
        ) : (
          groups.map(([date, evts]) => (
            <div key={date} className="day-group">
              <div className="date-banner">{dayLabel(lang, date, now)}</div>
              {evts.map((e, i) => (
                <div key={e.id || `${date}-${i}`} className="event-row" onClick={() => openEvent(e)}>
                  <div className={`time-pill ${countdownText(lang, date, now) ? 'soon' : ''}`}>
                    {timeLabel(e, lang)}
                  </div>
                  <div className="event-main">
                    <div className="event-title">{e.title}</div>
                    <div className="event-meta">
                      <span className="flag">{FLAGS[e.country] || '🏳️'}</span>
                      <span className="imp-icon">
                        <ImportanceBars level={e.importance || 1} />
                      </span>
                      <div className="value-cols">
                        <div className="value-col">
                          <span className="v-label">{t('calActual')}</span>
                          <span className="v-value">{e.actual ? `${e.actual}${e.unit ? ' ' + e.unit : ''}` : '?'}</span>
                          {countdownText(lang, date, now) && (
                            <span className="countdown">{countdownText(lang, date, now)}</span>
                          )}
                        </div>
                        <div className="value-col">
                          <span className="v-label">{t('calForecast')}</span>
                          <span className="v-value">{e.forecast ? `${e.forecast}${e.unit ? ' ' + e.unit : ''}` : '?'}</span>
                        </div>
                        <div className="value-col">
                          <span className="v-label">{t('calPrevious')}</span>
                          <span className="v-value">{e.previous ? `${e.previous}${e.unit ? ' ' + e.unit : ''}` : '?'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} strokeWidth={2} color="#9AA3B2" className="chevron" />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <BottomNav active="explorer" />

      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
          font-family: Inter, -apple-system, 'SF Pro Display', sans-serif;
          overflow: hidden;
        }
        .top-bar {
          height: 52px; flex-shrink: 0;
          display: flex; align-items: center;
          background: #000000;
          padding: 0 4px;
        }
        .back-btn {
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; cursor: pointer;
        }
        .content {
          flex: 1; min-height: 0;
          overflow-y: auto; padding: 0 14px 24px;
        }
        .content::-webkit-scrollbar { display: none; }
        .title {
          font-size: 34px; font-weight: 700;
          letter-spacing: 0; line-height: 1.05;
          margin: 4px 0 20px; text-align: left;
        }
        .filter-row {
          display: flex; gap: 10px;
          margin-bottom: 14px; overflow-x: auto;
        }
        .filter-row::-webkit-scrollbar { display: none; }
        .filter-btn {
          height: 38px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          background: #2C2C2C; border: none; border-radius: 16px;
          color: #fff; font-size: 13px; font-weight: 600;
          padding: 0 16px; cursor: pointer; font-family: inherit;
          white-space: nowrap; flex-shrink: 0;
        }
        .filter-btn .trunc { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
        .date-banner {
          background: #0D0D0D;
          height: 40px;
          display: flex; align-items: center;
          padding: 0 14px;
          font-size: 14px; font-weight: 600; color: #F2F4F7;
          letter-spacing: 0;
          margin: 6px -14px 0;
        }
        .event-row {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 14px;
          border-bottom: 1px solid #1B1B1B;
          background: #000000;
          cursor: pointer;
        }
        .event-row:active { opacity: 0.7; }
        .time-pill {
          min-width: 52px;
          background: #2C2C2C; border-radius: 8px;
          padding: 6px 10px;
          font-size: 14px; font-weight: 700; text-align: center;
          color: #fff;
        }
        .time-pill.soon { background: #FF3B57; }
        .event-main { flex: 1; min-width: 0; }
        .event-title {
          font-size: 18px; font-weight: 700; color: #F8F8FA;
          line-height: 1.25; letter-spacing: 0;
          margin-bottom: 8px;
        }
        .event-meta { display: flex; align-items: center; gap: 10px; }
        .flag {
          width: 18px; height: 18px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px;
          border: 1px solid rgba(255,255,255,0.18);
          flex-shrink: 0;
        }
        .imp-icon { flex-shrink: 0; display: flex; align-items: center; }
        .value-cols {
          display: flex; gap: 18px; flex: 1; min-width: 0;
        }
        .value-col { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .v-label { font-size: 14px; color: #9AA3B2; }
        .v-value { font-size: 14px; font-weight: 500; color: #8E95A3; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .countdown { font-size: 13px; font-weight: 600; color: #FF3B57; }
        .chevron { flex-shrink: 0; }
        .state-box {
          padding: 40px 24px; text-align: center;
          color: #6B7A94; font-size: 14px;
        }
      `}</style>
    </div>
  )
}
