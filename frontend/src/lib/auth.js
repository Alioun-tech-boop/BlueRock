import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { login as apiLogin, register as apiRegister, getMe, logoutApi } from '../services/api'

const TOKEN_KEY = 'bluerock_token'
const USER_KEY = 'bluerock_user'

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const AuthContext = createContext({ user: null, loading: true, login: async () => {}, register: async () => {}, logout: () => {} })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    const cached = loadUser()
    if (!token) { setLoading(false); return }
    getMe()
      .then(res => {
        setUser(res.data)
        localStorage.setItem(USER_KEY, JSON.stringify(res.data))
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      })
      .finally(() => setLoading(false))
    if (cached && !user) setUser(cached)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await apiLogin(email, password)
    const data = res.data
    // Étape 2FA : aucun token final émis, on transmet la réponse à l'UI
    if (data.status === 'totp_required') return data
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data))
    setUser(data)
    return data
  }, [])

  const register = useCallback(async (payload) => {
    const res = await apiRegister(payload)
    return res.data // { status: 'pending_verification', email }
  }, [])

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem(TOKEN_KEY)) {
        await logoutApi().catch(() => {})
      }
    } catch {}
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  const completeLogin = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data))
    setUser(data)
    return data
  }, [])

  const updateUser = useCallback((data) => {
    const merged = { ...user, ...data }
    localStorage.setItem(USER_KEY, JSON.stringify(merged))
    setUser(merged)
    return merged
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, completeLogin, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
