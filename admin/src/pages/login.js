import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Activity } from 'lucide-react'
import { supabase, setToken, clearToken } from '../lib/supabase'
import { getMe } from '../services/api'
import { t } from '../lib/i18n'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && sessionStorage.getItem('bluerock_admin_token')) router.replace('/')
    })
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(t('loginError'))
        setBusy(false)
        return
      }
      const token = data.session.access_token
      setToken(token)
      try {
        const me = await getMe()
        // require_admin: le backend jette 403 si rôle insuffisant — on vérifie
        // en appelant /api/admin/stats ; si 403 on déconnecte.
        await import('../services/api').then(m => m.adminStats())
        router.replace('/')
      } catch (err) {
        const status = err?.response?.status
        if (status === 403 || status === 401) {
          clearToken()
          await supabase.auth.signOut()
          setError(status === 403 ? 'Accès refusé : ce compte n\'a pas les droits administrateur.' : t('loginError'))
        } else {
          setError(t('loginError'))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-root">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="chip"><Activity size={18} /></span>
          <span>
            <div className="nm">BLUEROCK</div>
            <div className="sub">{t('tagline')}</div>
          </span>
        </div>
        {error && <div className="login-err">{error}</div>}
        <div className="login-field">
          <label>{t('loginEmail')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="login-field">
          <label>{t('loginPassword')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button className="login-btn" disabled={busy || !email || !password}>
          {busy ? '…' : t('loginBtn')}
        </button>
      </form>
    </div>
  )
}