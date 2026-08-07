import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { legacyLogin as apiLegacyLogin, getMe, updateMe as apiUpdateMe } from '../services/api'

const TOKEN_KEY = 'bluerock_token'
const USER_KEY = 'bluerock_user'

function loadCached() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function profileFromSession(sbUser, profile) {
  const factors = sbUser?.factors || []
  const mfaEnabled = factors.some(f => f.status === 'verified')
  return {
    ...(profile || {}),
    email: sbUser?.email || profile?.email || '',
    name: sbUser?.user_metadata?.full_name || profile?.name || 'Utilisateur',
    email_verified: !!sbUser?.email_confirmed_at,
    totp_enabled: mfaEnabled,
    auth_id: sbUser?.id,
  }
}

const AuthContext = createContext({
  user: null, loading: true, recovery: false, supabase,
  login: async () => {}, register: async () => {}, verifyMfa: async () => {},
  logout: () => {}, updateUser: () => {}, refreshProfile: async () => {},
  updatePassword: async () => {},
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const profileRef = useRef(null)
  const busyRef = useRef(false)

  const persist = useCallback((u) => {
    try { localStorage.setItem(USER_KEY, JSON.stringify(u)) } catch {}
  }, [])

  const syncSession = useCallback(async (session) => {
    // session == null → déconnecté
    const sbUser = session?.user || session
    if (!sbUser) {
      profileRef.current = null
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) } catch {}
      setUser(null)
      setLoading(false)
      return
    }
    try { localStorage.setItem(TOKEN_KEY, session?.access_token || sbUser.access_token || '') } catch {}
    let profile = profileRef.current
    if (!profile) {
      try {
        const res = await getMe().catch(() => null)
        profile = res ? res.data : null
      } catch {}
      profileRef.current = profile || null
    }
    const merged = profileFromSession(sbUser, profile)
    setUser(merged)
    persist(merged)
    setLoading(false)
  }, [getMe, persist])

  useEffect(() => {
    if (busyRef.current) return
    busyRef.current = true
    supabase.auth.getSession().then(({ data }) => syncSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') setRecovery(true)
      else if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED' || _event === 'SIGNED_OUT') setRecovery(false)
      syncSession(session)
    })
    return () => sub.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email, password) => {
    let res = await supabase.auth.signInWithPassword({ email, password })
    if (res.error && /invalid|credentials/i.test(res.error.message || '')) {
      // Compte pré-Supabase → migration : vérif legacy puis reconnexion
      await apiLegacyLogin(email, password).catch(() => null)
      res = await supabase.auth.signInWithPassword({ email, password })
    }
    if (res.error) throw res.error
    const sbUser = res.data.user
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const factors = sbUser?.factors || []
    if (factors.length && aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      const first = factors.find(f => f.status === 'verified')
      if (first) {
        const ch = await supabase.auth.mfa.challenge({ factorId: first.id })
        if (ch.error) throw ch.error
        return { status: 'totp_required', factorId: first.id, challengeId: ch.data.id }
      }
    }
    await syncSession(res.data.session)
    return { status: 'ok' }
  }, [syncSession])

  const verifyMfa = useCallback(async (factorId, challengeId, code) => {
    const res = await supabase.auth.mfa.verify({ factorId, challengeId, code: code.replace(/\s/g, '') })
    if (res.error) throw res.error
    const { data: session } = await supabase.auth.getSession()
    await syncSession(session.session)
    return res.data
  }, [syncSession])

  const register = useCallback(async (payload) => {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
        data: {
          full_name: payload.name,
          account_type: payload.account_type || 'demo',
          broker_name: payload.broker_name || null,
          broker_account: payload.broker_account || null,
        },
      },
    })
    if (error) throw error
    return data.session ? { status: 'ok', user: data.user } : { status: 'pending_verification', email: payload.email }
  }, [])

  const resendVerification = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) throw error
    return { status: 'sent' }
  }, [])

  const sendResetCode = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
    })
    if (error) throw error
    return { status: 'sent' }
  }, [])

  const logout = useCallback(async () => {
    try { await supabase.auth.signOut() } catch {}
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) } catch {}
    profileRef.current = null
    setUser(null)
  }, [])

  // Mot de passe oublié : l'utilisateur clique le lien de l'email → événement
  // PASSWORD_RECOVERY → il ne reste qu'à définir le nouveau mot de passe.
  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    setRecovery(false)
    try { await supabase.auth.signOut() } catch {}
    return { status: 'reset' }
  }, [])

  const updateUser = useCallback((patch) => {
    setUser(prev => {
      const merged = { ...(prev || {}), ...patch }
      persist(merged)
      return merged
    })
    if (patch?.name !== undefined && profileRef.current) {
      profileRef.current = { ...profileRef.current, ...patch }
      apiUpdateMe({ name: patch.name, avatar: patch.avatar }).catch(() => {})
    }
    return patch
  }, [persist])

  const refreshProfile = useCallback(async () => {
    const res = await getMe().catch(() => null)
    if (!res) return
    profileRef.current = res.data
    const { data: session } = await supabase.auth.getSession()
    const merged = profileFromSession(session.session?.user || { factors: [] }, res.data)
    setUser(merged)
    persist(merged)
    return merged
  }, [persist])

  return (
    <AuthContext.Provider value={{
      user, loading, recovery, supabase,
      login, register, resendVerification, verifyMfa,
      sendResetCode, updatePassword, logout, updateUser, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
