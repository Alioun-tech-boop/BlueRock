import axios from 'axios'
import { getToken, setToken, TOKEN_KEY, getValidToken } from '../lib/supabase'
import { supabase } from '../lib/supabase'

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000'
    : '')

const api = axios.create({
  baseURL: API_BASE,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(async config => {
  const token = await getValidToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise = null

function refreshSessionOnce() {
  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

api.interceptors.response.use(
  res => res,
  err => {
    const { response, config } = err
    if (response && response.status === 401 && typeof window !== 'undefined' && !config.__authRetried) {
      config.__authRetried = true
      return refreshSessionOnce()
        .then(({ data, error }) => {
          if (!error && data.session) {
            setToken(data.session.access_token)
            return api.request(config)
          }
          return Promise.reject(err)
        })
        .catch(() => Promise.reject(err))
    }
    return Promise.reject(err)
  }
)

export const getMe = () => api.get('/api/auth/me', { cache: false })
export const adminStats = () => api.get('/api/admin/stats', { cache: false })
export const adminUsers = (params) => api.get('/api/admin/users', { params, cache: false })
export const adminSetRole = (id, role) => api.patch(`/api/admin/users/${id}/role`, { role }, { cache: false })
export const adminBanUser = (id, reason) => api.post(`/api/admin/users/${id}/ban`, { reason }, { cache: false })
export const adminUnbanUser = (id) => api.post(`/api/admin/users/${id}/unban`, null, { cache: false })
export const adminPromotePro = (payload) => api.post('/api/admin/users/promote-pro', payload, { cache: false })

export const adminPosts = (params) => api.get('/api/admin/posts', { params, cache: false })
export const adminPostHide = (id) => api.post(`/api/admin/posts/${id}/hide`, null, { cache: false })
export const adminPostUnhide = (id) => api.post(`/api/admin/posts/${id}/unhide`, null, { cache: false })
export const adminPostDelete = (id) => api.delete(`/api/admin/posts/${id}`, { cache: false })

export const adminGroups = (params) => api.get('/api/admin/groups', { params, cache: false })
export const adminGroupStatus = (id, status) => api.patch(`/api/admin/groups/${id}/status`, { status }, { cache: false })

export const adminKycStats = () => api.get('/api/admin/kyc/stats', { cache: false })
export const adminKycList = (params) => api.get('/api/admin/kyc', { params, cache: false })
export const adminBrokerReview = (accountId, decision, note) =>
  api.post(`/api/brokers/${accountId}/review`, { decision, note }, { cache: false })
export const adminBrokerProgress = (accountId, stage) =>
  api.post(`/api/brokers/${accountId}/progress`, { stage }, { cache: false })
export const adminBrokerAccounts = (params) =>
  api.get(`/api/brokers/admin/accounts`, { params, cache: false })

export const adminNews = (params) => api.get('/api/admin/news', { params, cache: false })
export const adminNewsDelete = (id) => api.delete(`/api/admin/news/${id}`, { cache: false })
export const adminNewsCreate = (payload) => api.post('/api/admin/news', payload, { cache: false })
export const adminNewsUpdate = (id, payload) => api.patch(`/api/admin/news/${id}`, payload, { cache: false })
export const adminNewsRefresh = () => api.post('/api/admin/news/refresh', null, { cache: false })

export const adminCommunityUsers = (params) => api.get('/api/admin/community-users', { params, cache: false })
export const adminCommunityUserBan = (id, reason) => api.post(`/api/admin/community-users/${id}/ban`, { reason }, { cache: false })
export const adminCommunityUserUnban = (id) => api.post(`/api/admin/community-users/${id}/unban`, null, { cache: false })
export const adminCommunityUserVerify = (id) => api.post(`/api/admin/community-users/${id}/verify`, null, { cache: false })
export const adminCommunityUserTogglePro = (id) => api.post(`/api/admin/community-users/${id}/toggle-pro`, null, { cache: false })

export const adminGroupCreate = (payload) => api.post('/api/admin/groups', payload, { cache: false })
export const adminGroupDelete = (id) => api.delete(`/api/admin/groups/${id}`, { cache: false })

export const adminGroupUpdateBanner = (gid, payload) => api.patch(`/api/admin/groups/${gid}/banner`, payload, { cache: false })
export const adminChallenges = () => api.get('/api/admin/challenges', { cache: false })
export const adminChallengeCreate = (payload) => api.post('/api/admin/challenges', payload, { cache: false })
export const adminChallengeUpdate = (id, payload) => api.patch(`/api/admin/challenges/${id}`, payload, { cache: false })
export const adminChallengeDelete = (id) => api.delete(`/api/admin/challenges/${id}`, { cache: false })

export const adminAnnouncements = (params) => api.get('/api/admin/announcements', { params, cache: false })
export const adminAnnouncementCreate = (payload) => api.post('/api/admin/announcements', payload, { cache: false })
export const adminAnnouncementUpdate = (id, payload) => api.patch(`/api/admin/announcements/${id}`, payload, { cache: false })
export const adminAnnouncementDelete = (id) => api.delete(`/api/admin/announcements/${id}`, { cache: false })

export const adminStatsTrend = (days = 30) => api.get(`/api/admin/stats/trend?days=${days}`, { cache: false })
export const adminReports = (params) => api.get('/api/admin/community-reports', { params, cache: false })
export const adminReportResolve = (id, action, note = '') =>
  api.post(`/api/admin/community-reports/${id}/resolve`, { action, note }, { cache: false })
export const adminAudit = (params) => api.get(`/api/ai/admin/audit`, { params, cache: false })

export default api