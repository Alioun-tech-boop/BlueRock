// Interrupteurs de fonctionnalités (côté UI).
// À maintenir alignés avec les flags FEATURE_*_ENABLED du backend
// (backend/app/config.py + backend/.env).
// false = la fonctionnalité est masquée / indisponible pour le moment.
export const FEATURES = {
  subscription: false,     // abonnement Pro (offre payante)
  brokerAccounts: false,   // ouverture de compte-titre réel (SGI)
  kyc: false,              // parcours de vérification d'identité
  paidChallenges: false,   // défis à inscription payante
}
