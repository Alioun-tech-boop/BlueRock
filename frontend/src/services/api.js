import axios from 'axios'
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

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.warn('[API] API_BASE =', API_BASE, 'hostname =', window.location.hostname)
}

const CACHE_TTL_BY_PREFIX = [
  ['/api/market/overview', 120000],
  ['/api/market/live', 15000],
  ['/api/market/sparklines', 300000],
  ['/api/market/announcements', 120000],
  ['/api/market/news/article', 120000],
  ['/api/market/news', 120000],
  ['/api/market/calendar', 300000],
  ['/api/market/indices', 300000],
  ['/api/market/sectors', 300000],
  ['/api/companies/sectors', 300000],
  ['/api/companies/top-performers', 60000],
  ['/api/companies', 60000],
  ['/api/macro', 300000],
  ['/api/analysis/screen', 120000],
  ['/api/analysis/companies', 300000],
  ['/api/ingestion/summary', 60000],
]
const NO_CACHE_PREFIXES = [
  '/api/auth',
  '/api/portfolio',
  '/api/notifications',
  '/api/premium',
  '/api/community',
  '/api/brokers',
  '/api/broker-connect',
  '/api/seed',
  '/api/ingestion/pdf',
  '/api/ingestion/fetch',
  '/api/market/refresh',
  '/api/analysis/ask',
  '/api/payments',
]
const DEFAULT_TTL = 30000
const responseCache = new Map()
const PERSIST_KEY = 'bluerock_api_cache_v1'
let _lastTokenHash = null
// Nettoie le cache si l'utilisateur change (évite fuite cross-user sur même navigateur)
const _maybeClearOnTokenChange = () => {
  const token = getToken()
  let h = 'anon'
  if (token) {
    let hash = 5381
    for (let i = 0; i < token.length; i++) hash = ((hash << 5) + hash) ^ token.charCodeAt(i)
    h = (hash >>> 0).toString(36).slice(0, 8)
  }
  if (_lastTokenHash !== null && _lastTokenHash !== h) {
    responseCache.clear()
    try { localStorage.removeItem(PERSIST_KEY) } catch {}
  }
  _lastTokenHash = h
}
if (typeof window !== 'undefined') {
  try { _maybeClearOnTokenChange() } catch {}
  window.addEventListener('storage', (e) => { if (e.key === 'bluerock_token') _maybeClearOnTokenChange() })
}

const getToken = () => {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('bluerock_token')) || ''
  } catch { return '' }
}

const cacheKey = (config) => {
  const token = getToken()
  // Hash court du token pour éviter fuite cross-user (u|... partagé entre users)
  let tokenHash = 'anon'
  if (token) {
    try {
      // DJB2 simple hash, pas crypto mais suffit pour séparer
      let h = 5381
      for (let i = 0; i < token.length; i++) h = ((h << 5) + h) ^ token.charCodeAt(i)
      tokenHash = (h >>> 0).toString(36).slice(0, 8)
    } catch { tokenHash = token.slice(-8) }
  }
  const params = config.params ? JSON.stringify(config.params) : ''
  return `${tokenHash}|${config.url}${params ? `?${params}` : ''}`
}

const loadPersistent = () => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PERSIST_KEY) : null
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const savePersistent = (key, entry) => {
  try {
    if (typeof localStorage === 'undefined') return
    const all = loadPersistent()
    all[key] = entry
    let raw
    try {
      raw = JSON.stringify(all)
    } catch {
      const keys = Object.keys(all)
      let drop = 0
      while (drop < keys.length) {
        delete all[keys[drop]]
        drop++
        try { raw = JSON.stringify(all); break } catch {}
      }
    }
    if (raw) localStorage.setItem(PERSIST_KEY, raw)
  } catch {}
}

const persistentHit = (key) => {
  const all = loadPersistent()
  const entry = all[key]
  if (!entry || entry.data == null) return null
  return { data: entry.data, savedAt: entry.savedAt || 0 }
}

const notifyNetwork = (online) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('bluerock:net', { detail: { online } }))
}

