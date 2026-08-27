import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { legacyLogin as apiLegacyLogin, getMe, updateMe as apiUpdateMe, sendOtp as apiSendOtp, verifyOtpCode as apiVerifyOtpCode, resetSessionExpiredFlag, logout as apiLogout, registerWithOtp as apiRegisterWithOtp } from '../services/api'

const TOKEN_KEY = 'bluerock_token'
const USER_KEY = 'bluerock_user'

const store = {
  get(key) {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key, value) {
    try { localStorage.setItem(key, value) } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key) } catch {}
  },
}

function loadCached() {
  try {
    const raw = store.get(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function clearSensitiveKeys() {
  try {
    // Legacy Supabase + BlueRock keys
    localStorage.removeItem('supabase.auth.token')
    // Supabase v2 stocke sb-<project>-auth-token et code-verifier
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sb-') && k.includes('-auth-token')) {
          localStorage.removeItem(k)
        }
      }
    } catch {}
    localStorage.removeItem('bluerock_broker_token')
    localStorage.removeItem('bluerock_admin_token')
    localStorage.removeItem('bluerock_active_account')
    localStorage.removeItem('bluerock_api_cache_v1')
  } catch {}
  try {
    sessionStorage.removeItem('bluerock_broker_token')
    sessionStorage.removeItem('bluerock_admin_token')
  } catch {}
  store.remove(TOKEN_KEY)
  store.remove(USER_KEY)
}

function profileFromSession(sbUser, profile) {
  const factors = sbUser?.factors || []
  const mfaEnabled = factors.some(f => f.status === 'verified')
  return {
    ...(profile || {}),
    email: sbUser?.email || profile?.email || '',
    name: profile?.name || sbUser?.user_metadata?.full_name || 'Utilisateur',
    email_verified: !!sbUser?.email_confirmed_at,
    totp_enabled: mfaEnabled,
    auth_id: sbUser?.id,
  }
}

