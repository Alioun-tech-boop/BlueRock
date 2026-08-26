import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

export const TOKEN_KEY = 'bluerock_admin_token'

export function getToken() {
  try {
    return (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(TOKEN_KEY)) || ''
  } catch { return '' }
}

export function setToken(token) {
  try { sessionStorage.setItem(TOKEN_KEY, token) } catch {}
}

export function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
}

export async function getValidToken() {
  try {
    const { data } = await supabase.auth.getSession()
    let session = data.session
    if (session && session.expires_at && session.expires_at * 1000 <= Date.now()) {
      const { data: refreshed } = await supabase.auth.refreshSession()
      session = refreshed.session
    }
    const token = session?.access_token
    if (token) setToken(token)
    return token || ''
  } catch {
    return getToken()
  }
}

try {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) setToken(session.access_token)
  })
} catch {}