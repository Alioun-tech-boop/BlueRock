import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY manquant — auth désactivée (vérifier .env.local)')
}

const memoryStore = {}
const authStorage = {
  getItem(key) {
    if (typeof window === 'undefined') return memoryStore[key] || null
    try { return window.sessionStorage.getItem(key) } catch { return memoryStore[key] || null }
  },
  setItem(key, value) {
    if (typeof window === 'undefined') { memoryStore[key] = value; return }
    try { window.sessionStorage.setItem(key, value) } catch { memoryStore[key] = value }
  },
  removeItem(key) {
    if (typeof window === 'undefined') { delete memoryStore[key]; return }
    try { window.sessionStorage.removeItem(key) } catch {}
    delete memoryStore[key]
  },
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    persistSession: true,
    storage: authStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false, // désactivé: évite open-redirect via hash #access_token
    flowType: 'pkce',
  },
})
