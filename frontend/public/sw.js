/* Service Worker BLUEROCK (Phase 10 — Mobile / PWA).
 *  - Pré-cache du shell applicatif (pages clés + icônes + manifest).
 *  - Navigations : network-first, repli cache puis shell racine (offline).
 *  - Actifs immutables _next/static : cache-first (hashed par le build).
 *  - Assets publics : cache-first avec mise en cache à la volée.
 *  - Les requêtes /api/* ne sont JAMAIS mises en cache (données sensibles
 *    selon l'utilisateur connecté).
 */
const VERSION = 'bluerock-v2'
const PRECACHE = [
  '/',
  '/watchlist',
  '/community',
  '/profile',
  '/portfolio',
  '/login',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

const isDev = ['localhost', '127.0.0.1'].includes(self.location.hostname)

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  if (isDev) return // pas d'interception en dev : évite chunks périmés et boucles de reload
  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // jamais de cache sur les API

  // Actifs de build (nommés par hash) : cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
        }
        return res
      }))
    )
    return
  }

  // Navigations : réseau d'abord, sinon cache, sinon le shell racine
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
        }
        return res
      }).catch(() =>
        caches.match(req).then((hit) => hit || caches.match('/'))
      )
    )
    return
  }

  // Autres assets (icônes, polices locales, etc.) : cache-first
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone()
        caches.open(VERSION).then((c) => c.put(req, copy))
      }
      return res
    }))
  )
})