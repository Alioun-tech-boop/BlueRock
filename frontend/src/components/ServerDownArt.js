import { useId } from 'react'

/* Illustration professionnelle : baie serveur dont le câble réseau est débranché.
   Adaptée au thème sombre ; aucune teinte d'erreur (pas de rouge). */
export default function ServerDownArt({ size = 180, className = '' }) {
  const uid = useId().replace(/[:]/g, '')
  const halo = `sda-halo-${uid}`
  const rack = `sda-rack-${uid}`
  const ledge = `sda-ledge-${uid}`
  const cable = `sda-cable-${uid}`

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={halo} cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#18C27C" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#18C27C" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={rack} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#252932" />
          <stop offset="100%" stopColor="#111318" />
        </linearGradient>
        <linearGradient id={ledge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c303a" />
          <stop offset="100%" stopColor="#181b22" />
        </linearGradient>
        <linearGradient id={cable} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4b5466" />
          <stop offset="100%" stopColor="#39404f" />
        </linearGradient>
      </defs>

      {/* halo lumineux + ombre au sol */}
      <ellipse cx="100" cy="96" rx="88" ry="72" fill={`url(#${halo})`} />
      <ellipse cx="102" cy="174" rx="52" ry="8" fill="rgba(0,0,0,0.38)" />

      {/* baie serveur */}
      <rect x="56" y="26" width="84" height="148" rx="12" fill={`url(#${rack})`} stroke="rgba(255,255,255,0.09)" />

      {/* grilles de ventilation */}
      {[36, 46, 56, 66, 76].map(y => (
        <rect key={y} x="66" y={y} width="64" height="5" rx="2.5" fill="rgba(255,255,255,0.05)" />
      ))}

      {/* panneau 1 — baie de disque + LED verte */}
      <rect x="66" y="90" width="62" height="26" rx="6" fill={`url(#${ledge})`} stroke="rgba(255,255,255,0.06)" />
      <rect x="73" y="96" width="20" height="9" rx="3" fill="rgba(0,0,0,0.35)" />
      <rect x="73" y="98.5" width="20" height="2" rx="1" fill="rgba(255,255,255,0.06)" />
      <circle cx="116" cy="99" r="7" fill="#1ED760" opacity="0.16" />
      <circle cx="116" cy="99" r="3.2" fill="#1ED760" />

      {/* panneau 2 — baie de disque + LED ambre (état attention) */}
      <rect x="66" y="122" width="62" height="26" rx="6" fill={`url(#${ledge})`} stroke="rgba(255,255,255,0.06)" />
      <rect x="73" y="128" width="20" height="9" rx="3" fill="rgba(0,0,0,0.35)" />
      <rect x="73" y="130.5" width="20" height="2" rx="1" fill="rgba(255,255,255,0.06)" />
      <circle cx="116" cy="131" r="7" fill="#F5C76A" opacity="0.16" />
      <circle cx="116" cy="131" r="3.2" fill="#F5C76A" />

      {/* panneau 3 — bouton d'alimentation + LED bleue */}
      <rect x="66" y="154" width="62" height="14" rx="6" fill={`url(#${ledge})`} stroke="rgba(255,255,255,0.06)" />
      <circle cx="92" cy="161" r="6" fill="#2b303a" stroke="rgba(255,255,255,0.16)" />
      <path d="M92 157.5 v2.2" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="116" cy="161" r="7" fill="#4C8DFF" opacity="0.16" />
      <circle cx="116" cy="161" r="3.2" fill="#4C8DFF" />

      {/* prise murale (en haut à droite) */}
      <rect x="162" y="76" width="16" height="26" rx="4" fill="#171a20" stroke="rgba(255,255,255,0.1)" />
      <rect x="167" y="80" width="6" height="18" rx="2" fill="rgba(255,255,255,0.08)" />

      {/* espace de déconnexion (ligne pointillée) */}
      <path d="M170 102 V 122" stroke="#5a6577" strokeWidth="1.6" strokeDasharray="2.5 4.5" strokeLinecap="round" />

      {/* câble débranché : de la baie vers le connecteur pendant */}
      <rect x="139" y="104" width="7" height="9" rx="2" fill="#12141b" stroke="rgba(255,255,255,0.12)" />
      <path d="M146 109 C 154 111, 160 114, 164 121" stroke={`url(#${cable})`} strokeWidth="4" strokeLinecap="round" />
      <rect x="157" y="120" width="15" height="13" rx="2.5" fill={`url(#${cable})`} stroke="rgba(255,255,255,0.18)" />
      <rect x="163" y="133" width="3.5" height="5" fill="#2a3040" />
      <path d="M159 139 q -2 8 -6 11" stroke="#39404f" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
      <path d="M167 139 q 2 8 6 11" stroke="#39404f" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
    </svg>
  )
}