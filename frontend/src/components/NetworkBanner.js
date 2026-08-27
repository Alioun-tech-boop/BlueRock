import { useEffect, useState, useCallback } from 'react'
import { t } from '../lib/i18n'

function OfflineArt() {
  return (
    <svg width="180" height="150" viewBox="0 0 180 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Server rack */}
      <rect x="60" y="38" width="64" height="82" rx="8" fill="#1a1f2e" stroke="#2d3548" strokeWidth="1.5"/>
      <rect x="70" y="48" width="44" height="8" rx="3" fill="#23293a"/>
      <rect x="70" y="62" width="44" height="8" rx="3" fill="#23293a"/>
      <rect x="70" y="76" width="44" height="8" rx="3" fill="#23293a"/>
      <rect x="70" y="90" width="44" height="8" rx="3" fill="#23293a"/>
      <circle cx="79" cy="52" r="2" fill="#F04438"/>
      <circle cx="79" cy="66" r="2" fill="#F04438"/>
      <circle cx="79" cy="80" r="2" fill="#F0A03D"/>
      <circle cx="79" cy="94" r="2" fill="#333"/>
      {/* Disconnected cable end */}
      <path d="M124 80 Q136 80 136 70 L136 60" stroke="#555" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <rect x="133" y="55" width="6" height="10" rx="2" fill="#444" stroke="#555" strokeWidth="1"/>
      {/* Cat pulling cable */}
      <ellipse cx="155" cy="92" rx="14" ry="10" fill="#F0A03D" opacity="0.9"/>
      <circle cx="150" cy="78" r="8" fill="#F0A03D" opacity="0.9"/>
      <circle cx="146" cy="75" r="1.8" fill="#1a1f2e"/>
      <circle cx="153" cy="75" r="1.8" fill="#1a1f2e"/>
      <ellipse cx="149.5" cy="79" rx="1.5" ry="1" fill="#E8906A"/>
      {/* Cat ears */}
      <path d="M143 72 L141 65 L146 70 Z" fill="#F0A03D" opacity="0.9"/>
      <path d="M155 72 L157 65 L153 70 Z" fill="#F0A03D" opacity="0.9"/>
      {/* Cat paw pulling cable */}
      <ellipse cx="138" cy="87" rx="5" ry="3.5" fill="#F0A03D" opacity="0.9"/>
      <path d="M136 84 L136 60" stroke="#F0A03D" strokeWidth="3" strokeLinecap="round" opacity="0.85"/>
      {/* Cat tail */}
      <path d="M169 92 Q178 82 174 72 Q170 64 176 60" stroke="#F0A03D" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85"/>
      {/* Cat legs */}
      <rect x="146" y="98" width="4" height="8" rx="2" fill="#F0A03D" opacity="0.85"/>
      <rect x="156" y="98" width="4" height="8" rx="2" fill="#F0A03D" opacity="0.85"/>
      {/* Spark near plug */}
      <path d="M140 58 L143 52 L140 54 L143 48" stroke="#FFD97A" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.7"/>
    </svg>
  )
}

export default function NetworkBanner() {
  const [status, setStatus] = useState('online')
  const [dismissed, setDismissed] = useState(false)

  const goOnline = useCallback(() => {
    setStatus('online')
    setDismissed(false)
  }, [])

  const goOffline = useCallback(() => {
    setStatus('offline')
  }, [])

  useEffect(() => {
    const onNavigatorOnline = () => goOnline()
    const onNavigatorOffline = () => goOffline()

    const onCustomNet = (e) => {
      const online = e?.detail?.online
      if (online === false) {
        setStatus(prev => prev === 'online' ? 'unstable' : prev)
        setDismissed(false)
      } else if (online === true) {
        goOnline()
      }
    }

    window.addEventListener('online', onNavigatorOnline)
    window.addEventListener('offline', onNavigatorOffline)
    window.addEventListener('bluerock:net', onCustomNet)

    if (!navigator.onLine) setStatus('offline')

    return () => {
      window.removeEventListener('online', onNavigatorOnline)
      window.removeEventListener('offline', onNavigatorOffline)
      window.removeEventListener('bluerock:net', onCustomNet)
    }
  }, [goOnline, goOffline])

  useEffect(() => {
    if (status !== 'unstable') return
    const timer = setTimeout(() => setDismissed(true), 6000)
    return () => clearTimeout(timer)
  }, [status])

  if (status === 'online' || (status === 'unstable' && dismissed)) return null

  if (status === 'offline') {
    return (
      <div className="nb-overlay">
        <div className="nb-offline-box">
          <OfflineArt />
          <p className="nb-offline-title">Connexion perdue</p>
          <p className="nb-offline-sub">Vérifiez votre connexion réseau et réessayez.</p>
        </div>
        <style jsx>{`
          .nb-overlay {
            position: fixed; inset: 0; z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            background: rgba(3,5,9,0.96);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          }
          .nb-offline-box {
            display: flex; flex-direction: column; align-items: center;
            text-align: center; padding: 32px 24px;
          }
          .nb-offline-title {
            margin: 18px 0 0; font-size: 20px; font-weight: 800;
            color: #fff; letter-spacing: -0.02em;
          }
          .nb-offline-sub {
            margin: 6px 0 0; font-size: 13px; color: rgba(226,232,240,0.6);
            line-height: 1.5;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="nb-banner">
      <span className="nb-dot" />
      <span>Connexion instable…</span>
      <button className="nb-dismiss" onClick={() => setDismissed(true)}>×</button>
      <style jsx>{`
        .nb-banner {
          position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 16px;
          background: rgba(255,255,255,0.12);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,0.85);
          animation: nbFadeIn .3s ease;
        }
        .nb-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #F0A03D; flex-shrink: 0;
          animation: nbPulse 1.4s ease-in-out infinite;
        }
        .nb-dismiss {
          margin-left: 8px; padding: 2px 6px; border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 700;
          cursor: pointer; line-height: 1; font-family: inherit;
        }
        @keyframes nbFadeIn { from { opacity: 0; transform: translateY(-10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes nbPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
      `}</style>
    </div>
  )
}