const AuthContext = createContext({
  user: null, loading: true, recovery: false, supabase,
  login: async () => {}, register: async () => {}, verifyMfa: async () => {},
  logout: () => {}, updateUser: () => {}, refreshProfile: async () => {},
  updatePassword: async () => {}, sendOtpEmail: async () => {}, verifyOtpEmail: async () => {},
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const profileRef = useRef(null)
  const busyRef = useRef(false)
  const userRef = useRef(null)

  useEffect(() => { userRef.current = user }, [user])

  const persist = useCallback((u) => {
    try { store.set(USER_KEY, JSON.stringify(u)) } catch {}
  }, [])

  const syncSession = useCallback(async (session) => {
    let sbUser = session?.user || session
    if (!sbUser) {
      profileRef.current = null
      clearSensitiveKeys()
      setUser(null)
      setLoading(false)
      return
    }
    let rawToken = session?.access_token || sbUser.access_token || ''
    const tokenExpired = session?.expires_at && session.expires_at * 1000 < Date.now()
    if (!rawToken || tokenExpired) {
      if (tokenExpired) console.warn('[Auth] syncSession: access_token expired, refreshing...')
      try {
        const { data: rd, error } = await supabase.auth.refreshSession()
        if (!error && rd.session?.access_token) {
          rawToken = rd.session.access_token
          session = rd.session
          sbUser = rd.session.user || sbUser
        } else {
          profileRef.current = null
          clearSensitiveKeys()
          setUser(null)
          setLoading(false)
          return
        }
      } catch {
        profileRef.current = null
        clearSensitiveKeys()
        setUser(null)
        setLoading(false)
        return
      }
    }
    try { store.set(TOKEN_KEY, rawToken) } catch {}
    let profile = profileRef.current
    if (!profile) {
      try {
        const res = await getMe().catch((e) => {
          console.warn('[Auth] getMe() failed:', e?.response?.status || e?.message)
          return null
        })
        profile = res ? res.data : null
      } catch (e) { console.warn('[Auth] getMe() exception:', e) }
      profileRef.current = profile || null
    }
    const merged = profileFromSession(sbUser, profile)
    setUser(merged)
    persist(merged)
    setLoading(false)
    resetSessionExpiredFlag()
  }, [getMe, persist])

  useEffect(() => {
    if (busyRef.current) return
    busyRef.current = true
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s && s.expires_at && s.expires_at * 1000 < Date.now()) {
        supabase.auth.refreshSession().then(({ data: rd, error }) => {
          syncSession(!error && rd.session ? rd.session : null).finally(() => { busyRef.current = false })
        }).catch(() => syncSession(null).finally(() => { busyRef.current = false }))
      } else {
        syncSession(s).finally(() => { busyRef.current = false })
      }
    }).catch(() => syncSession(null).finally(() => { busyRef.current = false }))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (process.env.NODE_ENV !== 'production') console.warn('[Auth] onAuthStateChange:', _event, session ? 'has_session' : 'null_session')
      if (_event === 'PASSWORD_RECOVERY') setRecovery(true)
      else if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') setRecovery(false)
      if (_event === 'SIGNED_OUT' && !session && profileRef.current) {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) { syncSession(data.session); return }
          syncSession(null)
        }).catch(() => syncSession(null))
        return
      }
      syncSession(session)
    })
    const onExpired = () => {
      console.warn('[Auth] Session expired event received')
      if (profileRef.current || userRef.current !== null) {
        try { supabase.auth.signOut().catch(() => {}) } catch {}
      }
      profileRef.current = null
      clearSensitiveKeys()
      setUser(null)
      setLoading(false)
    }
    window.addEventListener('bluerock:session-expired', onExpired)
    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener('bluerock:session-expired', onExpired)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email, password) => {
    let res = await supabase.auth.signInWithPassword({ email, password })
    if (res.error) console.warn('[Auth] signInWithPassword error:', res.error.message)
    if (res.error && /invalid|credentials/i.test(res.error.message || '')) {
      // Compte pré-Supabase ? migration : vérif legacy puis reconnexion
      await apiLegacyLogin(email, password).catch(() => null)
      res = await supabase.auth.signInWithPassword({ email, password })
    }
    if (res.error) throw res.error
    console.warn('[Auth] Login OK, session expires:', res.data.session?.expires_at)
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
    // Backend custom OTP (Brevo/SMTP bluerock.africa@gmail.com) — pas de lien Supabase
    const res = await apiRegisterWithOtp({
      email: payload.email,
      password: payload.password,
      name: payload.name,
      account_type: payload.account_type || 'demo',
      broker_name: payload.broker_name || null,
      broker_account: payload.broker_account || null,
    })
    return { status: 'pending_verification', email: payload.email, ttl_minutes: res.data?.ttl_minutes || 10, resent: res.data?.resent, cooldown: res.data?.cooldown }
  }, [])

  const resendVerification = useCallback(async (email) => {
    const res = await apiSendOtp(email, 'verify')
    return res.data
  }, [])

  const sendResetCode = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
    })
    if (error) throw error
    return { status: 'sent' }
  }, [])

const logout = useCallback(async () => {
    try { await apiLogout().catch(() => {}) } catch {}
    try { await supabase.auth.signOut() } catch {}
    clearSensitiveKeys()
    profileRef.current = null
    setUser(null)
  }, [])

  // Mot de passe oublié : l'utilisateur clique le lien de l'email ? événement
  // PASSWORD_RECOVERY ? il ne reste qu'à définir le nouveau mot de passe.
  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    setRecovery(false)
    try { await supabase.auth.signOut() } catch {}
    return { status: 'reset' }
  }, [])

  const sendOtpEmail = useCallback(async (email, purpose = 'verify') => {
    const res = await apiSendOtp(email, purpose)
    return res.data
  }, [])

  const verifyOtpEmail = useCallback(async (email, code) => {
    const res = await apiVerifyOtpCode(email, code)
    return res.data
  }, [])

  const updateUser = useCallback((patch) => {
    setUser(prev => {
      const merged = { ...(prev || {}), ...patch }
      persist(merged)
      return merged
    })
    if ((patch?.name !== undefined || patch?.avatar !== undefined) && profileRef.current) {
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
      sendOtpEmail, verifyOtpEmail,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
