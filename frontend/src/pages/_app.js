import Head from 'next/head'
import { useRouter } from 'next/router'
import '../styles/globals.css'
import '../styles/responsive.css'
import '../styles/design.css'
import '../styles/desktop.css'
import { AuthProvider } from '../lib/auth'
import DesktopDock from '../components/DesktopDock'

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
  '/community': 'Communauté',
  '/challenges': 'Défis',
  '/donnees': 'Données PDF',
  '/notifications': 'Notifications',
  '/patrimoine': 'Patrimoine',
  '/patrimoine/allocation': 'Patrimoine · Allocation',
  '/patrimoine/apercu': 'Patrimoine · Aperçu',
  '/patrimoine/contributions': 'Patrimoine · Contributions',
  '/patrimoine/parametres': 'Patrimoine · Paramètres',
  '/patrimoine/plan': 'Patrimoine · Plan',
  '/patrimoine/projections': 'Patrimoine · Projections',
  '/premium': 'Premium',
  '/compte-titre': 'Compte Titre',
  '/kyc': 'Vérification KYC',
  '/calendar': 'Calendrier',
  '/brokers': 'Courtiers',
  '/chart': 'Graphique',
}

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const pageTitle = PAGE_TITLES[router.pathname] || null

  return (
    <>
      <Head>
        <title>{pageTitle ? `BLUEROCK · ${pageTitle}` : 'BLUEROCK'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        <meta name="description" content="BLUEROCK — Plateforme d'investissement BRVM : cours en temps réel, analyse IA, portefeuille et courtiers agréés." />
        <meta name="theme-color" content="#000000" />
        <meta property="og:title" content="BLUEROCK — BRVM Financial Intelligence" />
        <meta property="og:description" content="Investissez sur la BRVM : cours temps réel, analyste IA, états financiers et courtiers régulés." />
        <meta property="og:type" content="website" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <AuthProvider>
        <DesktopDock />
        <Component {...pageProps} />
      </AuthProvider>
    </>
  )
}
