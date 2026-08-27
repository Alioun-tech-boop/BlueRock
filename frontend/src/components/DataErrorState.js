import { t } from '../lib/i18n'
import ServerDownArt from './ServerDownArt'

/* État d'impossibilité de chargement des données :
   illustration professionnelle d'un serveur débranché + message neutre
   (+ bouton « Réessayer » optionnel). Aucune teinte d'erreur. */
export default function DataErrorState({ lang = 'fr', size = 168, retry, message = null }) {
  return (
    <div className="des-root" role="status">
      <ServerDownArt size={size} />
      {message !== null && <span className="des-t">{message}</span>}
      {retry && <button className="des-retry" onClick={retry}>{t(lang, 'retry')}</button>}
      <style jsx>{`
        .des-root { display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 34px 16px; text-align: center; }
        .des-t { font-size: 13.5px; font-weight: 500; color: #9AA3B2; line-height: 1.55; max-width: 300px; }
        .des-retry {
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer; font-family: inherit;
          font-size: 14px; font-weight: 700; color: #0b1f14;
          background: linear-gradient(145deg, #3ef191, #1ED760 55%, #12b855);
          border-radius: 15px; padding: 12px 30px;
          box-shadow: 0 10px 26px rgba(29,185,84,0.35), inset 0 1px 0 rgba(255,255,255,0.45);
          transition: transform 0.14s ease-out, filter 0.14s;
        }
        .des-retry:active { transform: translateY(1.5px) scale(0.985); }
      `}</style>
    </div>
  )
}