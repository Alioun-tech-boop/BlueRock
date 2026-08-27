export const ACTIVE_ACCOUNT_KEY = 'bluerock_active_account'
export const FAV_KEY_BASE = 'bluerock_favorites_v1'
export const PORT_KEY_BASE = 'bluerock_portfolio_v1'

function userSuffix(user) {
  const id = user?.id || user?.auth_id || null
  return id ? `_${id}` : ''
}

export function getFavKey(user) {
  return `${FAV_KEY_BASE}${userSuffix(user)}`
}

export function getPortfolioKey(user) {
  return `${PORT_KEY_BASE}${userSuffix(user)}`
}

export function getActiveAccountKey(user) {
  return `${ACTIVE_ACCOUNT_KEY}${userSuffix(user)}`
}

export function getActiveAccountId(user) {
  try {
    const perUserKey = getActiveAccountKey(user)
    let raw = localStorage.getItem(perUserKey)
    // fallback vers clé globale (migration depuis anonyme)
    if (raw == null && perUserKey !== ACTIVE_ACCOUNT_KEY) {
      raw = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
      if (raw != null) {
        try { localStorage.setItem(perUserKey, raw) } catch {}
      }
    }
    const id = parseInt(raw, 10)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch { return null }
}

export function setActiveAccountId(id, user) {
  try {
    const key = getActiveAccountKey(user)
    localStorage.setItem(key, String(id))
    // garder aussi la clé globale à jour pour compat
    if (key !== ACTIVE_ACCOUNT_KEY) localStorage.setItem(ACTIVE_ACCOUNT_KEY, String(id))
  } catch {}
}

export function clearActiveAccountId(user) {
  try {
    const key = getActiveAccountKey(user)
    localStorage.removeItem(key)
    if (key === ACTIVE_ACCOUNT_KEY) return
    // ne pas supprimer la clé globale si d'autres users l'utilisent ; on la garde
  } catch {}
}

export function migrateAnonFavToUser(user) {
  if (!user?.id && !user?.auth_id) return
  try {
    const anonKey = FAV_KEY_BASE
    const userKey = getFavKey(user)
    if (userKey === anonKey) return
    const userRaw = localStorage.getItem(userKey)
    const anonRaw = localStorage.getItem(anonKey)
    if ((userRaw == null || JSON.parse(userRaw || '[]').length === 0) && anonRaw != null) {
      const arr = JSON.parse(anonRaw || '[]')
      if (arr.length) localStorage.setItem(userKey, JSON.stringify(arr))
    }
  } catch {}
}

export function migrateAnonPortfolioToUser(user) {
  if (!user?.id && !user?.auth_id) return
  try {
    const anonKey = PORT_KEY_BASE
    const userKey = getPortfolioKey(user)
    if (userKey === anonKey) return
    const userRaw = localStorage.getItem(userKey)
    const anonRaw = localStorage.getItem(anonKey)
    if ((userRaw == null || Object.keys(JSON.parse(userRaw || '{}')).length === 0) && anonRaw != null) {
      const obj = JSON.parse(anonRaw || '{}')
      if (Object.keys(obj).length) localStorage.setItem(userKey, JSON.stringify(obj))
    }
  } catch {}
}
