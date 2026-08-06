import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' && window.location.hostname
    && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : 'http://localhost:8000')

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('bluerock_token') : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    const { response, config } = err
    const url = config?.url || ''
    if (response && response.status === 401 &&
        !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/login-2fa') &&
        !url.includes('/auth/verify-email') && !url.includes('/auth/reset-password')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('bluerock_token')
        localStorage.removeItem('bluerock_user')
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login'
      }
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
export const getMarketOverview = () => api.get('/api/market/overview')
export const getMarketLive = () => api.get('/api/market/live')
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
export const getPortfolio = () => api.get('/api/portfolio')
export const getPosition = (symbol) => api.get(`/api/portfolio/positions/${symbol}`)
export const placeOrder = (payload) => api.post('/api/portfolio/orders', payload)
export const getPremiumPlan = () => api.get('/api/premium/plan')
export const savePremiumPlan = (payload) => api.post('/api/premium/plan', payload)
export const cancelPremiumPlan = (id) => api.post(`/api/premium/plan/${id}/cancel`)
export const trackPremiumPlan = (id) => api.post(`/api/premium/plan/${id}/track`)
export const getNotifications = (limit = 50) => api.get('/api/notifications', { params: { limit } })
export const getUnreadCount = () => api.get('/api/notifications/unread-count')
export const markNotificationRead = (id) => api.post(`/api/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.post('/api/notifications/read-all')
export const openBrokerAccount = (payload) => api.post('/api/brokers/accounts', payload)
export const activateDemoAccount = () => api.post('/api/portfolio/demo-activate')
export const getBrokerAccounts = () => api.get('/api/brokers/accounts')
export const getCommunityPosts = (tab = 'forYou', limit = 20) => api.get('/api/community/posts', { params: { tab, limit } })
export const getCommunityUsers = (search = '', limit = 30) => api.get('/api/community/users', { params: { search, limit } })
export const getCommunityUser = (id) => api.get(`/api/community/users/${id}`)
export const followCommunityUser = (id) => api.post(`/api/community/users/${id}/follow`)
export const createCommunityPost = (payload) => api.post('/api/community/posts', payload)
export const rocketCommunityPost = (id) => api.post(`/api/community/posts/${id}/rocket`)
export const getCommunityComments = (id) => api.get(`/api/community/posts/${id}/comments`)
export const addCommunityComment = (id, content) => api.post(`/api/community/posts/${id}/comments`, { content })
export const getChallenges = () => api.get('/api/community/challenges')
export const joinChallenge = (id) => api.post(`/api/community/challenges/${id}/join`)
export const leaveChallenge = (id) => api.delete(`/api/community/challenges/${id}/join`)
export const getChallengeLeaderboard = (id) => api.get(`/api/community/challenges/${id}/leaderboard`)

export default api
