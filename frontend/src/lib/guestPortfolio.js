const GUEST_KEY = 'bluerock_guest_portfolio_v1'
const GUEST_ORDERS_KEY = 'bluerock_guest_orders_v1'
const DEMO_LIMIT = 100_000_000

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

export function getGuestState() {
  const state = loadJSON(GUEST_KEY, null)
  if (state && state.positions) return state
  // migration depuis ancien PORT_KEY simple {symbol:{qty,avgPrice}}
  const legacy = loadJSON('bluerock_portfolio_v1', {})
  if (legacy && Object.keys(legacy).length) {
    return { balance: 10000000, positions: legacy, orders: loadJSON(GUEST_ORDERS_KEY, []) }
  }
  return { balance: 10000000, positions: {}, orders: [] }
}

export function saveGuestState(state) {
  saveJSON(GUEST_KEY, state)
}

export function getGuestPositions() {
  return getGuestState().positions || {}
}
export function getGuestOrders() {
  return getGuestState().orders || []
}

// marché ouvert BRVM 9:00-17:30 UTC lun-ven
export function isMarketOpen(now = new Date()) {
  const d = now.getUTCDay()
  if (d === 0 || d === 6) return false
  const h = now.getUTCHours() + now.getUTCMinutes()/60
  return h >= 9 && h <= 17.5
}

export function guestCapacityUsed() {
  const s = getGuestState()
  const posVal = Object.values(s.positions || {}).reduce((sum, p) => sum + (p.qty||0)*(p.avgPrice||0), 0)
  const pendingBuys = (s.orders || []).filter(o => o.status === 'pending' && o.side === 'buy')
  const pendingVal = pendingBuys.reduce((sum, o) => sum + (o.qty||0)*(o.limit_price||o.price||0), 0)
  return posVal + pendingVal
}

export function guestCanBuy(qty, price) {
  const s = getGuestState()
  if ((s.balance||0) < qty*price - 1e-9) return { ok:false, reason:'Solde insuffisant (compte invité)' }
  if (guestCapacityUsed() + qty*price > DEMO_LIMIT + 1e-9) {
    const rem = Math.max(DEMO_LIMIT - guestCapacityUsed(), 0)
    return { ok:false, reason:`Capacité démo dépassée (limite ${DEMO_LIMIT.toLocaleString()} FCFA, ${Math.round(rem).toLocaleString()} restants)` }
  }
  return { ok:true }
}

export function guestPlaceOrder({ symbol, side, qty, price, order_type='market', limit_price=null, take_profit=null, stop_loss=null, valid_until=null }) {
  const state = getGuestState()
  const now = new Date()
  const marketOpen = isMarketOpen(now)
  const placePending = (order_type === 'limit') || !marketOpen
  const order = {
    id: Date.now() + Math.floor(Math.random()*1000),
    symbol: symbol.toUpperCase(),
    side,
    qty,
    price,
    order_type,
    limit_price: order_type==='limit' ? (limit_price||price) : null,
    take_profit,
    stop_loss,
    valid_until,
    status: placePending ? 'pending' : 'executed',
    created_at: now.toISOString(),
    executed_at: placePending ? null : now.toISOString(),
    account_id: null,
  }
  if (placePending) {
    // validation vente possible
    if (side==='sell') {
      const pos = state.positions[symbol.toUpperCase()]
      if (!pos || pos.qty < qty - 1e-9) throw new Error('Vente refusée : vous ne détenez pas cette action')
    }
    state.orders = [order, ...(state.orders||[])].slice(0,100)
    saveGuestState(state)
    return { status:'pending', order, executes_at_open: !marketOpen }
  }
  // exécution immédiate
  const res = guestExecute(state, order, price)
  if (res.error) throw new Error(res.error)
  state.orders = [order, ...(state.orders||[])].slice(0,100)
  saveGuestState(state)
  return { status:'executed', order, position: res.position }
}

