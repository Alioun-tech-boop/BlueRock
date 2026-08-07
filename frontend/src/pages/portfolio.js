import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { getCompanies, getPortfolio, placeOrder } from '../services/api'
import { useAuth } from '../lib/auth'
import {
  Bell, Wallet, CircleUserRound, ChevronDown, SlidersHorizontal,
  ArrowUpRight, ArrowDownRight, UserRound,
} from 'lucide-react'
import { detectLang, t } from '../lib/i18n'

const PORT_KEY = 'bluerock_portfolio_v1'

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function EmptyState({ title, sub, btn, onClick }) {
  return (
    <div className="pf-empty">
      <div className="rings">
        <div className="ring r3" />
        <div className="ring r2" />
        <div className="ring r1" />
        <span className="plus-h" />
        <span className="plus-v" />
      </div>
      <p className="pf-empty-title">{title}</p>
      {sub && <p className="pf-empty-sub">{sub}</p>}
      {btn && <button className="pf-empty-btn" onClick={onClick}>{btn}</button>}
    </div>
  )
}

export default function Portfolio() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [lang, setLang] = useState('fr')
  const [stocks, setStocks] = useState([])
  const [positions, setPositions] = useState({})
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(false)
  const [tab, setTab] = useState('positions')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setPositions({})
      setOrders([])
      setLoading(false)
      return
    }
    let cancelled = false
    getPortfolio()
      .then(res => {
        if (cancelled) return
        const pos = {}
        ;(res.data.positions || []).forEach(p => { pos[p.symbol] = { qty: p.qty, avgPrice: p.avg_price } })
        setPositions(pos)
        setOrders(res.data.orders || [])
        const local = loadJSON(PORT_KEY, {})
        const localEntries = Object.entries(local).filter(([, p]) => p.qty > 0)
        if (localEntries.length && (!res.data.positions || !res.data.positions.length) && !migrated) {
          setMigrated(true)
          Promise.all(localEntries.map(([sym, p]) =>
            placeOrder({ symbol: sym, side: 'buy', qty: p.qty, price: p.avgPrice || 1 }).catch(() => null)
          )).then(orders => {
            if (cancelled) return
            const imported = orders.filter(Boolean).length
            if (imported > 0) {
              getPortfolio().then(r => {
                if (cancelled) return
                const pos2 = {}
                ;(r.data.positions || []).forEach(p => { pos2[p.symbol] = { qty: p.qty, avgPrice: p.avg_price } })
                setPositions(pos2)
                localStorage.removeItem(PORT_KEY)
              }).catch(() => {})
            }
          })
        }
      })
      .catch(() => { if (!cancelled) setPositions({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, authLoading, migrated])

  useEffect(() => {
    getCompanies({ limit: 47 }).then(r => r.data.companies || []).catch(() => [])
      .then(list => { if (mounted.current) setStocks(list) })
    return () => { mounted.current = false }
  }, [])

  const positionList = useMemo(() => {
    return Object.entries(positions).map(([symbol, pos]) => {
      const stock = stocks.find(s => s.symbol === symbol)
      const price = stock?.current_price ?? 0
      const chg = stock?.change_percent ?? 0
      const qty = pos.qty || 0
      const avg = pos.avgPrice || price
      const value = price * qty
      const cost = avg * qty
      const pl = value - cost
      const plPct = cost ? (pl / cost) * 100 : 0
      return { symbol, stock, qty, avg, price, chg, value, cost, pl, plPct, id: stock?.id }
    }).filter(p => p.qty > 0)
  }, [positions, stocks])

  const totals = useMemo(() => {
    const value = positionList.reduce((s, p) => s + p.value, 0)
    const cost = positionList.reduce((s, p) => s + p.cost, 0)
    const dayPl = positionList.reduce((s, p) => s + p.value * (p.chg / 100), 0)
    const totalPl = value - cost
    const totalPlPct = cost ? (totalPl / cost) * 100 : 0
    const dayPlPct = value ? (dayPl / value) * 100 : 0
    return { value, cost, dayPl, dayPlPct, totalPl, totalPlPct }
  }, [positionList])

  const fmtMoney = n => n != null ? n.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'
  const fmtPlPct = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

  const pendingOrders = orders.filter(o => o.status === 'pending')
  const historyOrders = orders.filter(o => o.status !== 'pending')

  const tabs = [
    { id: 'positions', label: t(lang, 'pfOpenPositions') },
    { id: 'orders', label: t(lang, 'pfPendingOrders') },
    { id: 'history', label: t(lang, 'pfHistory') },
  ]

  const renderOrder = o => {
    const buy = o.side === 'buy'
    const when = o.created_at ? new Date(o.created_at) : null
    const stKey = o.status === 'pending' ? 'statusPending' : o.status === 'cancelled' ? 'statusCancelled' : 'statusExecuted'
    return (
      <div key={o.id} className="order-row">
        <span className={`order-side ${buy ? 'buy' : 'sell'}`}>{buy ? t(lang, 'buy') : t(lang, 'sell')}</span>
        <div className="order-info">
          <div className="order-sym mono">{o.symbol}</div>
          <div className="order-detail">
            {when ? when.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—'} · {o.qty} {t(lang, 'shares')} @ {fmtMoney(o.price)}
          </div>
        </div>
        <div className="order-right">
          <span className={`order-status ${o.status}`}>{t(lang, stKey)}</span>
          <span className="order-total mono">{fmtMoney((o.qty || 0) * (o.price || 0))}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-root">
      <header className="top-bar">
        <button className="acct-capsule" onClick={() => router.push('/profile')} aria-label={t(lang, 'account')}>
          <span className="acct-avatar">R</span>
          <span className="acct-balance mono">{fmtMoney(totals.value)}</span>
          <ChevronDown size={16} strokeWidth={2.4} className="acct-chev" />
        </button>
        <div className="top-icons">
          <button className="top-icon" onClick={() => router.push('/notifications')} aria-label={t(lang, 'notifications')}>
            <Bell size={23} strokeWidth={2.2} />
          </button>
          <button className="top-icon" onClick={() => router.push('/watchlist')} aria-label={t(lang, 'watchlist')}>
            <Wallet size={24} strokeWidth={2.2} />
          </button>
          <button className="top-icon" onClick={() => router.push('/profile')} aria-label={t(lang, 'account')}>
            <CircleUserRound size={28} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <div className="safe-area">
        <div className="tt-row">
          <h1 className="tt-title">{t(lang, 'transactions')}</h1>
          <SlidersHorizontal size={25} strokeWidth={2.2} className="tt-filter" />
        </div>

        <div className="tx-tabs">
          {tabs.map(tb => (
            <button
              key={tb.id}
              className={`tx-tab ${tab === tb.id ? 'active' : ''}`}
              onClick={() => setTab(tb.id)}
            >{tb.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : !user ? (
          <EmptyState
            title={t(lang, 'authRequired')}
            sub={t(lang, 'authRequiredSub')}
            btn={t(lang, 'authLogin')}
            onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}
          />
        ) : tab === 'positions' ? (
          positionList.length ? (
            <div className="px-list">
              {positionList.map(p => {
                const up = p.pl >= 0
                return (
                  <div key={p.symbol} className="pos-row" onClick={() => p.id && router.push(`/company?id=${p.id}`)}>
                    <div className="pos-logo" style={{ background: `hsl(${(p.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                      {p.stock?.logo_url ? <img src={p.stock.logo_url} alt={p.symbol} /> : p.symbol?.[0]}
                    </div>
                    <div className="pos-info">
                      <div className="pos-name">{p.stock?.name || p.symbol}</div>
                      <div className="pos-sub">
                        {p.symbol} · {p.qty} {t(lang, 'shares')}
                        {p.take_profit != null && <span className="pos-tpsl up">TP {fmtMoney(p.take_profit)}</span>}
                        {p.stop_loss != null && <span className="pos-tpsl down">SL {fmtMoney(p.stop_loss)}</span>}
                      </div>
                    </div>
                    <div className="pos-right">
                      <div className="pos-value mono">{fmtMoney(p.value)}</div>
                      <div className={`pos-pl mono ${up ? 'up' : 'down'}`}>
                        {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {fmtPlPct(p.plPct)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState title={t(lang, 'pfEmptyTitle')} btn={t(lang, 'pfOpenPosition')} onClick={() => router.push('/watchlist')} />
          )
        ) : tab === 'orders' ? (
          pendingOrders.length ? (
            <div className="px-list">{pendingOrders.map(renderOrder)}</div>
          ) : (
            <EmptyState title={t(lang, 'pfEmptyTitle')} btn={t(lang, 'pfOpenPosition')} onClick={() => router.push('/watchlist')} />
          )
        ) : historyOrders.length ? (
          <div className="px-list">{historyOrders.map(renderOrder)}</div>
        ) : (
          <EmptyState title={t(lang, 'pfEmptyTitle')} btn={t(lang, 'pfOpenPosition')} onClick={() => router.push('/watchlist')} />
        )}
      </div>

      <BottomNav active="portfolio" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #0D162B; color: #F7F8FA;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .top-bar { display: flex; align-items: center; justify-content: space-between; padding: 44px 24px 0; }
        .acct-capsule {
          display: flex; align-items: center; gap: 11px; height: 68px;
          padding: 0 16px 0 13px; background: #172239; border: none; border-radius: 34px;
          cursor: pointer; min-width: 0; font-family: inherit;
        }
        .acct-avatar {
          width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
          background: #0E3022; color: #2ACB8A;
          display: flex; align-items: center; justify-content: center;
          font-size: 17px; font-weight: 700;
        }
        .acct-balance {
          color: #F7F8FA; font-size: 21px; font-weight: 600; white-space: nowrap; letter-spacing: 0.25px;
        }
        .acct-chev { color: #8C99AF; flex-shrink: 0; }
        .top-icons { display: flex; align-items: center; gap: 12px; }
        .top-icon {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          color: #8C99AF; border-radius: 50%; background: none; border: none; cursor: pointer; font-family: inherit;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 0 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .tt-row { display: flex; align-items: center; justify-content: space-between; margin: 46px 30px 0; }
        .tt-title { font-size: 36px; font-weight: 700; color: #F7F8FA; margin: 0; letter-spacing: 0.25px; }
        .tt-filter { color: #8C99AF; }
        .tx-tabs {
          display: flex; gap: 10px; overflow-x: auto; padding: 26px 24px 0;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .tx-tabs::-webkit-scrollbar { display: none; }
        .tx-tab {
          flex-shrink: 0; height: 62px; padding: 0 34px; border-radius: 35px; border: none;
          font-family: inherit; font-size: 20px; letter-spacing: 0.25px; white-space: nowrap; cursor: pointer;
        }
        .tx-tab.active { background: #FFFFFF; color: #111111; font-weight: 700; }
        .tx-tab:not(.active) { background: #1B263D; color: #8996AE; font-weight: 500; }
        .loading-row { display: flex; justify-content: center; padding: 60px 0; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #1B2941; border-top-color: #2ACB8A;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pf-empty {
          display: flex; flex-direction: column; align-items: center;
          padding: 90px 24px 40px; text-align: center;
        }
        .rings { position: relative; width: 260px; height: 260px; }
        .ring {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%); border-radius: 50%;
        }
        .ring.r3 { width: 260px; height: 260px; border: 1.5px solid #1B2941; }
        .ring.r2 { width: 190px; height: 190px; border: 2px solid #22304A; }
        .ring.r1 { width: 120px; height: 120px; border: 5px solid #46536A; }
        .plus-h, .plus-v {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          background: #8C99AF; border-radius: 7px;
        }
        .plus-h { width: 46px; height: 11px; }
        .plus-v { width: 11px; height: 46px; }
        .pf-empty-title { font-size: 23px; font-weight: 500; color: #8996AC; margin: 34px 0 0; letter-spacing: 0.25px; }
        .pf-empty-sub { font-size: 14px; font-weight: 400; color: #5F6D85; margin: 10px 0 0; line-height: 1.5; }
        .pf-empty-btn {
          margin-top: 30px; width: min(460px, 100%); height: 76px;
          background: transparent; border: 2px solid #46536A; border-radius: 16px;
          color: #F7F8FA; font-size: 20px; font-weight: 700; cursor: pointer; font-family: inherit;
          letter-spacing: 0.25px;
        }
        .px-list { padding: 26px 24px 24px; display: flex; flex-direction: column; }
        .pos-row {
          display: flex; align-items: center; gap: 14px;
          padding: 15px 0; border-bottom: 1px solid #1B2941; cursor: pointer;
        }
        .pos-row:last-child { border-bottom: none; }
        .pos-logo {
          width: 54px; height: 54px; border-radius: 16px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 17px; overflow: hidden;
        }
        .pos-logo img { width: 100%; height: 100%; object-fit: cover; }
        .pos-info { flex: 1; min-width: 0; }
        .pos-name {
          font-size: 18px; font-weight: 700; color: #F7F8FA;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pos-sub {
          font-size: 14px; font-weight: 400; color: #8C99AF;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pos-tpsl { margin-left: 8px; font-size: 11px; font-weight: 700; }
        .pos-tpsl.up { color: #2ACB8A; }
        .pos-tpsl.down { color: #F04438; }
        .pos-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .pos-value { font-size: 18px; font-weight: 700; color: #F7F8FA; }
        .pos-pl { display: flex; align-items: center; gap: 5px; font-size: 16px; font-weight: 500; }
        .mono { font-variant-numeric: tabular-nums; }
        .up { color: #2ACB8A; }
        .down { color: #F04438; }
        .order-row {
          display: flex; align-items: center; gap: 12px;
          padding: 15px 0; border-bottom: 1px solid #1B2941;
        }
        .order-row:last-child { border-bottom: none; }
        .order-side {
          flex-shrink: 0; font-size: 12px; font-weight: 700;
          padding: 5px 11px; border-radius: 10px; min-width: 58px; text-align: center;
        }
        .order-side.buy { background: rgba(42,203,138,0.16); color: #2ACB8A; }
        .order-side.sell { background: rgba(240,68,56,0.16); color: #F04438; }
        .order-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .order-sym { font-size: 16px; font-weight: 700; color: #F7F8FA; }
        .order-detail {
          font-size: 13px; font-weight: 400; color: #8C99AF;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .order-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .order-status { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 8px; }
        .order-status.executed { background: rgba(42,203,138,0.14); color: #2ACB8A; }
        .order-status.pending { background: rgba(255,209,102,0.14); color: #ffd166; }
        .order-status.cancelled { background: rgba(240,68,56,0.14); color: #F04438; }
        .order-total { font-size: 15px; font-weight: 600; color: #F7F8FA; }
      `}</style>
    </div>
  )
}
