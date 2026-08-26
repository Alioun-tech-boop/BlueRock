import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { t } from '../lib/i18n'

export default function InstallPWA() {
  const [deferred, setDeferred] = useState(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      setHidden(false)
    }
    const onInstalled = () => {
      setDeferred(null)
      setHidden(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred || hidden) return null

  const install = async () => {
    deferred.prompt()
    try {
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') setDeferred(null)
    } catch {}
    setHidden(true)
  }

  return (
    <div className="pwa-banner">
      <img className="pwa-icon" src="/icon-192.png" alt="" />
      <div className="pwa-txt">
        <b>{t('fr', 'cInstallCta')}</b>
        <span>{t('fr', 'cInstallSub')}</span>
      </div>
      <button className="pwa-btn" onClick={install}>{t('fr', 'cInstallBtn')}</button>
      <button className="pwa-x" onClick={() => setHidden(true)} aria-label="Fermer"><X size={14} /></button>
      <style jsx>{`
        .pwa-banner {
          position: fixed; left: 12px; right: 12px; bottom: calc(76px + env(safe-area-inset-bottom));
          z-index: 9997; display: flex; align-items: center; gap: 10px;
          background: rgba(14,18,22,0.97); border: 1px solid #2e54ff55; border-radius: 14px;
          padding: 10px 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          animation: pwaIn .35s ease;
        }
        @keyframes pwaIn { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        .pwa-icon { width: 38px; height: 38px; border-radius: 10px; flex: none; }
        .pwa-txt { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
        .pwa-txt b { font-size: 12.5px; color: #fff; }
        .pwa-txt span { font-size: 10.5px; color: rgba(255,255,255,0.5); }
        .pwa-btn {
          flex: none; font-size: 11.5px; font-weight: 800; background: #2e54ff; color: #fff;
          border: none; border-radius: 999px; padding: 7px 13px; cursor: pointer;
        }
        .pwa-x {
          flex: none; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
          background: transparent; border: none; color: rgba(255,255,255,0.55); cursor: pointer;
        }
      `}</style>
    </div>
  )
}