function guestExecute(state, order, px) {
  const sym = order.symbol
  const qty = order.qty
  const side = order.side
  if (side==='sell') {
    const pos = state.positions[sym]
    if (!pos || pos.qty < qty - 1e-9) { order.status='cancelled'; return { error:'Quantité insuffisante' } }
    const remaining = pos.qty - qty
    if (remaining <= 1e-9) delete state.positions[sym]
    else pos.qty = remaining
    state.balance = (state.balance||0) + qty*px
    order.status='executed'; order.price=px; order.executed_at=new Date().toISOString()
    return { position: state.positions[sym] || { symbol:sym, qty:0 } }
  } else {
    const can = guestCanBuy(qty, px)
    if (!can.ok) { order.status='cancelled'; return { error: can.reason } }
    const pos = state.positions[sym] || { qty:0, avgPrice:0 }
    const totalQty = pos.qty + qty
    pos.avgPrice = ((pos.avgPrice*pos.qty)+(px*qty))/totalQty
    pos.qty = totalQty
    if (order.take_profit) pos.take_profit = order.take_profit
    if (order.stop_loss) pos.stop_loss = order.stop_loss
    state.positions[sym] = pos
    state.balance = (state.balance||0) - qty*px
    order.status='executed'; order.price=px; order.executed_at=new Date().toISOString()
    return { position: pos }
  }
}

export function guestTick(latestPrices) {
  // exécute les ordres pending invités à l'ouverture ou au franchissement du cours
  const state = getGuestState()
  let changed = false
  const now = new Date()
  // expiration
  state.orders = (state.orders||[]).map(o => {
    if (o.status==='pending' && o.valid_until && new Date(o.valid_until) <= now) { changed=true; return { ...o, status:'cancelled' } }
    return o
  })
  const marketOpen = isMarketOpen(now)
  if (!marketOpen) {
    if (changed) saveGuestState(state)
    return changed
  }
  for (const order of state.orders) {
    if (order.status!=='pending') continue
    const px = latestPrices[order.symbol]
    if (px == null) continue
    if (order.order_type==='market') {
      // marché en attente → exécution au prix du marché
      guestExecute(state, order, px); changed=true
    } else {
      const triggered = (order.side==='buy' && px <= order.limit_price) || (order.side==='sell' && px >= order.limit_price)
      if (triggered) { guestExecute(state, order, px); changed=true }
    }
  }
  // TP/SL sur positions
  for (const [sym, pos] of Object.entries(state.positions||{})) {
    if (!pos.qty) continue
    const px = latestPrices[sym]
    if (px==null) continue
    let hit=null
    if (pos.stop_loss != null && px <= pos.stop_loss) hit='stop_loss'
    else if (pos.take_profit != null && px >= pos.take_profit) hit='take_profit'
    if (!hit) continue
    // vente totale au prix courant
    state.balance = (state.balance||0) + pos.qty*px
    const sellOrder = {
      id: Date.now()+Math.floor(Math.random()*1000),
      symbol: sym,
      side:'sell',
      qty: pos.qty,
      price: px,
      order_type: hit,
      status:'executed',
      created_at: now.toISOString(),
      executed_at: now.toISOString(),
    }
    delete state.positions[sym]
    state.orders = [sellOrder, ...state.orders].slice(0,100)
    changed=true
  }
  if (changed) saveGuestState(state)
  return changed
}

export function guestDeposit(amount) {
  const s = getGuestState()
  if (s.balance + amount > DEMO_LIMIT + 1e-9) throw new Error(`Dépôt refusé : plafond démo ${DEMO_LIMIT.toLocaleString()} FCFA`)
  s.balance = (s.balance||0)+amount
  saveGuestState(s)
  return s.balance
}
export function guestWithdraw(amount) {
  const s = getGuestState()
  if (amount > (s.balance||0)+1e-9) throw new Error('Retrait supérieur au solde')
  s.balance -= amount
  saveGuestState(s)
  return s.balance
}
export function guestClear() {
  try { localStorage.removeItem(GUEST_KEY); localStorage.removeItem(GUEST_ORDERS_KEY) } catch {}
}
