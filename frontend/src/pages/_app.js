import Head from 'next/head'
import '../styles/globals.css'
import '../styles/responsive.css'
import '../styles/design.css'
import { AuthProvider } from '../lib/auth'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        <meta name="description" content="BlueRock — Plateforme d'investissement BRVM : cours en temps réel, analyse IA, portefeuille et courtiers agréés." />
        <meta name="theme-color" content="#0E1627" />
        <meta property="og:title" content="BlueRock — BRVM Financial Intelligence" />
        <meta property="og:description" content="Investissez sur la BRVM : cours temps réel, analyste IA, états financiers et courtiers régulés." />
        <meta property="og:type" content="website" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  )
}
