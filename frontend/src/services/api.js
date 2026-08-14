import axios from 'axios'
import { supabase } from '../lib/supabase'

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' && window.location.hostname
    && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : 'http://localhost:8000')

const api = axios.create({
  baseURL: API_BASE,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' }
})

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

const cacheKey = (config) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('bluerock_token') : null
  const params = config.params ? JSON.stringify(config.params) : ''
  return `${token ? 'u' : 'a'}|${config.url}${params ? `?${params}` : ''}`
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
  for (const [prefix, ttl] of CACHE_TTL_BY_PREFIX) {
    if (url.startsWith(prefix)) return ttl
  }
  return DEFAULT_TTL
}

const isCacheable = (config) => {
  if (config.method !== 'get' || config.cache === false) return false
  return !NO_CACHE_PREFIXES.some((p) => config.url.startsWith(p))
}

let refreshPromise = null
let expiredNotified = false

function refreshSessionOnce() {
  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

function notifySessionExpired() {
  if (typeof window === 'undefined' || expiredNotified) return
  expiredNotified = true
  try { window.dispatchEvent(new CustomEvent('bluerock:session-expired')) } catch {}
}

api.interceptors.request.use(config => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('bluerock_token') : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (isCacheable(config)) {
    const key = cacheKey(config)
    const hit = responseCache.get(key)
    if (hit && hit.expires > Date.now()) {
      config.adapter = async () => ({
        data: hit.data,
        status: 200,
        statusText: 'OK',
        headers: hit.headers,
        config,
        request: {},
      })
    }
  }
  return config
})

api.interceptors.response.use(
  res => {
    notifyNetwork(true)
    if (isCacheable(res.config) && res.status === 200) {
      const key = cacheKey(res.config)
      responseCache.set(key, {
        data: res.data,
        headers: res.headers,
        expires: Date.now() + ttlFor(res.config.url),
      })
      savePersistent(key, { data: res.data, savedAt: Date.now() })
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
      const fallback = mem ? { data: mem.data, savedAt: 0 } : persistentHit(key)
      if (fallback && fallback.data != null) {
        notifyNetwork(false)
        return Promise.resolve({
          data: fallback.data,
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {},
          __stale: true,
        })
      }
    }
    if (response && response.status === 401 &&
        !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/login-2fa') &&
        !url.includes('/auth/verify-email') && !url.includes('/auth/reset-password') && !url.includes('/auth/legacy-login') &&
        !url.includes('/broker-connect')) {
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

export const legacyLogin = (email, password) => api.post('/api/auth/legacy-login', { email, password })
export const getMe = () => api.get('/api/auth/me')
export const getBrokers = () => api.get('/api/auth/brokers')
export const updateMe = (payload) => api.put('/api/auth/me', payload)
export const sendOtp = (email, purpose) => api.post('/api/auth/otp/send', { email, purpose })
export const verifyOtpCode = (email, code) => api.post('/api/auth/otp/verify', { email, code })
export const getPortfolio = (accountId) => api.get('/api/portfolio', { params: { account_id: accountId || undefined }, timeout: 60000 })
export const getPortfolioAccounts = () => api.get('/api/portfolio/accounts')
export const createPortfolioAccount = (payload) => api.post('/api/portfolio/accounts', payload)
export const depositPortfolioAccount = (id, amount) => api.post(`/api/portfolio/accounts/${id}/deposit`, { amount })
export const withdrawPortfolioAccount = (id, amount) => api.post(`/api/portfolio/accounts/${id}/withdraw`, { amount })
export const initiateDeposit = (accountId, amount) => api.post('/api/payments/deposit', { account_id: accountId, amount })
export const verifyDepositOrder = (orderId) => api.post(`/api/payments/orders/${orderId}/verify`)
export const getDepositOrders = () => api.get('/api/payments/orders')
export const subscribePro = () => api.post('/api/subscription/subscribe')
export const verifySubscription = (orderId) => api.post(`/api/subscription/orders/${orderId}/verify`)
export const cancelSubscription = () => api.post('/api/subscription/cancel')
export const getSubscriptionStatus = () => api.get('/api/subscription/status')
export const renamePortfolioAccount = (id, name) => api.patch(`/api/portfolio/accounts/${id}`, { name })
export const deletePortfolioAccount = (id) => api.delete(`/api/portfolio/accounts/${id}`)
export const getPosition = (symbol, accountId) => api.get(`/api/portfolio/positions/${symbol}`, { params: { account_id: accountId || undefined } })
export const placeOrder = (payload) => api.post('/api/portfolio/orders', payload)
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
export const getCommunityPosts = (tab = 'forYou', limit = 20) => api.get('/api/community/posts', { params: { tab, limit } })
export const getCommunityUsers = (search = '', limit = 30) => api.get('/api/community/users', { params: { search, limit } })
export const getCommunityUser = (id) => api.get(`/api/community/users/${id}`)
export const getCommunityMe = () => api.get('/api/community/me')
export const followCommunityUser = (id) => api.post(`/api/community/users/${id}/follow`)
export const createCommunityPost = (formData) => api.post('/api/community/posts', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 60000,
})
export const rocketCommunityPost = (id) => api.post(`/api/community/posts/${id}/rocket`)
export const getCommunityComments = (id) => api.get(`/api/community/posts/${id}/comments`)
export const addCommunityComment = (id, content) => api.post(`/api/community/posts/${id}/comments`, { content })
export const reactCommunityComment = (postId, commentId) => api.post(`/api/community/posts/${postId}/comments/${commentId}/react`)
export const updateCommunityMe = (payload) => api.put('/api/community/me', payload)
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
