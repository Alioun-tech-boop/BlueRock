import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api'
import { useAuth } from '../lib/auth'
import { ChevronLeft, Bell, BellRing, CheckCheck, Activity, AlertTriangle, Target, Sparkles, Info } from 'lucide-react'
import { detectLang, t } from '../lib/i18n'

const TYPE_ICON = {
  plan: Sparkles,
  price: Activity,
  alert: AlertTriangle,
  system: Info,
}

const TYPE_COLOR = {
  plan: '#18C27C',
  price: '#4ea8ff',
  alert: '#ffd166',
  system: '#9AA3B2',
}

export default function Notifications() {
  const router = useRouter()
  const { user } = useAuth()
  const [lang, setLang] = useState('fr')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    if (user) {
      getNotifications()
        .then(r => { if (mounted.current) setItems(r.data.notifications || []) })
        .catch(() => {})
        .finally(() => { if (mounted.current) setLoading(false) })
    } else {
      setLoading(false)
    }
    return () => { mounted.current = false }
  }, [user])

  const readAll = async () => {
    try {
      await markAllNotificationsRead()
      if (mounted.current) setItems(items.map(n => ({ ...n, read: true })))
    } catch {}
  }

  const open = async (n) => {
    if (!n.read) {
      setItems(items.map(x => x.id === n.id ? { ...x, read: true } : x))
      try { await markNotificationRead(n.id) } catch {}
    }
    if (n.link) router.push(n.link)
  }

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="pg-header">
          <button className="back-btn" onClick={() => router.push('/portfolio')}>
            <ChevronLeft size={22} />
          </button>
          <div className="pg-title-wrap">
            <div className="pg-title"><Bell size={18} color="#18C27C" /> {t(lang, 'notifTitle')}</div>
            <div className="pg-sub">{t(lang, 'notifSub')}</div>
          </div>
          {items.some(n => !n.read) && (
            <button className="read-all" onClick={readAll}>
              <CheckCheck size={15} /> {t(lang, 'notifReadAll')}
            </button>
          )}
        </header>

        {loading ? (
          <div className="empty"><TriLoader compact label={t(lang, 'notifLoading')} /></div>
        ) : items.length === 0 ? (
          <div className="empty">
            <BellRing size={28} color="#333" />
            <div className="empty-txt">{t(lang, 'notifEmpty')}</div>
          </div>
        ) : (
          <div className="list">
            {items.map(n => {
              const Icon = TYPE_ICON[n.type] || Info
              const color = TYPE_COLOR[n.type] || '#9AA3B2'
              return (
                <div key={n.id} className={`notif ${n.read ? 'read' : ''}`} onClick={() => open(n)}>
                  <div className="notif-ic" style={{ color, background: `${color}1f` }}>
                    <Icon size={16} />
                  </div>
                  <div className="notif-body">
                    <div className="notif-title">{n.title}</div>
                    {n.body && <div className="notif-text">{n.body}</div>}
                    <div className="notif-date">{n.created_at}</div>
                  </div>
                  {!n.read && <span className="dot" />}
                </div>
              )
            })}
          </div>
        )}

        <div className="footer-note">Bluerock © 2026</div>
      </div>

      <BottomNav active="portfolio" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 16px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .pg-header { display: flex; align-items: center; gap: 10px; height: 64px; flex-shrink: 0; }
        .back-btn {
          width: 36px; height: 36px; border-radius: 12px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          background: #141414; color: #fff;
        }
        .pg-title-wrap { display: flex; flex-direction: column; gap: 1px; flex: 1; }
        .pg-title { display: flex; align-items: center; gap: 6px; font-size: 18px; font-weight: 600; }
        .pg-sub { font-size: 11px; color: #9AA3B2; }
        .read-all {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; color: #18C27C;
          background: rgba(24,194,124,0.1); border: 1px solid rgba(24,194,124,0.3);
          border-radius: 10px; padding: 7px 10px; cursor: pointer; flex-shrink: 0;
        }
        .list { display: flex; flex-direction: column; gap: 10px; }
        .notif {
          display: flex; gap: 12px; align-items: flex-start;
          background: #141414; border: 1px solid #1f1f1f;
          border-radius: 16px; padding: 13px 14px; cursor: pointer;
        }
        .notif.read { opacity: 0.55; }
        .notif-ic {
          width: 34px; height: 34px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .notif-body { flex: 1; min-width: 0; }
        .notif-title { font-size: 16px; font-weight: 600; color: #F8F8FA; line-height: 1.35; }
        .notif-text { font-size: 14px; font-weight: 400; color: #9AA3B2; line-height: 1.35; margin-top: 3px; }
        .notif-date { font-size: 10px; color: #666; margin-top: 5px; }
        .dot { width: 8px; height: 8px; border-radius: 999px; background: #18C27C; flex-shrink: 0; margin-top: 5px; }
        .empty {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 60px 0; color: #555;
        }
        .empty-txt { font-size: 13px; color: #9AA3B2; text-align: center; }
        .footer-note { text-align: center; font-size: 11px; color: #555; padding: 12px 0; }
      `}</style>
    </div>
  )
}
