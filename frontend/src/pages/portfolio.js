import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import {
  getCompanies, getPortfolio, placeOrder, cancelOrder, getPortfolioDividends,
  createPortfolioAccount, depositPortfolioAccount, withdrawPortfolioAccount,
  renamePortfolioAccount, deletePortfolioAccount,
  initiateDeposit, verifyDepositOrder, getDepositOrders,
} from '../services/api'
import { useAuth } from '../lib/auth'
import {
  Bell, Wallet, CircleUserRound, ChevronDown, SlidersHorizontal,
  ArrowUpRight, ArrowDownRight, ArrowDownToLine, ArrowUpFromLine,
  Plus, X, Minus, Landmark, FlaskConical, Trash2, Check, Pencil, Lock,
} from 'lucide-react'
import { detectLang, t } from '../lib/i18n'
import { applyLogoBackground, onLogoError } from '../lib/logoBg'
import { getActiveAccountId, setActiveAccountId as persistActiveAccountId, clearActiveAccountId, getPortfolioKey, migrateAnonPortfolioToUser } from '../lib/accounts'

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
      <style jsx>{`
        .pf-empty {
          display: flex; flex-direction: column; align-items: center;
          padding: 90px 24px 40px; text-align: center;
        }
        .rings { position: relative; width: 260px; height: 260px; }
        .ring {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%); border-radius: 50%;
        }
        .ring.r3 { width: 260px; height: 260px; border: 1.5px solid #1C1C1C; }
        .ring.r2 { width: 190px; height: 190px; border: 2px solid #262626; }
        .ring.r1 { width: 120px; height: 120px; border: 5px solid #3A3A3A; }
        .plus-h, .plus-v {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          background: #8C99AF; border-radius: 7px;
        }
        .plus-h { width: 46px; height: 11px; }
        .plus-v { width: 11px; height: 46px; }
        .pf-empty-title { font-size: 23px; font-weight: 500; color: #8996AC; margin: 34px 0 0; letter-spacing: 0; }
        .pf-empty-sub { font-size: 14px; font-weight: 400; color: #5F6D85; margin: 10px 0 0; line-height: 1.5; }
        .pf-empty-btn {
          margin-top: 26px; width: min(340px, 100%); height: 50px;
          background: linear-gradient(135deg, #18C27C, #00A843);
          border: none; border-radius: 14px;
          color: #00130a; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit;
          letter-spacing: 0;
          box-shadow: 0 8px 22px rgba(24, 194, 124, 0.22);
          transition: transform 160ms ease-out, opacity 160ms ease-out;
        }
        .pf-empty-btn:active { transform: scale(0.98); opacity: 0.92; }
      `}</style>
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
  const [stocksReady, setStocksReady] = useState(false)
  const [migrated, setMigrated] = useState(false)
  const [tab, setTab] = useState('positions')
  const [sort, setSort] = useState('value')
  const [accounts, setAccounts] = useState([])
  const [account, setAccount] = useState(null)
  const [activeAccountId, setActiveAccountId] = useState(() => getActiveAccountId())

  // Hydrate per-user active account après connexion (migration anonyme → user)
  useEffect(() => {
    if (authLoading) return
    try { migrateAnonPortfolioToUser(user) } catch {}
    const perUserId = getActiveAccountId(user)
    if (perUserId != null && perUserId !== activeAccountId) setActiveAccountId(perUserId)
    // si déconnecté, retomber sur clé anonyme
    if (!user) {
      const anonId = getActiveAccountId(null)
      if (anonId != null && anonId !== perUserId) setActiveAccountId(anonId)
    }
  }, [user, authLoading])

  const applyActiveAccount = id => {
    setActiveAccountId(id)
    persistActiveAccountId(id, user)
  }

  const [sheetOpen, setSheetOpen] = useState(false)
  const [switchModal, setSwitchModal] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState('demo')
  const [createCurrency, setCreateCurrency] = useState('XOF')
  const [createName, setCreateName] = useState('')
  const [moneyModal, setMoneyModal] = useState(null)
  const [moneyAmt, setMoneyAmt] = useState('')
  const [moneyErr, setMoneyErr] = useState('')
  const [payBanner, setPayBanner] = useState(null) // { kind: 'confirmed'|'pending'|'failed', amount, accountName }
  const [accBusy, setAccBusy] = useState(false)
  const [accErr, setAccErr] = useState('')
  const [sellPos, setSellPos] = useState(null)
  const [sellQty, setSellQty] = useState('1')
  const [sellType, setSellType] = useState('market')
  const [sellLimit, setSellLimit] = useState('')
  const [sellTp, setSellTp] = useState('')
  const [sellSl, setSellSl] = useState('')
  const [sellUnlimited, setSellUnlimited] = useState(true)
  const [sellValidUntil, setSellValidUntil] = useState('')
  const [sellErr, setSellErr] = useState('')
  const [sellInfo, setSellInfo] = useState('')
  const [sellBusy, setSellBusy] = useState(false)
  const [renameModal, setRenameModal] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameErr, setRenameErr] = useState('')
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
    setLoading(true)
    const load = () => getPortfolio(activeAccountId)
      .then(res => {
        if (cancelled) return
        const pos = {}
        ;(res.data.positions || []).forEach(p => { pos[p.symbol] = { qty: p.qty, avgPrice: p.avg_price } })
        setPositions(pos)
        setOrders(res.data.orders || [])
        setAccounts(res.data.accounts || [])
        setAccount(res.data.account || null)
        if (res.data.account && !activeAccountId) {
          applyActiveAccount(res.data.account.id)
        }
        const portKey = getPortfolioKey(user)
        const local = loadJSON(portKey, {})
        // fallback anonyme si per-user vide
        let effectiveLocal = local
        if (Object.keys(effectiveLocal).length === 0 && portKey !== PORT_KEY) {
          const anonLocal = loadJSON(PORT_KEY, {})
          if (Object.keys(anonLocal).length) effectiveLocal = anonLocal
        }
        const localEntries = Object.entries(effectiveLocal).filter(([, p]) => p.qty > 0)
        if (localEntries.length && (!res.data.positions || !res.data.positions.length) && !migrated) {
          setMigrated(true)
          Promise.all(localEntries.map(([sym, p]) =>
            placeOrder({ symbol: sym, side: 'buy', qty: p.qty, price: p.avgPrice || 1, account_id: res.data.account?.id }).catch(() => null)
          )).then(orders => {
            if (cancelled) return
            const imported = orders.filter(Boolean).length
            if (imported > 0) {
              getPortfolio(activeAccountId).then(r => {
                if (cancelled) return
                const pos2 = {}
                ;(r.data.positions || []).forEach(p => { pos2[p.symbol] = { qty: p.qty, avgPrice: p.avg_price } })
                setPositions(pos2)
                try {
                  localStorage.removeItem(getPortfolioKey(user))
                  // garder anon propre aussi si migré depuis anon
                  if (getPortfolioKey(user) !== PORT_KEY) localStorage.removeItem(PORT_KEY)
                } catch {}
              }).catch(() => {})
            }
          })
        }
      })
      .catch(() => { if (!cancelled) setPositions({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    load()
    return () => { cancelled = true }
  }, [user, authLoading, migrated, activeAccountId])

  // Retour de paiement Stripe (?pay=return) : on re-vérifie l'ordre le plus
  // récent auprès du backend, qui crédite le solde si le paiement est accepté.
  useEffect(() => {
    if (authLoading || !user) return
    if (router.query.pay !== 'return') return
    let cancelled = false
    getDepositOrders()
      .then(res => {
        if (cancelled) return
        const orders = res.data.orders || []
        if (!orders.length) return null
        const order = orders[0]
        return verifyDepositOrder(order.id).then(r => {
          if (cancelled) return
          const st = r.data.order?.status
          const amount = r.data.order?.amount ?? order.amount
          const accountName = r.data.account?.name || ''
          if (st === 'accepted') {
            setPayBanner({ kind: 'confirmed', amount, accountName, orderId: order.id })
            refreshPortfolio()
          } else if (st === 'pending') {
            setPayBanner({ kind: 'pending', amount, accountName, orderId: order.id })
          } else {
            setPayBanner({ kind: 'failed', amount, accountName, orderId: order.id })
          }
        })
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) router.replace('/portfolio', undefined, { shallow: true }).catch(() => {})
      })
    return () => { cancelled = true }
  }, [user, authLoading, router.query.pay])

  useEffect(() => {
    if (!payBanner || payBanner.kind === 'pending') return
    const id = setTimeout(() => setPayBanner(null), 8000)
    return () => clearTimeout(id)
  }, [payBanner])

  useEffect(() => {
    Promise.all([
      getCompanies({ instrument_type: 'equity', limit: 100 }),
      getCompanies({ instrument_type: 'obligation', limit: 100 }),
      getCompanies({ instrument_type: 'fcp', limit: 100 }),
    ]).then(([e, o, f]) => e.data.companies.concat(o.data.companies, f.data.companies))
      .catch(() => [])
      .then(list => { if (mounted.current) setStocks(list) })
      .finally(() => { if (mounted.current) setStocksReady(true) })
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
      const prevPrice = chg !== 0 ? price / (1 + chg / 100) : price
      const dayPl = (price - prevPrice) * qty
      return { symbol, stock, qty, avg, price, chg, value, cost, pl, plPct, dayPl, id: stock?.id }
    }).filter(p => p.qty > 0)
  }, [positions, stocks])

  const totals = useMemo(() => {
    const value = positionList.reduce((s, p) => s + p.value, 0)
    const cost = positionList.reduce((s, p) => s + p.cost, 0)
    const dayPl = positionList.reduce((s, p) => s + p.dayPl, 0)
    const totalPl = value - cost
    const totalPlPct = cost ? (totalPl / cost) * 100 : 0
    const prevValue = value - dayPl
    const dayPlPct = prevValue ? (dayPl / prevValue) * 100 : 0
    return { value, cost, dayPl, dayPlPct, totalPl, totalPlPct }
  }, [positionList])

  const sortedList = useMemo(() => {
    const list = positionList.map(p => ({
      ...p,
      weight: totals.value ? (p.value / totals.value) * 100 : 0,
    }))
    if (sort === 'pl') return [...list].sort((a, b) => b.pl - a.pl)
    if (sort === 'day') return [...list].sort((a, b) => b.dayPl - a.dayPl)
    return [...list].sort((a, b) => b.value - a.value)
  }, [positionList, totals.value, sort])

  const colorOf = symbol => {
    let h = 0
    for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 360
    return `hsl(${h}, 62%, 45%)`
  }

  const fmtMoney = (n, cur) => {
    if (n == null) return '—'
    const v = n.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return cur === 'NGN' ? `₦${v}` : v
  }
  const curLabel = cur => (cur === 'NGN' ? '₦' : 'FCFA')
  const fmtPlPct = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

  const pendingOrders = orders.filter(o => o.status === 'pending')
  const historyOrders = orders.filter(o => o.status !== 'pending')

  const [dividends, setDividends] = useState([])
  const [dividendsLoading, setDividendsLoading] = useState(false)
  const [dividendsErr, setDividendsErr] = useState('')
  useEffect(() => {
    if (tab !== 'dividends') return
    let cancelled = false
    setDividendsLoading(true); setDividendsErr(''); setDividends([])
    getPortfolioDividends(activeAccountId)
      .then(r => { if (!cancelled) setDividends(r.data.dividends || []) })
      .catch(() => { if (!cancelled) setDividendsErr(t(lang, 'loadError')) })
      .finally(() => { if (!cancelled) setDividendsLoading(false) })
    return () => { cancelled = true }
  }, [tab, activeAccountId])

  const refreshPortfolio = (accId = activeAccountId) => {
    setLoading(true)
    getPortfolio(accId).then(res => {
      const pos = {}
      ;(res.data.positions || []).forEach(p => { pos[p.symbol] = { qty: p.qty, avgPrice: p.avg_price } })
      setPositions(pos)
      setOrders(res.data.orders || [])
      setAccounts(res.data.accounts || [])
      setAccount(res.data.account || null)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  // Bascule d'un compte à l'autre : demande toujours confirmation explicite
  // pour éviter de mélanger les ordres entre les sous-portefeuilles.
  const requestSwitch = acc => {
    if (acc.id === activeAccountId) return
    setSwitchModal(acc)
  }

  const confirmSwitch = () => {
    if (!switchModal) return
    const id = switchModal.id
    setSwitchModal(null)
    applyActiveAccount(id)
    setSheetOpen(false)
    refreshPortfolio(id)
  }

  const retryPayVerify = async () => {
    if (!payBanner?.orderId) return
    setAccBusy(true)
    try {
      const r = await verifyDepositOrder(payBanner.orderId)
      const st = r.data.order?.status
      const amount = r.data.order?.amount ?? payBanner.amount
      const accountName = r.data.account?.name || payBanner.accountName
      if (st === 'accepted') {
        setPayBanner({ kind: 'confirmed', amount, accountName, orderId: payBanner.orderId })
        refreshPortfolio()
      } else if (st === 'pending') {
        setPayBanner(b => ({ ...b, kind: 'pending' }))
      } else {
        setPayBanner({ kind: 'failed', amount, accountName, orderId: payBanner.orderId })
      }
    } catch {
      setPayBanner(b => ({ ...b, kind: 'failed' }))
    } finally {
      setAccBusy(false)
    }
  }

  const submitMoney = async () => {
    const amt = parseFloat(moneyAmt)
    if (!(amt > 0)) { setMoneyErr(t(lang, 'accAmountInvalid')); return }
    setAccBusy(true)
    setMoneyErr('')
    try {
      // Compte réel relié à une SGI : le dépôt passe par Stripe (checkout).
      if (moneyModal.mode === 'deposit' && moneyModal.account.type === 'real') {
        const accName = moneyModal.account.name
        const res = await initiateDeposit(moneyModal.account.id, amt)
        setMoneyModal(null)
        setMoneyAmt('')
        if (res.data.payment_url) {
          setPayBanner({ kind: 'pending', amount: amt, accountName: accName, orderId: res.data.order.id })
          window.location.href = res.data.payment_url
        } else {
          setPayBanner({ kind: 'failed', amount: amt, accountName: accName, orderId: res.data.order.id })
        }
        return
      }
      const call = moneyModal.mode === 'deposit'
        ? depositPortfolioAccount(moneyModal.account.id, amt)
        : withdrawPortfolioAccount(moneyModal.account.id, amt)
      await call
      setMoneyModal(null)
      setMoneyAmt('')
      refreshPortfolio()
    } catch (e) {
      setMoneyErr(e.response?.data?.detail || t(lang, 'loadError'))
    } finally {
      setAccBusy(false)
    }
  }

  const submitCreate = async () => {
    if (accounts.length >= 5) { setAccErr(t(lang, 'accMaxAccounts')); return }
    if (createType === 'real') { setCreateOpen(false); router.push('/compte-titre'); return }
    setAccBusy(true)
    setAccErr('')
    try {
      const res = await createPortfolioAccount({
        name: createName || null,
        type: createType,
        currency: createCurrency,
      })
      const id = res.data.account.id
      setCreateOpen(false)
      setCreateName('')
      setCreateType('demo')
      setCreateCurrency('XOF')
      applyActiveAccount(id)
      setSheetOpen(false)
      refreshPortfolio(id)
    } catch (e) {
      setAccErr(e.response?.data?.detail || t(lang, 'loadError'))
    } finally {
      setAccBusy(false)
    }
  }

  const deleteAccount = async acc => {
    if (!window.confirm(t(lang, 'accDeleteConfirm'))) return
    setAccBusy(true)
    setAccErr('')
    try {
      await deletePortfolioAccount(acc.id)
      if (acc.id === activeAccountId) {
        setActiveAccountId(null)
        clearActiveAccountId(user)
        refreshPortfolio(null)
      } else {
        refreshPortfolio()
      }
    } catch (e) {
      setAccErr(e.response?.data?.detail || t(lang, 'loadError'))
    } finally {
      setAccBusy(false)
    }
  }

  const openSell = p => {
    setSellPos(p)
    setSellQty(String(p.qty))
    setSellType('market')
    setSellLimit('')
    setSellTp('')
    setSellSl('')
    setSellUnlimited(true)
    setSellValidUntil('')
    setSellErr('')
    setSellInfo('')
  }

  const submitSell = async () => {
    const qty = parseFloat(sellQty)
    if (!(qty > 0)) { setSellErr(t(lang, 'accAmountInvalid')); return }
    if (qty > sellPos.qty + 1e-9) { setSellErr(t(lang, 'tradeInsufficient')); return }
    const px = sellType === 'limit'
      ? parseFloat(sellLimit)
      : (Number(sellPos.price) > 0 ? Number(sellPos.price) : (Number(sellPos.avg) > 0 ? Number(sellPos.avg) : 0))
    if (!(px > 0)) { setSellErr(t(lang, 'accInvalidPrice')); return }
    const tpV = parseFloat(sellTp) || null
    const slV = parseFloat(sellSl) || null
    if (tpV && tpV <= px) { setSellErr(t(lang, 'accTpAbove')); return }
    if (slV && slV >= px) { setSellErr(t(lang, 'accSlBelow')); return }
    setSellBusy(true)
    setSellErr('')
    const validUntil = (sellType === 'limit' && !sellUnlimited && sellValidUntil)
      ? new Date(sellValidUntil).toISOString()
      : null
    try {
      const r = await placeOrder({
        symbol: sellPos.symbol,
        side: 'sell',
        qty,
        price: px,
        order_type: sellType,
        limit_price: sellType === 'limit' ? px : null,
        take_profit: tpV,
        stop_loss: slV,
        valid_until: validUntil,
        account_id: activeAccountId,
      })
      if (r?.data?.status === 'pending') {
        setSellInfo(t(lang, 'ordPendingOpen'))
        refreshPortfolio()
      } else {
        setSellPos(null)
        refreshPortfolio()
      }
    } catch (e) {
      setSellErr(e.response?.data?.detail || t(lang, 'loadError'))
    } finally {
      setSellBusy(false)
    }
  }

  const openRename = acc => {
    setRenameVal(acc.name)
    setRenameErr('')
    setRenameModal(acc)
  }

  const submitRename = async () => {
    const name = renameVal.trim()
    if (!name) { setRenameErr(t(lang, 'accNameRequired')); return }
    setRenameBusy(true)
    setRenameErr('')
    try {
      await renamePortfolioAccount(renameModal.id, name)
      setRenameModal(null)
      refreshPortfolio()
    } catch (e) {
      setRenameErr(e.response?.data?.detail || t(lang, 'loadError'))
    } finally {
      setRenameBusy(false)
    }
  }

  const tabs = [
    { id: 'positions', label: t(lang, 'pfOpenPositions') },
    { id: 'orders', label: t(lang, 'pfPendingOrders') },
    { id: 'dividends', label: t(lang, 'pfDividends') },
    { id: 'history', label: t(lang, 'pfHistory') },
  ]

  return (
    <div className="mobile-root">
      <header className="top-bar">
        <button className="acct-capsule" onClick={() => router.push('/profile')} aria-label={t(lang, 'account')}>
          <span className="acct-avatar">R</span>
          <span className="acct-balance mono">{loading && user ? '···' : fmtMoney(totals.value, account?.currency)}</span>
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

      {payBanner && (
        <div className={`pay-banner ${payBanner.kind}`}>
          <div className="pay-banner-txt">
            <strong>
              {payBanner.kind === 'confirmed' && t(lang, 'payConfirmed').replace('{amount}', fmtMoney(payBanner.amount))}
              {payBanner.kind === 'pending' && t(lang, 'payPending')}
              {payBanner.kind === 'failed' && t(lang, 'payFailed')}
            </strong>
            {payBanner.kind === 'confirmed' && (
              <span className="pay-banner-sub">{t(lang, 'payStripeNote')}</span>
            )}
            {payBanner.kind !== 'confirmed' && payBanner.accountName && (
              <span className="pay-banner-sub">{payBanner.accountName}</span>
            )}
          </div>
          {payBanner.kind === 'pending' && (
            <button className="pay-banner-btn" onClick={retryPayVerify} disabled={accBusy}>
              {t(lang, 'payCheckAgain')}
            </button>
          )}
          <button className="pay-banner-x" onClick={() => setPayBanner(null)} aria-label="close"><X size={14} /></button>
        </div>
      )}

      <div className="safe-area pf-safe">
        {user && (
          <div className="pf-accbar">
            {accounts.map(a => (
              <button
                key={a.id}
                className={`pf-acc-chip ${a.id === activeAccountId ? 'active' : ''} ${a.type === 'real' ? 'real' : ''}`}
                onClick={() => a.id === activeAccountId ? setSheetOpen(true) : requestSwitch(a)}
              >
                <span className="pf-acc-ico">
                  {a.type === 'real' ? <Landmark size={14} strokeWidth={2.2} /> : <FlaskConical size={14} strokeWidth={2.2} />}
                </span>
                <span className="pf-acc-name">{a.name}</span>
                <span className="pf-acc-bal mono">{fmtMoney(a.balance, a.currency)}</span>
                {a.id === activeAccountId && (
                  <>
                    <span className="pf-acc-active-tag">{t(lang, 'accActiveTag')}</span>
                    <ChevronDown size={14} className="pf-acc-chev" />
                  </>
                )}
              </button>
            ))}
            <button
              className="pf-acc-add"
              aria-label={t(lang, 'accNew')}
              onClick={() => { setAccErr(''); setCreateOpen(true) }}
            >
              <Plus size={20} strokeWidth={2.6} />
            </button>
          </div>
        )}

        <div className="tt-row">
          <h1 className="tt-title">{t(lang, 'portfolio')}</h1>
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

        {user && !loading && (
          <div className="pf-money-cards">
            <button
              className="pf-money-card deposit"
              onClick={() => {
                const acc = account || accounts.find(a => a.id === activeAccountId) || accounts[0]
                if (!acc) return
                if (acc.type === 'real') {
                  router.push({ pathname: '/paiement', query: { account: acc.id, mode: 'deposit' } })
                  return
                }
                setMoneyErr('')
                setMoneyAmt('')
                setMoneyModal({ mode: 'deposit', account: acc })
              }}
            >
              <span className="pf-money-ico"><ArrowDownToLine size={20} strokeWidth={2.2} /></span>
              <span className="pf-money-txt">
                <strong>{t(lang, 'accDeposit')}</strong>
              </span>
            </button>
            <button
              className="pf-money-card withdraw"
              onClick={() => {
                const acc = account || accounts.find(a => a.id === activeAccountId) || accounts[0]
                if (!acc) return
                if (acc.type === 'real') {
                  router.push({ pathname: '/paiement', query: { account: acc.id, mode: 'withdraw' } })
                  return
                }
                setMoneyErr('')
                setMoneyAmt('')
                setMoneyModal({ mode: 'withdraw', account: acc })
              }}
            >
              <span className="pf-money-ico"><ArrowUpFromLine size={20} strokeWidth={2.2} /></span>
              <span className="pf-money-txt">
                <strong>{t(lang, 'accWithdraw')}</strong>
              </span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-row"><TriLoader compact /></div>
        ) : !user ? (
          <EmptyState
            title={t(lang, 'authRequired')}
            sub={t(lang, 'authRequiredSub')}
            btn={t(lang, 'authLogin')}
            onClick={() => router.push(`/login?next=${encodeURIComponent(router.asPath)}`)}
          />
        ) : tab === 'positions' ? (
          positionList.length ? (
            !stocksReady ? (
              <div className="loading-row"><TriLoader compact /></div>
            ) : (
            <>
              <div className="pf-stats">
                <div className="pf-stat">
                  <span className="pf-stat-l">{t(lang, 'pfTotalValue')} ({curLabel(account?.currency)})</span>
                  <span className="pf-stat-v mono">{fmtMoney(totals.value, account?.currency)}</span>
                </div>
                <div className="pf-stat">
                  <span className="pf-stat-l">{t(lang, 'pfInvested')}</span>
                  <span className="pf-stat-v mono">{fmtMoney(totals.cost, account?.currency)}</span>
                </div>
                <div className="pf-stat">
                  <span className="pf-stat-l">{t(lang, 'pfDayPl')}</span>
                  <span className={`pf-stat-v mono ${totals.dayPl >= 0 ? 'up' : 'down'}`}>
                    {fmtPlPct(totals.dayPlPct)}
                    <small className="mono">{totals.dayPl >= 0 ? '+' : ''}{fmtMoney(totals.dayPl, account?.currency)}</small>
                  </span>
                </div>
                <div className="pf-stat">
                  <span className="pf-stat-l">{t(lang, 'pfTotalPl')}</span>
                  <span className={`pf-stat-v mono ${totals.totalPl >= 0 ? 'up' : 'down'}`}>
                    {fmtPlPct(totals.totalPlPct)}
                    <small className="mono">{totals.totalPl >= 0 ? '+' : ''}{fmtMoney(totals.totalPl, account?.currency)}</small>
                  </span>
                </div>
              </div>

              <div className="pf-sort">
                {[
                  { id: 'value', label: t(lang, 'pfSortValue') },
                  { id: 'pl', label: t(lang, 'pfSortPl') },
                  { id: 'day', label: t(lang, 'pfSortDay') },
                ].map(s => (
                  <button
                    key={s.id}
                    className={`pf-sort-btn ${sort === s.id ? 'active' : ''}`}
                    onClick={() => setSort(s.id)}
                  >{s.label}</button>
                ))}
              </div>

              <div className="px-list">
                {sortedList.map(p => {
                  const up = p.pl >= 0
                  const chgUp = (p.chg ?? 0) >= 0
                  const cur = account?.currency
                  const curSuffix = cur === 'XOF' ? ' FCFA' : ''
                  return (
                    <div key={p.symbol} className="pos-row" onClick={() => openSell(p)}>
                      <div className="pos-logo" style={{ background: `hsl(${(p.symbol?.charCodeAt(0) || 0) * 30}, 50%, 30%)` }}>
                        {p.stock?.logo_url ? (
                          <img
                            src={p.stock.logo_url} alt={p.symbol}
                            onLoad={e => applyLogoBackground(e.currentTarget.parentElement, e.currentTarget)}
                            onError={onLogoError}
                          />
                        ) : p.symbol?.[0]}
                      </div>
                      <div className="pos-info">
                        <div className="pos-name">{p.stock?.name || p.symbol}</div>
                        <div className="pos-qty">{p.qty} {t(lang, 'shares')}</div>
                      </div>
                      <div className="pos-right">
                        <div className={`pos-price mono ${chgUp ? 'up' : 'down'}`}>{fmtMoney(p.value, cur)}{curSuffix}</div>
                        <div className={`pos-perf mono ${up ? 'up' : 'down'}`}>{fmtPlPct(p.plPct)} · {up ? '+' : ''}{fmtMoney(p.pl, cur)}{curSuffix}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
            )
          ) : (
            <EmptyState title={t(lang, 'pfEmptyTitle')} btn={t(lang, 'pfOpenPosition')} onClick={() => router.push('/watchlist')} />
          )
        ) : tab === 'orders' ? (
          pendingOrders.length ? (
            <div className="px-list">
              {pendingOrders.map(o => {
                const buy = o.side === 'buy'
                const when = o.created_at ? new Date(o.created_at) : null
                const stKey = o.status === 'pending' ? 'statusPending' : o.status === 'cancelled' ? 'statusCancelled' : 'statusExecuted'
                return (
                  <div key={o.id} className="order-row">
                    <span className={`order-side ${buy ? 'buy' : 'sell'}`}>{buy ? t(lang, 'buy') : t(lang, 'sell')}</span>
                    <div className="order-info">
 <div className="order-sym mono">
                        {o.symbol}
                      </div>
                      <div className="order-detail">
                        {when ? when.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—'} · {o.qty} {t(lang, 'shares')} @ {fmtMoney(o.price, account?.currency)} {curLabel(account?.currency)}
                        {o.valid_until && <span className="order-valid" style={{ fontSize: 11, color: '#8C99AF' }}> · {t(lang, 'orderValidUntil')} {new Date(o.valid_until).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}</span>}
                      </div>
                    </div>
                    <div className="order-right">
                      <span className={`order-status ${o.status}`}>{t(lang, stKey)}</span>
                      <span className="order-total mono">{fmtMoney((o.qty || 0) * (o.price || 0), account?.currency)} {curLabel(account?.currency)}</span>
                      {o.status === 'pending' && (
                        <button className="order-cancel" style={{ marginTop: 6, alignSelf: 'flex-end', padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(244,63,94,0.45)', background: 'rgba(244,63,94,0.1)', color: '#F4435E', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => cancelOrder(o.id).then(() => refreshPortfolio()).catch(() => {})}>{t(lang, 'orderCancel')}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState title={t(lang, 'pfEmptyTitle')} btn={t(lang, 'pfOpenPosition')} onClick={() => router.push('/watchlist')} />
          )
        ) : tab === 'history' ? (
          historyOrders.length ? (
            <div className="px-list">
              {historyOrders.map(o => {
                const buy = o.side === 'buy'
                const when = o.created_at ? new Date(o.created_at) : null
                const stKey = o.status === 'pending' ? 'statusPending' : o.status === 'cancelled' ? 'statusCancelled' : 'statusExecuted'
                return (
                  <div key={o.id} className="order-row">
                    <span className={`order-side ${buy ? 'buy' : 'sell'}`}>{buy ? t(lang, 'buy') : t(lang, 'sell')}</span>
                    <div className="order-info">
                      <div className="order-sym mono">
                        {o.symbol}
                      </div>
                      <div className="order-detail">
                        {when ? when.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—'} · {o.qty} {t(lang, 'shares')} @ {fmtMoney(o.price, account?.currency)} {curLabel(account?.currency)}
                      </div>
                    </div>
                    <div className="order-right">
                      <span className={`order-status ${o.status}`}>{t(lang, stKey)}</span>
                      <span className="order-total mono">{fmtMoney((o.qty || 0) * (o.price || 0), account?.currency)} {curLabel(account?.currency)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState title={t(lang, 'pfEmptyTitle')} btn={t(lang, 'pfOpenPosition')} onClick={() => router.push('/watchlist')} />
          )
        ) : tab === 'dividends' ? (
          dividendsLoading ? (
            <div className="px-list"><div className="order-detail" style={{ padding: 20, color: '#8C99AF' }}>{t(lang, 'loading')}</div></div>
          ) : dividendsErr ? (
            <div className="order-err" style={{ margin: 16 }}>{dividendsErr}</div>
          ) : dividends.length ? (
            <div className="px-list">
              <div className="div-total-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: 8, background: 'rgba(46,204,113,0.08)', borderRadius: 10, fontWeight: 700 }}>
                <span>{t(lang, 'divTotal')}</span>
                <span className="mono">{fmtMoney(dividends.reduce((s, d) => s + d.amount, 0), account?.currency)} {curLabel(account?.currency)}</span>
              </div>
              {dividends.map(d => (
                <div key={`${d.symbol}-${d.fiscal_year}`} className="order-row">
                  <span className="order-side">{d.symbol}</span>
                  <div className="order-info">
                    <div className="order-sym mono">{d.name}</div>
                    <div className="order-detail">
                      {t(lang, 'divFiscalYear')} {d.fiscal_year} · {fmtMoney(d.dividend_per_share, d.currency)} {curLabel(d.currency)} {t(lang, 'divPerShare')} · {d.shares} {t(lang, 'shares')}
                    </div>
                  </div>
                  <div className="order-right">
                    <span className="order-total mono">{fmtMoney(d.amount, d.currency)} {curLabel(d.currency)}</span>
                    {d.payment_date && (
                      <span className="order-valid" style={{ fontSize: 11, color: '#8C99AF' }}>
                        {new Date(d.payment_date).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title={t(lang, 'pfNoDividends')} />
          )
        ) : (
          <EmptyState title={t(lang, 'pfEmptyTitle')} btn={t(lang, 'pfOpenPosition')} onClick={() => router.push('/watchlist')} />
        )}
      </div>

      <BottomNav active="portfolio" />

      {sheetOpen && user && (
        <div className="modal-overlay" onClick={() => setSheetOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{t(lang, 'accTitle')}</span>
              <button className="icon-btn" onClick={() => setSheetOpen(false)}><X size={18} /></button>
            </div>
            {accErr && <div className="order-err">{accErr}</div>}
            <div className="acc-list">
              {accounts.map(a => (
                <div key={a.id} className={`acc-item ${a.id === activeAccountId ? 'active' : ''}`}>
                  <div className="acc-item-head">
                    <span className={`acc-item-icon ${a.type === 'real' ? 'real' : ''}`}>
                      {a.type === 'real' ? <Landmark size={16} /> : <FlaskConical size={16} />}
                    </span>
                    <div className="acc-item-info">
                      <div className="acc-item-name">
                        {a.name}
                      </div>
                      <div className="acc-item-sub">
                        {t(lang, a.type === 'real' ? 'accReal' : 'accDemo')}
                        {a.broker_name ? ` · ${a.broker_name}` : ''} · {curLabel(a.currency)} · {a.position_count} {t(lang, 'pfPositions')}
                      </div>
                    </div>
                    {a.id === activeAccountId && <Check size={18} className="acc-check" />}
                  </div>
                  <div className="acc-item-metrics">
                    <div className="acc-metric">
                      <span className="acc-metric-l">{t(lang, 'accBalance')}</span>
                      <span className="acc-metric-v mono">{fmtMoney(a.balance, a.currency)}</span>
                    </div>
                    <div className="acc-metric">
                      <span className="acc-metric-l">{t(lang, 'accInvested')}</span>
                      <span className="acc-metric-v mono">{fmtMoney(a.invested, a.currency)}</span>
                    </div>
                  </div>
                  <div className="acc-item-actions">
                    <button className="acc-act-btn" disabled={accBusy} onClick={() => { if (a.type === 'real') { router.push({ pathname: '/paiement', query: { account: a.id, mode: 'deposit' } }); return } setMoneyErr(''); setMoneyAmt(''); setMoneyModal({ mode: 'deposit', account: a }) }}>
                      <Plus size={14} /> {t(lang, 'accDeposit')}
                    </button>
                    <button className="acc-act-btn" disabled={accBusy} onClick={() => { if (a.type === 'real') { router.push({ pathname: '/paiement', query: { account: a.id, mode: 'withdraw' } }); return } setMoneyErr(''); setMoneyAmt(''); setMoneyModal({ mode: 'withdraw', account: a }) }}>
                      <Minus size={14} /> {t(lang, 'accWithdraw')}
                    </button>
                    <button className="acc-act-btn" disabled={accBusy} onClick={() => openRename(a)}>
                      <Pencil size={14} /> {t(lang, 'accRename')}
                    </button>
                    <button className="acc-act-btn danger" disabled={accBusy} onClick={() => deleteAccount(a)}>
                      <Trash2 size={14} /> {t(lang, 'accDelete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="acc-new-btn" disabled={accBusy || accounts.length >= 5} onClick={() => { setCreateOpen(true); setAccErr('') }}>
              <Plus size={16} /> {t(lang, 'accNew')}
            </button>
          </div>
        </div>
      )}

      {switchModal && (
        <div className="modal-overlay" onClick={() => setSwitchModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{t(lang, 'accSwitchTitle')}</span>
              <button className="icon-btn" onClick={() => setSwitchModal(null)}><X size={18} /></button>
            </div>
            <div className="acc-switch-acc">
              <span className={`acc-item-icon ${switchModal.type === 'real' ? 'real' : ''}`}>
                {switchModal.type === 'real' ? <Landmark size={16} /> : <FlaskConical size={16} />}
              </span>
              <div className="acc-item-info">
                <div className="acc-item-name">{switchModal.name}</div>
                <div className="acc-item-sub">
                  {t(lang, switchModal.type === 'real' ? 'accReal' : 'accDemo')}
                  {switchModal.broker_name ? ` · ${switchModal.broker_name}` : ''}
                </div>
              </div>
            </div>
              <div className="acc-item-metrics">
              <div className="acc-metric">
                <span className="acc-metric-l">{t(lang, 'accBalance')}</span>
                <span className="acc-metric-v mono">{fmtMoney(switchModal.balance, switchModal.currency)}</span>
              </div>
              <div className="acc-metric">
                <span className="acc-metric-l">{t(lang, 'accInvested')}</span>
                <span className="acc-metric-v mono">{fmtMoney(switchModal.invested, switchModal.currency)}</span>
              </div>
            </div>
            <div className="acc-switch-warn">{t(lang, 'accSwitchWarn')}</div>
            <div className="acc-switch-actions">
              <button className="modal-exec cancel" onClick={() => setSwitchModal(null)}>
                {t(lang, 'accSwitchCancel')}
              </button>
              <button className="modal-exec buy" onClick={confirmSwitch}>
                {t(lang, 'accSwitchConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {moneyModal && (
        <div className="modal-overlay" onClick={() => setMoneyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{moneyModal.mode === 'deposit' ? t(lang, 'accDeposit') : t(lang, 'accWithdraw')} · {moneyModal.account.name}</span>
              <button className="icon-btn" onClick={() => setMoneyModal(null)}><X size={18} /></button>
            </div>
            <div className="money-avail mono">{t(lang, 'accAvailable')} : {fmtMoney(moneyModal.account.balance, moneyModal.account.currency)} {curLabel(moneyModal.account.currency)}</div>
            <input className="money-input mono" type="number" min="0" step="1000" value={moneyAmt}
              placeholder="50 000" onChange={e => setMoneyAmt(e.target.value)} autoFocus />
            {moneyModal.mode === 'deposit' && moneyModal.account.type === 'real' && (
              <div className="money-pay-note">{t(lang, 'payNote')}</div>
            )}
            {moneyErr && <div className="order-err">{moneyErr}</div>}
            <button className="modal-exec buy" disabled={accBusy || !(parseFloat(moneyAmt) > 0)} onClick={submitMoney}>
              {accBusy ? '...' : (moneyModal.mode === 'deposit' ? t(lang, 'accDeposit') : t(lang, 'accWithdraw'))}
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{t(lang, 'accNew')}</span>
              <button className="icon-btn" onClick={() => setCreateOpen(false)}><X size={18} /></button>
            </div>
            <div className="otype-row">
              <button className={`otype-btn ${createType === 'demo' ? 'on' : ''}`} onClick={() => setCreateType('demo')}>{t(lang, 'accDemo')}</button>
              <button className={`otype-btn ${createType === 'real' ? 'on' : ''}`} onClick={() => { setCreateOpen(false); router.push('/compte-titre') }}>{t(lang, 'accReal')}</button>
            </div>
            <div className="acc-type-hint">{t(lang, createType === 'demo' ? 'accDemoSub' : 'accRealSub')}</div>
            {createType === 'demo' && (
              <div className="otype-row" style={{ marginTop: 8 }}>
                <button className={`otype-btn ${createCurrency === 'XOF' ? 'on' : ''}`} onClick={() => setCreateCurrency('XOF')}>BRVM · FCFA</button>
                {user?.tier === 'pro'
                  ? <button className={`otype-btn ${createCurrency === 'NGN' ? 'on' : ''}`} onClick={() => setCreateCurrency('NGN')}>NGX · ₦</button>
                  : <button className="otype-btn locked" onClick={() => router.push('/premium')} title={t(lang, 'proLocked')}>NGX · ₦ <Lock size={11} /></button>}
              </div>
            )}
            <label className="f-label">{t(lang, 'accName')}</label>
            <input className="f-input" type="text" value={createName}
              placeholder="Compte démo" onChange={e => setCreateName(e.target.value)} />
            {accErr && <div className="order-err">{accErr}</div>}
            <button className="modal-exec buy" disabled={accBusy} onClick={submitCreate}>
              {accBusy ? '...' : t(lang, 'accCreate')}
            </button>
          </div>
        </div>
      )}

      {sellPos && (
        <div className="modal-overlay" onClick={() => setSellPos(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{t(lang, 'accSell')} {sellPos.symbol}</span>
              <button className="icon-btn" onClick={() => setSellPos(null)}><X size={18} /></button>
            </div>
            <div className="acc-order-banner">
              <span className="acc-order-ico">
                {account?.type === 'real' ? <Landmark size={13} /> : <FlaskConical size={13} />}
              </span>
              <span className="acc-order-name">{account?.name || '—'}</span>
              <span className="acc-order-tag">{t(lang, account?.type === 'real' ? 'accReal' : 'accDemo')}</span>
              <span className="acc-order-bal mono">{fmtMoney(account?.balance, account?.currency)} {curLabel(account?.currency)}</span>
            </div>
            <div className="modal-price">
              <span className="mp-label">{t(lang, 'price')}</span>
              <span className="mp-val">{fmtMoney(sellPos.price || sellPos.avg, account?.currency)} {curLabel(account?.currency)}</span>
            </div>
            <div className="otype-row">
              <button className={`otype-btn ${sellType === 'market' ? 'on' : ''}`} onClick={() => setSellType('market')}>{t(lang, 'orderMarket')}</button>
              <button className={`otype-btn ${sellType === 'limit' ? 'on' : ''}`} onClick={() => setSellType('limit')}>{t(lang, 'orderLimit')}</button>
            </div>
            {sellType === 'limit' && (
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'limitPrice')} ({curLabel(account?.currency)})</span>
                <input className="tpsl-input mono" type="number" min="0" step="0.01" value={sellLimit}
                  placeholder={String((sellPos.price ?? sellPos.avg) ?? '')} onChange={e => setSellLimit(e.target.value)} />
              </div>
            )}
            {sellType === 'limit' && (
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'orderValidity')}</span>
                <label className="tm-check">
                  <input type="checkbox" checked={sellUnlimited} onChange={e => setSellUnlimited(e.target.checked)} />
                  {t(lang, 'orderUnlimited')}
                </label>
                {!sellUnlimited && (
                  <input className="tpsl-input mono" type="date" value={sellValidUntil}
                    onChange={e => setSellValidUntil(e.target.value)} />
                )}
              </div>
            )}
            <div className="tpsl-grid">
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'takeProfit')}</span>
                <input className="tpsl-input mono" type="number" min="0" step="0.01" value={sellTp}
                  placeholder={t(lang, 'opt')} onChange={e => setSellTp(e.target.value)} />
              </div>
              <div className="tpsl-row">
                <span className="tpsl-label">{t(lang, 'stopLoss')}</span>
                <input className="tpsl-input mono" type="number" min="0" step="0.01" value={sellSl}
                  placeholder={t(lang, 'opt')} onChange={e => setSellSl(e.target.value)} />
              </div>
            </div>
            <div className="qty-row">
              <button className="qty-btn" onClick={() => setSellQty(String(Math.max(1, (parseFloat(sellQty) || 1) - 1)))}><Minus size={16} /></button>
              <input type="number" min="1" step="any" value={sellQty} max={sellPos.qty}
                onChange={e => { const v = parseFloat(e.target.value); setSellQty(String(Math.max(1, Math.min(v || 1, sellPos.qty)))) }} />
              <button className="qty-btn" onClick={() => setSellQty(String(Math.min(sellPos.qty, (parseFloat(sellQty) || 1) + 1)))}><Plus size={16} /></button>
            </div>
            <div className="modal-total">
              <span>{t(lang, 'total')}</span>
              <span className="mt-val">{fmtMoney((parseFloat(sellQty) || 0) * (sellType === 'limit' && parseFloat(sellLimit) ? parseFloat(sellLimit) : (sellPos.price || sellPos.avg || 0)), account?.currency)} {curLabel(account?.currency)}</span>
            </div>
            {sellErr && <div className="order-err">{sellErr}</div>}
            {sellInfo && <div style={{ fontSize: 12, color: '#F79009', textAlign: 'center' }}>{sellInfo}</div>}
            <button className="modal-exec sell" disabled={sellBusy || !(parseFloat(sellQty) > 0)} onClick={submitSell}>
              {sellBusy ? '...' : t(lang, 'tradePlace')}
            </button>
          </div>
        </div>
      )}

      {renameModal && (
        <div className="modal-overlay" onClick={() => setRenameModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span><Pencil size={15} /> {t(lang, 'accRenameTitle')}</span>
              <button className="icon-btn" onClick={() => setRenameModal(null)}><X size={18} /></button>
            </div>
            <input className="f-input" type="text" value={renameVal} autoFocus
              onChange={e => setRenameVal(e.target.value)} />
            {renameErr && <div className="order-err">{renameErr}</div>}
            <button className="modal-exec buy" disabled={renameBusy} onClick={submitRename}>
              {renameBusy ? '...' : t(lang, 'accSave')}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .pay-banner {
          display: flex; align-items: center; gap: 10px; margin: 10px 16px 0;
          padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(24,194,124,0.4);
          background: #0D0D0D;
        }
        .pay-banner.pending { border-color: #2A2A2A; }
        .pay-banner.failed { border-color: rgba(244,63,94,0.45); }
        .pay-banner-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .pay-banner-txt strong { font-size: 13.5px; font-weight: 700; color: #F7F8FA; letter-spacing: -0.01em; }
        .pay-banner-sub { font-size: 11.5px; font-weight: 500; color: #8C99AF; line-height: 1.4; }
        .pay-banner-btn {
          flex-shrink: 0; padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(24,194,124,0.5);
          background: rgba(24,194,124,0.12); color: #2ACB8A; font-size: 12px; font-weight: 700;
          cursor: pointer; font-family: inherit;
        }
        .pay-banner-btn:disabled { opacity: 0.5; }
        .pay-banner-x {
          flex-shrink: 0; width: 24px; height: 24px; border: none; background: transparent;
          color: #5F6D85; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 8px;
        }
        .pay-banner-x:active { background: #1A1A1A; }
        .money-pay-note {
          margin-top: 10px; padding: 10px 12px; border-radius: 12px;
          border: 1px solid rgba(24,194,124,0.35); background: rgba(24,194,124,0.08);
          color: #9FACBF; font-size: 12px; font-weight: 500; line-height: 1.5;
        }
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #F7F8FA;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .top-bar { display: flex; align-items: center; justify-content: space-between; padding: 24px 22px 0; }
        .acct-capsule {
          display: flex; align-items: center; gap: 9px; height: 56px;
          padding: 0 14px 0 12px; background: rgba(255, 255, 255, 0.05); border: none; border-radius: 28px;
          cursor: pointer; min-width: 0; font-family: inherit;
        }
        .acct-avatar {
          width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          background: #0E3022; color: #2ACB8A;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
        }
        .acct-balance {
          color: #F7F8FA; font-size: 17px; font-weight: 600; white-space: nowrap; letter-spacing: 0;
        }
        .acct-chev { color: #8C99AF; flex-shrink: 0; }
        .top-icons { display: flex; align-items: center; gap: 8px; }
        .top-icon {
          width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
          color: #8C99AF; border-radius: 50%; background: none; border: none; cursor: pointer; font-family: inherit;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 0 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .tt-row { display: flex; align-items: center; justify-content: space-between; margin: 24px 22px 0; }
        .tt-title { font-size: 24px; font-weight: 600; color: #F7F8FA; margin: 0; letter-spacing: 0; }
        .tt-filter { color: #8C99AF; }
        .tx-tabs {
          display: flex; gap: 10px; overflow-x: auto; padding: 16px 22px 0;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .tx-tabs::-webkit-scrollbar { display: none; }
        .tx-tab {
          flex-shrink: 0; height: 40px; padding: 0 20px; border-radius: 20px; border: none;
          font-family: inherit; font-size: 14px; letter-spacing: 0; white-space: nowrap; cursor: pointer;
        }
        .tx-tab.active { background: #FFFFFF; color: #111111; font-weight: 700; }
        .tx-tab:not(.active) { background: #1C1C1C; color: #8996AE; font-weight: 500; }
        .loading-row { display: flex; justify-content: center; padding: 60px 0; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #1C1C1C; border-top-color: #2ACB8A;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pf-stats {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          padding: 24px 24px 0;
        }
        .pf-stat {
          background: rgba(255, 255, 255, 0.05); border: 1px solid #1C1C1C; border-radius: 16px;
          padding: 14px 16px; display: flex; flex-direction: column; gap: 7px;
        }
        .pf-stat-l { font-size: 12px; font-weight: 500; color: #8C99AF; letter-spacing: 0.1px; }
        .pf-stat-v { font-size: 22px; font-weight: 700; color: #F7F8FA; letter-spacing: 0; }
        .pf-stat-v small { display: block; font-size: 13px; font-weight: 500; margin-top: 2px; color: inherit; }
        .pf-sort {
          display: flex; gap: 8px; padding: 18px 20px 0;
        }
        .pf-sort-btn {
          flex-shrink: 0; height: 32px; padding: 0 15px; border-radius: 16px; border: 1px solid #1C1C1C;
          background: rgba(255, 255, 255, 0.05); color: #8C99AF; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit; letter-spacing: 0;
        }
        .pf-sort-btn.active { background: #FFFFFF; border-color: #FFFFFF; color: #111111; font-weight: 700; }
        .pos-sub2 {
          display: flex; align-items: center; gap: 8px; margin-top: 4px;
        }
        .pos-day { font-size: 12px; font-weight: 600; }
        .pos-pl-amt { font-size: 12px; font-weight: 500; }
        .px-list { padding: 20px 0 24px; display: flex; flex-direction: column; gap: 14px; }
        .pos-row {
          display: flex; align-items: center; gap: 13px;
          background: rgba(255, 255, 255, 0.05); border: 1px solid #1C1C1C; border-radius: 18px;
          padding: 15px 14px; cursor: pointer;
        }
        .pos-logo {
          width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 15px; overflow: hidden;
        }
        .pos-logo img { width: 100%; height: 100%; object-fit: contain; padding: 7px; box-sizing: border-box; }
        .pos-info { flex: 1; min-width: 0; }
        .pos-name {
          font-size: 15px; font-weight: 600; color: #F7F8FA;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pos-sub {
          font-size: 12px; font-weight: 400; color: #8C99AF; margin-top: 3px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pos-qty { font-size: 12px; font-weight: 500; color: #8C99AF; margin-top: 2px; }
        .pos-price { font-size: 16px; font-weight: 700; }
        .pos-perf { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px; }
        .pos-tpsl { margin-left: 8px; font-size: 11px; font-weight: 700; }
        .pos-tpsl.up { color: #2ACB8A; }
        .pos-tpsl.down { color: #F04438; }
        .pos-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .pos-value { font-size: 16px; font-weight: 700; color: #F7F8FA; }
        .pos-pl { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; }
        .mono { font-variant-numeric: tabular-nums; }
        .up { color: #2ACB8A; }
        .down { color: #F04438; }
        .order-row {
          display: flex; align-items: center; gap: 12px;
          padding: 15px 0; border-bottom: 1px solid #1C1C1C;
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
        .pf-money-cards {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          padding: 16px 22px 0;
        }
        .pf-money-card {
          display: flex; align-items: center; gap: 12px;
          border-radius: 18px; padding: 16px; cursor: pointer; font-family: inherit;
          border: none; text-align: left;
          transition: transform 160ms ease-out, opacity 160ms ease-out;
        }
        .pf-money-card:active { transform: scale(0.97); opacity: 0.92; }
        .pf-money-card.deposit {
          background: linear-gradient(135deg, #18C27C, #00A843);
          box-shadow: 0 8px 22px rgba(24, 194, 124, 0.22);
        }
        .pf-money-card.withdraw { background: rgba(255, 255, 255, 0.05); border: 1px solid #262626; }
        .pf-money-ico {
          width: 42px; height: 42px; flex-shrink: 0; border-radius: 13px;
          display: flex; align-items: center; justify-content: center;
        }
        .pf-money-card.deposit .pf-money-ico { background: rgba(0, 19, 10, 0.25); color: #00130a; }
        .pf-money-card.withdraw .pf-money-ico { background: rgba(255, 255, 255, 0.08); color: #E8EEF7; }
        .pf-money-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .pf-money-txt strong { font-size: 15.5px; font-weight: 800; letter-spacing: 0; }
        .pf-money-card.deposit .pf-money-txt strong { color: #00130a; }
        .pf-money-card.withdraw .pf-money-txt strong { color: #F7F8FA; }

        .acc-chip {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255, 255, 255, 0.05); border: 1px solid #262626; border-radius: 14px;
          padding: 10px 14px; cursor: pointer; color: inherit; font-family: inherit;
          width: 100%; box-sizing: border-box;
        }
        .pf-accbar {
          display: flex; align-items: center; gap: 10px;
          overflow-x: auto; padding: 16px 22px 0;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .pf-accbar::-webkit-scrollbar { display: none; }
        .pf-acc-chip {
          flex-shrink: 0; display: flex; align-items: center; gap: 8px;
          height: 44px; padding: 0 16px; border-radius: 22px;
          background: rgba(255, 255, 255, 0.05); border: 1px solid #262626;
          color: #E8EEF7; cursor: pointer; font-family: inherit;
          transition: background 160ms ease-out, border-color 160ms ease-out, transform 160ms ease-out;
        }
        .pf-acc-chip:active { transform: scale(0.97); }
        .pf-acc-chip.active {
          background: #FFFFFF; border-color: #FFFFFF;
        }
        .pf-acc-chip.active .pf-acc-name { color: #111111; }
        .pf-acc-chip.active .pf-acc-bal { color: #18C27C; }
        .pf-acc-ico {
          width: 26px; height: 26px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px; background: rgba(24,194,124,0.12); color: #18C27C;
        }
        .pf-acc-chip.real .pf-acc-ico { background: rgba(24,194,124,0.14); color: #2ACB8A; }
        .pf-acc-chip.active .pf-acc-ico { background: rgba(24,194,124,0.16); }
        .pf-acc-name { font-size: 13px; font-weight: 700; color: #F7F8FA; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
        .pf-acc-bal { font-size: 12px; font-weight: 700; color: #8C99AF; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .pf-acc-active-tag {
          flex-shrink: 0; font-size: 9px; font-weight: 600; letter-spacing: 0;
          color: #18C27C; background: rgba(24,194,124,0.14);
          padding: 3px 7px; border-radius: 8px; text-transform: uppercase;
        }
        .pf-acc-chev { color: #111111; flex-shrink: 0; }
        .pf-acc-add {
          flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%;
          background: linear-gradient(135deg, #18C27C, #00A843); border: none;
          color: #00130a; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 6px 18px rgba(24, 194, 124, 0.3);
          transition: transform 160ms ease-out, opacity 160ms ease-out;
        }
        .pf-acc-add:active { transform: scale(0.94); opacity: 0.9; }

        .pos-sell {
          flex-shrink: 0; align-self: center;
          height: 30px; padding: 0 12px; border-radius: 9px;
          border: 1px solid rgba(240,68,56,0.45); background: rgba(240,68,56,0.1);
          color: #F04438; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
        }

        .acc-list { display: flex; flex-direction: column; gap: 10px; max-height: 58vh; overflow-y: auto; }
        .acc-item {
          background: rgba(255, 255, 255, 0.05); border: 1px solid #222; border-radius: 14px;
          padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
        }
        .acc-item.active { border-color: rgba(24,194,124,0.45); }
        .acc-item-head { display: flex; align-items: center; gap: 10px; }
        .acc-item-icon {
          width: 34px; height: 34px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px; background: rgba(24,194,124,0.12); color: #18C27C;
        }
        .acc-item-icon.real { background: rgba(139,92,246,0.14); color: #a78bfa; }
        .acc-item-info { flex: 1; min-width: 0; }
        .acc-item-name {
          display: flex; align-items: center; gap: 6px;
          font-size: 14px; font-weight: 700; color: #F7F8FA;
        }
        .acc-item-sub { font-size: 11px; color: #8C99AF; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acc-check { color: #18C27C; flex-shrink: 0; }
        .acc-item-metrics { display: flex; gap: 10px; }
        .acc-metric {
          flex: 1; background: rgba(255, 255, 255, 0.04); border-radius: 10px; padding: 8px 10px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .acc-metric-l { font-size: 10px; color: #8C99AF; text-transform: uppercase; letter-spacing: 0.15px; font-weight: 600; }
        .acc-metric-v { font-size: 14px; font-weight: 700; color: #F7F8FA; }
        .acc-item-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .acc-act-btn {
          flex-shrink: 0; height: 34px; padding: 0 12px; border-radius: 9px;
          border: 1px solid #2A2A2A; background: rgba(255, 255, 255, 0.04); color: #E8EEF7;
          font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; gap: 5px;
        }
        .acc-act-btn:disabled { opacity: 0.5; cursor: default; }
        .acc-act-btn.danger { border-color: rgba(240,68,56,0.4); color: #F04438; }
        .acc-new-btn {
          width: 100%; height: 46px; border-radius: 13px;
          border: 1px dashed rgba(24,194,124,0.5); background: rgba(24,194,124,0.08);
          color: #18C27C; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 7px;
        }
        .acc-new-btn:disabled { opacity: 0.4; cursor: default; }
        .acc-type-hint { font-size: 11px; color: #8C99AF; line-height: 1.5; }
        .f-label { font-size: 11px; color: #9AA3B2; font-weight: 600; }
        .f-input {
          width: 100%; box-sizing: border-box;
          background: #1B1B1B; border: 1px solid #2a2a2a; border-radius: 10px;
          color: #fff; font-size: 14px; padding: 10px 12px; outline: none; font-family: inherit;
        }
        .f-input:focus { border-color: rgba(24,194,124,0.5); }
        .money-avail { font-size: 12px; color: #8C99AF; }
        .money-input {
          width: 100%; box-sizing: border-box;
          background: #1B1B1B; border: 1px solid #2a2a2a; border-radius: 12px;
          color: #fff; font-size: 22px; font-weight: 700; padding: 12px 14px; outline: none;
        }
        .money-input:focus { border-color: rgba(24,194,124,0.5); }

        .modal-overlay {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(0,0,0,0.7); display: flex; align-items: flex-end; justify-content: center;
        }
        .modal {
          width: 100%; max-width: 480px;
          background: #141414; border-radius: 20px 20px 0 0;
          padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 10px;
        }
        .modal-head { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; }
        .icon-btn {
          width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .modal-price {
          display: flex; justify-content: space-between; align-items: center;
          background: #1B1B1B; border-radius: 12px; padding: 12px 14px;
        }
        .mp-label { font-size: 12px; color: #9AA3B2; }
        .mp-val { font-size: 16px; font-weight: 700; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .otype-row { display: flex; gap: 8px; }
        .otype-btn {
          flex: 1; height: 38px;
          background: #1B1B1B; color: #9AA3B2;
          border: 1px solid #2a2a2a; border-radius: 12px;
          font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .otype-btn.on {
          background: rgba(24,194,124,0.12); color: #18C27C; border-color: rgba(24,194,124,0.4);
        }
        .tpsl-grid { display: flex; gap: 10px; }
        .tpsl-grid .tpsl-row { flex: 1; min-width: 0; }
        .tpsl-row { display: flex; flex-direction: column; gap: 5px; }
        .tpsl-label { font-size: 11px; color: #9AA3B2; }
        .tpsl-input {
          width: 100%; box-sizing: border-box;
          background: #1B1B1B; border: 1px solid #2a2a2a; border-radius: 10px;
          color: #fff; font-size: 14px; padding: 9px 12px; outline: none;
        }
        .tpsl-input:focus { border-color: rgba(24,194,124,0.5); }
        .order-err { font-size: 12px; color: #F04438; text-align: center; }
        .qty-row { display: flex; align-items: center; gap: 10px; }
        .qty-btn {
          width: 44px; height: 44px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: #1B1B1B; border: none; border-radius: 12px; color: #fff; cursor: pointer;
        }
        .qty-row input {
          flex: 1; text-align: center;
          background: #1B1B1B; border: none; border-radius: 12px;
          color: #fff; font-size: 18px; font-weight: 700;
          font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; outline: none; height: 44px;
        }
        .modal-total {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 2px; font-size: 13px; color: #9AA3B2;
        }
        .mt-val { font-size: 15px; font-weight: 700; color: #fff; font-family: Inter, sans-serif; font-variant-numeric: tabular-nums; }
        .modal-exec {
          height: 46px; border: none; border-radius: 14px;
          color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .modal-exec.buy { background: #18C27C; }
        .modal-exec.sell { background: #F04438; }
        .modal-exec.cancel { background: #262626; color: #C9CED8; }
        .modal-exec:disabled { opacity: 0.4; }
        .acc-switch-acc {
          display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,0.04); border: 1px solid #262626;
          border-radius: 14px; padding: 12px; margin-bottom: 12px;
        }
        .acc-switch-warn {
          font-size: 12.5px; line-height: 1.5; color: #C9CED8;
          background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.25);
          border-radius: 12px; padding: 10px 12px; margin: 4px 0 14px;
        }
        .acc-switch-actions { display: flex; gap: 10px; }
        .acc-switch-actions .modal-exec { flex: 1; }
        .acc-order-banner {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.04); border: 1px solid #262626;
          border-radius: 12px; padding: 9px 12px; margin-bottom: 12px; font-size: 12.5px;
        }
        .acc-order-ico {
          width: 24px; height: 24px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 7px; background: rgba(24,194,124,0.12); color: #18C27C;
        }
        .acc-order-name { font-weight: 700; color: #F7F8FA; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acc-order-tag {
          font-size: 10px; font-weight: 600; letter-spacing: 0.15px; text-transform: uppercase;
          color: #a78bfa; background: rgba(139,92,246,0.14); padding: 3px 7px; border-radius: 7px;
        }
        .acc-order-bal { font-size: 12px; font-weight: 700; color: #8C99AF; }
      `}</style>
    </div>
  )
}
