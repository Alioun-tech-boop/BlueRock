import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, Shield, Lock, Eye, Database, Globe, UserCheck, FileText, Mail } from 'lucide-react'
import { t, detectLang } from '../lib/i18n'
import BottomNav from '../components/BottomNav'

export default function Privacy() {
  const router = useRouter()
  const [lang, setLang] = useState('fr')
  useEffect(() => { setLang(detectLang()) }, [])

  const sections = [
    {
      icon: FileText,
      title: lang === 'fr' ? '1. Introduction' : '1. Introduction',
      content: lang === 'fr'
        ? `BlueRock s'engage à protéger la vie privée de ses utilisateurs conformément au Règlement Général sur la Protection des Données (RGPD) et à la réglementation UEMOA sur la protection des données personnelles. Cette politique explique comment nous collectons, utilisons et protégeons vos informations lorsque vous utilisez notre plateforme d'intelligence financière BRVM.`
        : `BlueRock is committed to protecting user privacy in accordance with GDPR and UEMOA data protection regulations. This policy explains how we collect, use and protect your information when using our BRVM financial intelligence platform.`
    },
    {
      icon: Database,
      title: lang === 'fr' ? '2. Données collectées' : '2. Data Collected',
      content: lang === 'fr'
        ? `<strong>Informations d'identification :</strong> nom, prénom, adresse email, numéro de téléphone, pièce d'identité (pour le KYC), photographie.<br/><br/><strong>Informations financières :</strong> portefeuilles, positions, ordres, préférences de courtier, données de marché consultées.<br/><br/><strong>Données techniques :</strong> adresse IP, type de navigateur, appareil, logs de connexion, cookies analytiques.<br/><br/><strong>Données communautaires :</strong> publications, commentaires, réactions, groupes rejoints.`
        : `<strong>Identity information:</strong> name, email, phone, ID document (for KYC), photograph.<br/><br/><strong>Financial information:</strong> portfolios, positions, orders, broker preferences, market data viewed.<br/><br/><strong>Technical data:</strong> IP address, browser, device, logs, analytics cookies.<br/><br/><strong>Community data:</strong> posts, comments, reactions, groups joined.`
    },
    {
      icon: Eye,
      title: lang === 'fr' ? '3. Utilisation des données' : '3. Data Usage',
      content: lang === 'fr'
        ? `Vos données sont utilisées pour : fournir et améliorer nos services d'analyse BRVM, exécuter vos ordres et gérer vos portefeuilles, personnaliser votre expérience et le fil d'actualité, assurer la sécurité et prévenir la fraude, respecter nos obligations légales (KYC/AML), vous envoyer des notifications importantes et, avec votre consentement, des communications marketing.`
        : `Your data is used to: provide and improve our BRVM analysis services, execute your orders and manage portfolios, personalize your experience and feed, ensure security and prevent fraud, comply with legal obligations (KYC/AML), send important notifications and, with your consent, marketing communications.`
    },
    {
      icon: Globe,
      title: lang === 'fr' ? '4. Partage des données' : '4. Data Sharing',
      content: lang === 'fr'
        ? `Nous ne vendons jamais vos données. Elles peuvent être partagées avec : <strong>nos prestataires techniques</strong> (hébergement Supabase, email Brevo, vérification Didit) sous contrat de confidentialité, <strong>vos courtiers (SGI/SGO)</strong> pour l'ouverture de comptes-titres, et <strong>les autorités</strong> sur réquisition légale. Tous nos sous-traitants sont conformes RGPD.`
        : `We never sell your data. It may be shared with: <strong>technical providers</strong> (Supabase hosting, Brevo email, Didit verification) under confidentiality, <strong>your brokers (SGI/SGO)</strong> for account opening, and <strong>authorities</strong> upon legal request. All processors are GDPR-compliant.`
    },
    {
      icon: Lock,
      title: lang === 'fr' ? '5. Sécurité & Conservation' : '5. Security & Retention',
      content: lang === 'fr'
        ? `Vos données sont chiffrées en transit (TLS 1.3) et au repos (AES-256), stockées sur des serveurs sécurisés (Supabase, région EU). Les mots de passe sont hachés avec Argon2, les données KYC chiffrées. Conservation : compte actif + 5 ans après clôture (obligation légale), logs 12 mois, données de marché indéfiniment (anonymisées). Vous pouvez demander la suppression à tout moment, sous réserve des obligations légales.`
        : `Your data is encrypted in transit (TLS 1.3) and at rest (AES-256), stored on secure servers (Supabase, EU region). Passwords are hashed with Argon2, KYC data encrypted. Retention: active account + 5 years after closure (legal), logs 12 months, market data indefinitely (anonymized). You may request deletion at any time, subject to legal obligations.`
    },
    {
      icon: UserCheck,
      title: lang === 'fr' ? '6. Vos droits' : '6. Your Rights',
      content: lang === 'fr'
        ? `Conformément au RGPD, vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Vous pouvez exercer ces droits depuis <strong>Paramètres → Compte → Gérer mes données</strong> ou par email à <strong>privacy@bluerock.ai</strong>. Réponse sous 30 jours. Réclamation possible auprès de la CNIL ou de l'autorité locale de protection des données.`
        : `Under GDPR, you have rights to access, rectification, erasure, restriction, objection and portability. Exercise via <strong>Settings → Account → Manage my data</strong> or email <strong>privacy@bluerock.ai</strong>. Response within 30 days. Complaint possible with CNIL or local DPA.`
    },
    {
      icon: Shield,
      title: lang === 'fr' ? '7. Cookies & Traceurs' : '7. Cookies & Trackers',
      content: lang === 'fr'
        ? `Nous utilisons des cookies essentiels (authentification, sécurité) et, avec votre consentement, des cookies analytiques (mesure d'audience) et de préférence (langue, thème). Vous pouvez gérer vos préférences dans le bandeau cookies ou les paramètres de votre navigateur. Aucun cookie publicitaire tiers n'est déposé sans consentement explicite.`
        : `We use essential cookies (authentication, security) and, with your consent, analytics (audience) and preference (language, theme) cookies. Manage preferences in the cookie banner or browser settings. No third-party advertising cookies without explicit consent.`
    },
    {
      icon: Mail,
      title: lang === 'fr' ? '8. Contact' : '8. Contact',
      content: lang === 'fr'
        ? `Délégué à la Protection des Données (DPO) : <strong>dpo@bluerock.ai</strong><br/>Support : <strong>support@bluerock.africa</strong><br/>Adresse : BlueRock Technologies, Abidjan, Côte d'Ivoire<br/><br/><em>Dernière mise à jour : 26 août 2026 — Version 2.0</em>`
        : `Data Protection Officer (DPO): <strong>dpo@bluerock.ai</strong><br/>Support: <strong>support@bluerock.africa</strong><br/>Address: BlueRock Technologies, Abidjan, Ivory Coast<br/><br/><em>Last updated: August 26, 2026 — Version 2.0</em>`
    },
  ]

  return (
    <div className="privacy-root">
      <div className="privacy-scroll">
        <header className="privacy-header">
          <button className="privacy-back" onClick={() => router.back()} aria-label={t(lang, 'back')}>
            <ArrowLeft size={18} />{t(lang, 'back')}
          </button>
          <div className="privacy-title-wrap">
            <span className="privacy-badge"><Shield size={12} />{lang === 'fr' ? 'CONFIDENTIALITÉ' : 'PRIVACY'}</span>
            <h1 className="privacy-title">{lang === 'fr' ? 'Politique de Confidentialité' : 'Privacy Policy'}</h1>
            <p className="privacy-sub">{lang === 'fr' ? 'Votre confiance est notre priorité. Transparence totale sur vos données.' : 'Your trust is our priority. Full transparency on your data.'}</p>
          </div>
        </header>

        <main className="privacy-main">
          {sections.map((s, i) => {
            const Icon = s.icon
            return (
              <section key={i} className="privacy-section">
                <div className="privacy-section-head">
                  <span className="privacy-icon"><Icon size={16} /></span>
                  <h2 className="privacy-section-title">{s.title}</h2>
                </div>
                <div className="privacy-section-body" dangerouslySetInnerHTML={{ __html: s.content }} />
              </section>
            )
          })}
        </main>
      </div>

      <BottomNav active="portfolio" />

      <style jsx>{`
        .privacy-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          background: #000;
          color: #fff;
          font-family: Inter, -apple-system, sans-serif;
          width: 100%;
          flex: 1;
        }
        .privacy-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          width: 100%;
        }
        .privacy-scroll::-webkit-scrollbar { display: none; }
        .privacy-header {
          position: relative;
          padding: 18px 22px 28px;
          background: linear-gradient(180deg, #0A0F1D 0%, #05070d 100%);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          width: 100%;
          box-sizing: border-box;
        }
        .privacy-back {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.85); border-radius: 999px; padding: 8px 14px;
          font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
        }
        .privacy-title-wrap { margin-top: 22px; max-width: 760px; margin-left: auto; margin-right: auto; width: 100%; box-sizing: border-box; }
        .privacy-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(0,192,135,0.12); border: 1px solid rgba(0,192,135,0.3);
          color: #00C087; font-size: 10px; font-weight: 800; letter-spacing: 1.2px;
          padding: 4px 10px; border-radius: 999px; margin-bottom: 12px;
        }
        .privacy-title {
          margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1;
          background: linear-gradient(135deg, #fff 30%, #8b9bb4 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .privacy-sub { margin: 10px 0 0; font-size: 13.5px; color: #8b9bb4; line-height: 1.5; }
        .privacy-main {
          max-width: 760px; width: 100%; margin: 0 auto;
          padding: 28px 22px 90px;
          display: flex; flex-direction: column; gap: 18px;
          box-sizing: border-box;
        }
        .privacy-section {
          background: #141414; border: 1px solid #1e1e1e; border-radius: 20px;
          padding: 22px; transition: border-color 200ms ease;
        }
        .privacy-section:hover { border-color: rgba(255,255,255,0.1); }
        .privacy-section-head {
          display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
        }
        .privacy-icon {
          width: 32px; height: 32px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,192,135,0.12); color: #00C087; flex-shrink: 0;
        }
        .privacy-section-title { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
        .privacy-section-body {
          font-size: 13.5px; line-height: 1.7; color: #a3a3a3;
        }
        .privacy-section-body :global(strong) { color: #fff; font-weight: 600; }
        @media (min-width: 1024px) {
          .privacy-scroll { padding-top: 80px; }
          .privacy-main { padding-bottom: 40px; }
        }
        @media (max-width: 767px) {
          .privacy-title { font-size: 26px; }
          .privacy-main { padding: 18px 16px 90px; }
        }
      `}</style>
    </div>
  )
}
