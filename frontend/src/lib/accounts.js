export const ACTIVE_ACCOUNT_KEY = 'bluerock_active_account'

export function getActiveAccountId() {
  try {
    const id = parseInt(localStorage.getItem(ACTIVE_ACCOUNT_KEY), 10)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch { return null }
}

export function setActiveAccountId(id) {
  try { localStorage.setItem(ACTIVE_ACCOUNT_KEY, String(id)) } catch {}
}

export function clearActiveAccountId() {
  try { localStorage.removeItem(ACTIVE_ACCOUNT_KEY) } catch {}
}