const ttlFor = (url) => {
  if (!url) return DEFAULT_TTL
  for (const [prefix, ttl] of CACHE_TTL_BY_PREFIX) {
    if (url.startsWith(prefix)) return ttl
  }
  return DEFAULT_TTL
}

const isCacheable = (config) => {
  if (config.method !== 'get' || config.cache === false) return false
  const url = config.url || ''
  if (!url) return false
  return !NO_CACHE_PREFIXES.some((p) => url.startsWith(p))
}

let refreshPromise = null
let expiredNotified = false
let _notifyTimer = null

function refreshSessionOnce() {
  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

function notifySessionExpired() {
  if (typeof window === 'undefined' || expiredNotified) return
  if (_notifyTimer) return
  _notifyTimer = setTimeout(() => {
    _notifyTimer = null
    if (expiredNotified) return
    expiredNotified = true
    try { window.dispatchEvent(new CustomEvent('bluerock:session-expired')) } catch {}
  }, 3000)
}

export function resetSessionExpiredFlag() {
  expiredNotified = false
  if (_notifyTimer) { clearTimeout(_notifyTimer); _notifyTimer = null }
}

export const logout = () => {
  try { responseCache.clear(); localStorage.removeItem(PERSIST_KEY) } catch {}
  return api.post('/api/auth/logout')
}

api.interceptors.request.use(config => {
  try { _maybeClearOnTokenChange() } catch {}
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (isCacheable(config)) {
    const key = cacheKey(config)
    const hit = responseCache.get(key)
    if (hit && hit.expires > Date.now()) {
      // LRU: déplacer en fin pour éviter éviction prématurée
      responseCache.delete(key)
      responseCache.set(key, hit)
      config.adapter = async () => ({
        data: hit.data,
        status: 200,
        statusText: 'OK',
        headers: hit.headers,
        config,
        request: {},
      })
    } else if (hit) {
      // Expiré → purge
      responseCache.delete(key)
    }
  }
  return config
})

api.interceptors.response.use(
  res => {
    notifyNetwork(true)
    if (isCacheable(res.config) && res.status === 200) {
      const key = cacheKey(res.config)
      const now = Date.now()
      responseCache.set(key, {
        data: res.data,
        headers: res.headers,
        expires: now + ttlFor(res.config.url),
        savedAt: now,
      })
      savePersistent(key, { data: res.data, savedAt: now })
      if (responseCache.size > 400) {
        responseCache.delete(responseCache.keys().next().value)
      }
    }
    return res
  },
  err => {
    const { response, config } = err
    const url = config?.url || ''
    const isNetworkError = !response
    if (isNetworkError && config?.method === 'get' && isCacheable(config)) {
      const key = cacheKey(config)
      const mem = responseCache.get(key)
      // TTL du cache persistant: on n'utilise que si frais (< 2 * ttlFor) pour éviter données semaines
      const ttl = ttlFor(url)
      let fallback = null
      if (mem && mem.data != null) {
        fallback = { data: mem.data, savedAt: mem.savedAt || Date.now() }
      } else {
        const ph = persistentHit(key)
        if (ph) fallback = ph
      }
      if (fallback && fallback.data != null) {
        const age = Date.now() - (fallback.savedAt || 0)
        // Si trop ancien (>2*TTL), on ne renvoie pas de stale silencieux — on laisse l'erreur réseau remonter
        if (age > ttl * 2) {
          notifyNetwork(false)
          return Promise.reject(err)
        }
        notifyNetwork(false)
        return Promise.resolve({
          data: fallback.data,
          status: 200,
          statusText: 'OK',
          headers: { 'X-Cache': 'STALE', 'X-Stale-Age': String(Math.round(age / 1000)) },
          config,
          request: {},
          __stale: true,
        })
      }
    }
    if (response && response.status === 401 &&
        !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/login-2fa') &&
        !url.includes('/auth/verify-email') && !url.includes('/auth/reset-password') && !url.includes('/auth/legacy-login') &&
        !url.includes('/auth/me') &&
        !url.includes('/broker-connect')) {
      console.warn('[API] 401 on', url, '__authRetried:', err.config.__authRetried)
      if (typeof window !== 'undefined' && !err.config.__authRetried) {
        err.config.__authRetried = true
        return refreshSessionOnce()
          .then(({ data, error }) => {
            if (!error && data.session) {
              try { localStorage.setItem('bluerock_token', data.session.access_token) } catch {}
              return api.request(err.config)
            }
            notifySessionExpired()
            return Promise.reject(err)
          })
          .catch(() => {
            notifySessionExpired()
            return Promise.reject(err)
          })
      }
      notifySessionExpired()
    }
    return Promise.reject(err)
  }
)

export const getCompanies = (params) => api.get('/api/companies', { params })
export const getCompany = (id) => api.get(`/api/companies/${id}`)
export const getCompanyRatios = (id, year) => api.get(`/api/companies/${id}/ratios`, { params: { fiscal_year: year } })
export const getCompanyValuation = (id, year) => api.get(`/api/companies/${id}/valuation`, { params: { fiscal_year: year } })
export const getCompanyScorecard = (id, year) => api.get(`/api/companies/${id}/scorecard`, { params: { fiscal_year: year } })
export const getCompanyFinancials = (id, year) => api.get(`/api/companies/${id}/financials`, { params: { fiscal_year: year } })
export const getCompanyMarketData = (id, days) => api.get(`/api/companies/${id}/market-data`, { params: { days } })
export const getCompanyFull = (id, days = 365) => api.get(`/api/companies/${id}/full`, { params: { days } })
export const analyzeCompany = (id, year) => api.post(`/api/analysis/companies/${id}/analyze`, {}, { params: { fiscal_year: year } })
export const predictCompany = (id) => api.get(`/api/analysis/companies/${id}/predict`)
export const askAI = (question, companyId) => api.post('/api/analysis/ask', { question, company_id: companyId })
export const getMarketOverview = (exchange) => api.get('/api/market/overview', { params: exchange ? { exchange } : undefined })
export const getMarketLive = () => api.get('/api/market/live')
export const getMarketNGX = () => api.get('/api/market/ngx')
export const getMarketSparklines = (days = 30) => api.get('/api/market/sparklines', { params: { days } })
export const getMarketAnnouncements = () => api.get('/api/market/announcements')
export const getMarketNews = (limit = 60) => api.get('/api/market/news', { params: { limit } })
export const getMarketCalendar = () => api.get('/api/market/calendar')
export const getNewsArticle = (url) => api.get('/api/market/news/article', { params: { url } })
export const getSectors = () => api.get('/api/companies/sectors')
export const getTopPerformers = () => api.get('/api/companies/top-performers')
export const screenCompanies = (params) => api.get('/api/analysis/screen', { params })
export const seedData = () => api.post('/api/seed/all')
export const analystChat = (data) => api.post('/api/analysis/ask', data)
export const getCompanyDetail = (id) => api.get(`/api/companies/${id}`)
export const getScreen = (params) => api.get('/api/analysis/screen', { params })
export const getCompanyPrediction = (id) => api.get(`/api/analysis/companies/${id}/predict`)
export const getAiStatus = () => api.get('/api/ai/status')
export const getAiStudio = () => api.get('/api/ai/studio', { timeout: 40000 })
export const getAiRiskAnalysis = () => api.get('/api/ai/risk/analysis', { cache: false })
export const getAiAlerts = (limit = 30) => api.get('/api/ai/alerts', { params: { limit }, cache: false })
export const getAiDecisionDetail = (id) => api.get(`/api/ai/decisions/${id}`, { cache: false })
export const getAiBacktests = (limit = 10) => api.get('/api/ai/backtests', { params: { limit } })
export const exportAiDecisions = (format, limit = 200) => api.get('/api/ai/export/decisions', {
  params: { format, limit }, responseType: 'blob', cache: false,
})
export const exportAiAudit = (limit = 200) => api.get('/api/ai/export/audit', {
  params: { limit }, responseType: 'blob', cache: false,
})
export const exportAiReport = (month) => api.get('/api/ai/export/report', {
  params: { month }, responseType: 'blob', cache: false,
})
export const adminAiBacktest = (body, token) => api.post('/api/ai/admin/backtest', body, {
  headers: token ? { 'X-Admin-Token': token } : {}, timeout: 300000, cache: false,
})
export const adminAiWalkForward = (body, token) => api.post('/api/ai/admin/walk-forward', body, {
  headers: token ? { 'X-Admin-Token': token } : {}, timeout: 600000, cache: false,
})
export const getAdminAiRiskConfig = (token) => api.get('/api/ai/admin/risk-config', {
  headers: token ? { 'X-Admin-Token': token } : {}, cache: false,
})
export const postAdminAiRiskConfig = (limits, token) => api.post('/api/ai/admin/risk-config', { limits }, {
  headers: token ? { 'X-Admin-Token': token } : {}, cache: false,
})
export const adminAiStressTest = (token) => api.post('/api/ai/admin/stress-test', null, {
  headers: token ? { 'X-Admin-Token': token } : {}, cache: false,
})
export const ingestPdf = (formData, adminToken) => api.post('/api/ingestion/pdf', formData, {
  headers: { 'Content-Type': 'multipart/form-data', ...(adminToken ? { 'X-Admin-Token': adminToken } : {}) },
})
export const fetchFinancials = (symbols, maxYears, adminToken) => api.post('/api/ingestion/fetch',
  new URLSearchParams({ symbols: symbols || '', max_years: String(maxYears || 2) }),
  { headers: adminToken ? { 'X-Admin-Token': adminToken } : {} },
)
export const getFetchStatus = () => api.get('/api/ingestion/fetch/status')
export const getIngestionStatements = (companyId, fiscalYear) => api.get('/api/ingestion/statements', { params: { company_id: companyId, fiscal_year: fiscalYear } })
export const getIngestionSummary = () => api.get('/api/ingestion/summary')
export const getMacroLatest = () => api.get('/api/macro/latest')
export const getSimulationPatrimoine = () => api.get('/api/simulate/patrimoine')

export const legacyLogin = (email, password) => api.post('/api/auth/legacy-login', { email, password })
export const getMe = () => api.get('/api/auth/me')
export const getBrokers = () => api.get('/api/auth/brokers')
export const updateMe = (payload) => api.put('/api/auth/me', payload)
export const sendOtp = (email, purpose) => api.post('/api/auth/otp/send', { email, purpose })
export const verifyOtpCode = (email, code) => api.post('/api/auth/otp/verify', { email, code })
export const registerWithOtp = (payload) => api.post('/api/auth/register', payload)
export const getPortfolio = (accountId) => api.get('/api/portfolio', { params: { account_id: accountId || undefined }, timeout: 60000 })
export const getPortfolioAccounts = () => api.get('/api/portfolio/accounts')
export const getPortfolioDividends = (accountId) => api.get('/api/portfolio/dividends', { params: { account_id: accountId || undefined }, timeout: 60000 })
export const createPortfolioAccount = (payload) => api.post('/api/portfolio/accounts', payload)
export const depositPortfolioAccount = (id, amount) => api.post(`/api/portfolio/accounts/${id}/deposit`, { amount })
export const withdrawPortfolioAccount = (id, amount) => api.post(`/api/portfolio/accounts/${id}/withdraw`, { amount })
export const initiateDeposit = (accountId, amount) => api.post('/api/payments/deposit', { account_id: accountId, amount })
export const verifyDepositOrder = (orderId) => api.post(`/api/payments/orders/${orderId}/verify`)
export const getDepositOrders = () => api.get('/api/payments/orders')
export const subscribePro = () => api.post('/api/subscription/subscribe')
export const startProTrial = () => api.post('/api/subscription/trial')
export const verifySubscription = (orderId) => api.post(`/api/subscription/orders/${orderId}/verify`)
export const cancelSubscription = () => api.post('/api/subscription/cancel')
export const getSubscriptionStatus = () => api.get('/api/subscription/status')
export const renamePortfolioAccount = (id, name) => api.patch(`/api/portfolio/accounts/${id}`, { name })
export const deletePortfolioAccount = (id) => api.delete(`/api/portfolio/accounts/${id}`)
export const getPosition = (symbol, accountId) => api.get(`/api/portfolio/positions/${symbol}`, { params: { account_id: accountId || undefined } })
export const placeOrder = (payload) => api.post('/api/portfolio/orders', payload)
export const cancelOrder = (orderId) => api.delete(`/api/portfolio/orders/${orderId}`)
export const getPremiumPlan = () => api.get('/api/premium/plan')
export const getPremiumPlans = () => api.get('/api/premium/plans')
export const getPremiumPlansLite = () => api.get('/api/premium/plans-lite')
export const rebalancePremiumPlan = (id, payload) => api.post(`/api/premium/plan/${id}/rebalance`, payload || {}, { timeout: 120000 })
export const setPlanPin = (id, payload) => api.post(`/api/premium/plan/${id}/pin`, payload || {}, { timeout: 60000 })
export const savePremiumPlan = (payload) => api.post('/api/premium/plan', payload, { timeout: 120000 })
export const cancelPremiumPlan = (id, payload) => api.post(`/api/premium/plan/${id}/cancel`, payload || {})
export const trackPremiumPlan = (id) => api.post(`/api/premium/plan/${id}/track`)
export const getNotifications = (limit = 50) => api.get('/api/notifications', { params: { limit } })
export const getUnreadCount = () => api.get('/api/notifications/unread-count')
export const markNotificationRead = (id) => api.post(`/api/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.post('/api/notifications/read-all')
export const openBrokerAccount = (payload) => api.post('/api/brokers/accounts', payload)
export const getBrokerAccounts = () => api.get('/api/brokers/accounts')
export const respondBrokerAccount = (id, payload) => api.post(`/api/brokers/${id}/respond`, payload, { cache: false })

export const brokerConnectAuth = (payload) => api.post('/api/broker-connect/auth', payload, { cache: false })
export const brokerConnectSession = (brokerToken) => api.get('/api/broker-connect/session', {
  headers: { 'X-Broker-Token': brokerToken }, cache: false,
})
export const brokerConnectLink = (brokerToken) => api.post('/api/broker-connect/link', null, {
  headers: { 'X-Broker-Token': brokerToken }, cache: false,
})
export const brokerConnectStatus = () => api.get('/api/broker-connect/status', { cache: false })
export const brokerConnectSync = (brokerToken) => api.post('/api/broker-connect/sync', null, {
  headers: { 'X-Broker-Token': brokerToken }, cache: false,
})
export const brokerConnectStatement = (brokerToken) => api.get('/api/broker-connect/statement', {
  headers: { 'X-Broker-Token': brokerToken }, cache: false,
})
export const brokerConnectUnlink = (brokerToken) => api.post('/api/broker-connect/unlink', null, {
  headers: { 'X-Broker-Token': brokerToken }, cache: false,
})
export const getCommunityPosts = (tab = 'forYou', limit = 20, opts = {}) => api.get('/api/community/posts', { params: { tab, limit, ...opts } })
export const getCommunityPost = (id) => api.get(`/api/community/posts/${id}`)
export const getCommunityDiscover = () => api.get('/api/community/discover')
export const getCommunitySuggestions = (limit = 5) => api.get('/api/community/suggestions', { params: { limit } })
export const getCommunityUsers = (search = '', limit = 30, proOnly = false) => api.get('/api/community/users', { params: { search, limit, pro_only: proOnly } })
export const getCommunityUser = (id) => api.get(`/api/community/users/${id}`)
export const getCommunityMe = () => api.get('/api/community/me')
export const followCommunityUser = (id) => api.post(`/api/community/users/${id}/follow`)
export const createCommunityPost = (formData) => api.post('/api/community/posts', formData, {
  // Ne pas forcer Content-Type: laisse axios/browser ajouter la boundary
  timeout: 60000,
})
export const rocketCommunityPost = (id) => api.post(`/api/community/posts/${id}/rocket`)
export const shareCommunityPost = (id) => api.post(`/api/community/posts/${id}/share`)
export const saveCommunityPost = (id) => api.post(`/api/community/posts/${id}/save`)
export const markPostSeen = (id) => api.post(`/api/community/posts/${id}/seen`).catch(() => {})
export const deleteCommunityPost = (id) => api.delete(`/api/community/posts/${id}`)
export const deleteCommunityComment = (postId, commentId) => api.delete(`/api/community/posts/${postId}/comments/${commentId}`)
export const getCommunityComments = (id) => api.get(`/api/community/posts/${id}/comments`)
export const addCommunityComment = (id, content) => api.post(`/api/community/posts/${id}/comments`, { content })
export const reactCommunityComment = (postId, commentId) => api.post(`/api/community/posts/${postId}/comments/${commentId}/react`)
export const updateCommunityMe = (payload) => api.put('/api/community/me', payload)
export const getCommunityDrafts = () => api.get('/api/community/drafts')
export const saveCommunityDraft = (payload) => api.post('/api/community/drafts', payload)
export const deleteCommunityDraft = (id) => api.delete(`/api/community/drafts/${id}`)
export const publishCommunityDraft = (id, formData) => api.post(`/api/community/drafts/${id}/publish`, formData, {
  timeout: 60000,
})
export const createCommunityReport = (payload) => api.post('/api/community/reports', payload)
export const getCommunityModerationQueue = () => api.get('/api/community/moderation/queue')
export const resolveCommunityReport = (id, payload) => api.post(`/api/community/moderation/reports/${id}/resolve`, payload)
export const banCommunityUser = (id) => api.post(`/api/community/moderation/users/${id}/ban`)
export const unbanCommunityUser = (id) => api.post(`/api/community/moderation/users/${id}/unban`)
export const getCommunityModerationHistory = () => api.get('/api/community/moderation/history')
export const getCommunityAiPulse = (symbol, days = 30) => api.get('/api/community/ai/pulse', { params: { symbol, days } })
export const getCommunityAiWatch = (days = 30) => api.get('/api/community/ai/watch', { params: { days } })
export const appealCommunityPost = (id) => api.post(`/api/community/posts/${id}/appeal`)
export const getMyReputation = () => api.get('/api/community/reputation', { cache: false })
export const getPublicReputation = (userId) => api.get(`/api/community/reputation/${userId}`, { cache: false })
export const getReputationLeaderboard = (limit = 20) => api.get('/api/community/leaderboard', { params: { limit } })
export const getCommunityEvents = (params) => api.get('/api/community/events', { params })
export const getCommunityEvent = (id) => api.get(`/api/community/events/${id}`)
export const createCommunityEvent = (payload) => api.post('/api/community/events', payload, { cache: false })
export const updateCommunityEvent = (id, payload) => api.patch(`/api/community/events/${id}`, payload, { cache: false })
export const deleteCommunityEvent = (id) => api.delete(`/api/community/events/${id}`, { cache: false })
export const registerCommunityEvent = (id) => api.post(`/api/community/events/${id}/register`, null, { cache: false })
export const cancelCommunityEvent = (id) => api.post(`/api/community/events/${id}/cancel`, null, { cache: false })
export const getCommunityGroups = (params) => api.get('/api/community/groups', { params })
export const createCommunityGroup = (payload) =>
  payload instanceof FormData
    ? api.post('/api/community/groups', payload)
    : api.post('/api/community/groups', payload)
export const getCommunityGroup = (ref) => api.get(`/api/community/groups/${ref}`)
export const updateCommunityGroup = (ref, payload) => api.patch(`/api/community/groups/${ref}`, payload)
export const archiveCommunityGroup = (ref) => api.delete(`/api/community/groups/${ref}`)
export const joinCommunityGroup = (ref) => api.post(`/api/community/groups/${ref}/join`)
export const leaveCommunityGroup = (ref) => api.post(`/api/community/groups/${ref}/leave`)
export const inviteCommunityMember = (ref, profileId) => api.post(`/api/community/groups/${ref}/invite`, { profile_id: profileId })
export const acceptCommunityInvite = (ref) => api.post(`/api/community/groups/${ref}/invites/accept`)
export const declineCommunityInvite = (ref) => api.post(`/api/community/groups/${ref}/invites/decline`)
export const getCommunityGroupInvites = (ref) => api.get(`/api/community/groups/${ref}/invites`)
export const getCommunityGroupMembers = (ref, params) => api.get(`/api/community/groups/${ref}/members`, { params })
export const getCommunityGroupPosts = (ref, params) => api.get(`/api/community/groups/${ref}/posts`, { params, cache: false })
export const approveCommunityMemberRequest = (ref, profileId) => api.post(`/api/community/groups/${ref}/requests/${profileId}/approve`)
export const rejectCommunityMemberRequest = (ref, profileId) => api.post(`/api/community/groups/${ref}/requests/${profileId}/reject`)
export const setCommunityMemberRole = (ref, profileId, role) => api.patch(`/api/community/groups/${ref}/members/${profileId}/role`, { role })
export const suspendCommunityMember = (ref, profileId) => api.post(`/api/community/groups/${ref}/members/${profileId}/suspend`)
export const banCommunityMember = (ref, profileId) => api.post(`/api/community/groups/${ref}/members/${profileId}/ban`)
export const restoreCommunityMember = (ref, profileId) => api.post(`/api/community/groups/${ref}/members/${profileId}/restore`)
export const getProfessionalDirectory = (params) => api.get('/api/community/professionals', { params })
export const applyProfessional = (payload) => api.post('/api/community/professional/apply', payload)
export const getMyProfessional = () => api.get('/api/community/professional/me')
export const getProfessionalReviews = (status = '') => api.get('/api/community/professional/reviews', { params: { status } })
export const approveProfessional = (profileId) => api.post(`/api/community/professional/reviews/${profileId}/approve`)
export const rejectProfessional = (profileId, note) => api.post(`/api/community/professional/reviews/${profileId}/reject`, { note })
export const getChallenges = () => api.get('/api/community/challenges')
export const joinChallenge = (id) => api.post(`/api/community/challenges/${id}/join`)
export const leaveChallenge = (id) => api.delete(`/api/community/challenges/${id}/join`)
export const getChallengeLeaderboard = (id) => api.get(`/api/community/challenges/${id}/leaderboard`)
export const getChallenge = (id) => api.get(`/api/community/challenges/${id}`)
export const getChallengePortfolio = (id) => api.get(`/api/community/challenges/${id}/portfolio`, { cache: false })
export const placeChallengeOrder = (id, payload) => api.post(`/api/community/challenges/${id}/portfolio/orders`, payload, { cache: false })
export const getChallengeUserProfile = (id, userId) => api.get(`/api/community/challenges/${id}/users/${userId}`, { cache: false })

export const getKycStatus = () => api.get('/api/kyc/status', { cache: false })
export const saveKycProfile = (payload) => api.put('/api/kyc/profile', payload, { cache: false })
export const startDiditVerification = (language) => api.post('/api/kyc/didit/start', null, { params: { language }, cache: false })
export const retryKycVerification = () => api.post('/api/kyc/retry', null, { cache: false })

export const adminKycStats = (token) => api.get('/api/admin/kyc/stats', { headers: { 'X-Admin-Token': token }, cache: false })
export const adminKycList = (token, status) => api.get('/api/admin/kyc', { headers: { 'X-Admin-Token': token }, params: status ? { status } : {}, cache: false })

export const clearApiCache = () => {
  responseCache.clear()
  try { localStorage.removeItem(PERSIST_KEY) } catch {}
}
export const invalidateApiCache = (prefix) => {
  for (const key of responseCache.keys()) {
    if (key.includes(prefix)) responseCache.delete(key)
  }
  try {
    const all = loadPersistent()
    let changed = false
    for (const key of Object.keys(all)) {
      if (key.includes(prefix)) { delete all[key]; changed = true }
    }
    if (changed) localStorage.setItem(PERSIST_KEY, JSON.stringify(all))
  } catch {}
}

export default api
