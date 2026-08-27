import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY manquant — auth désactivée (vérifier .env.local)')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // désactivé: évite open-redirect via hash #access_token
    flowType: 'pkce',
  },
})
