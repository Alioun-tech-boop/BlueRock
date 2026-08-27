import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import '../styles/globals.css'
import '../styles/responsive.css'
import '../styles/design.css'
import '../styles/desktop.css'
import '../styles/community.css'
import { AuthProvider } from '../lib/auth'
import DesktopDock from '../components/DesktopDock'
import NetworkBanner from '../components/NetworkBanner'
import InstallPWA from '../components/InstallPWA'

const PAGE_TITLES = {
  '/': 'Watchlist',
  '/login': 'Connexion',
  '/menu': 'Menu',
  '/profile': 'Profil',
  '/portfolio': 'Portefeuille',
  '/companies': 'Entreprises',
  '/company': 'Entreprise',
  '/screen': 'Analyseur',
  '/explorer': 'Explorateur',
  '/quote': 'Cotation',
  '/watchlist': 'Watchlist',
  '/analyst': 'Analyste IA',
  '/ai-studio': 'AI Studio',
  '/ai-studio/performance': 'AI Studio · Performance',
  '/ai-studio/risk': 'AI Studio · Risque',
  '/ai-studio/portfolio': 'AI Studio · Portefeuille',
  '/ai-studio/decisions': 'AI Studio · Décisions',
  '/ai-studio/backtest': 'AI Studio · Backtest',
  '/ai-studio/health': 'AI Studio · Santé',
  '/ai-studio/evolution': 'AI Studio · Évolution',
  '/ai-studio/activity': 'AI Studio · Activité',
  '/community': 'Communauté',
  '/community/post/[id]': 'Publication',
  '/community/group/[slug]': 'Communauté',
  '/challenges': 'Défis',
  '/donnees': 'Données PDF',
  '/notifications': 'Notifications',
  '/premium': 'Premium',
  '/compte-titre': 'Compte Titre',
  '/kyc': 'Vérification KYC',
  '/calendar': 'Calendrier',
  '/brokers': 'Courtiers',
  '/chart': 'Graphique',
  '/404': 'Page introuvable',
}

export default function App({ Component, pageProps }) {
  const router = useRouter()

  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  useEffect(() => {
    // PWA : service worker actif uniquement hors dev.
    // En dev (localhost), le désenregistre et purge son cache : un SW ayant
    // mis en cache d'anciens chunks webpack provoque une boucle de reload.
    if (!('serviceWorker' in navigator)) return
    const dev = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    if (dev) {
      navigator.serviceWorker.getRegistrations()
        .then(rs => Promise.all(rs.map(r => r.unregister())))
        .then(() => caches.keys().then(keys => Promise.all(
          keys.filter(k => k.startsWith('bluerock-')).map(k => caches.delete(k))
        )))
        .catch(() => {})
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  let pageTitle = PAGE_TITLES[router.pathname] || null
  const q = router.query || {}
  if (pageTitle && router.pathname === '/quote' && q.symbol) pageTitle = `Cotation · ${q.symbol}`
  if (pageTitle && router.pathname === '/chart' && q.symbol) pageTitle = `Graphique · ${q.symbol}`

  return (
    <>
      <Head>
        <title>{pageTitle ? `BLUEROCK · ${pageTitle}` : 'BLUEROCK'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        <meta name="description" content="BLUEROCK — Plateforme d'investissement BRVM : cours en temps réel, analyse IA, portefeuille et courtiers agréés." />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BLUEROCK" />
        <meta property="og:title" content="BLUEROCK — BRVM Financial Intelligence" />
        <meta property="og:description" content="Investissez sur la BRVM : cours temps réel, analyste IA, états financiers et courtiers régulés." />
        <meta property="og:type" content="website" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <AuthProvider>
        <NetworkBanner />
        <InstallPWA />
        <DesktopDock />
        <Component {...pageProps} />
      </AuthProvider>
    </>
  )
}
