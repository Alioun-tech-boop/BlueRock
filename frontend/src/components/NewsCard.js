import { useState } from 'react'
import { t, detectLang, fmtDateTime } from '../lib/i18n'
import { sanitizeImageUrl, sanitizeText } from '../lib/sanitize'

const MARKET_IMAGES = ['/news/mkt-1.svg', '/news/mkt-2.svg', '/news/mkt-3.svg', '/news/mkt-4.svg']
const BAD_IMG = /logo|icon|avatar|favicon|sprite|placeholder|banner|1x1|blank|feed|googleusercontent|gstatic|\.svg|\.gif|data:image/i
const WP_SIZE = /-\d-x\d+(?=\.[a-zA-Z0-9]+$)/

function upscale(url) {
  return (url || '').replace(WP_SIZE, '')
}

function pickMarketImage(title) {
  let h = 0
  const s = title || ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return MARKET_IMAGES[h % MARKET_IMAGES.length]
}

export default function NewsCard({ item, badge, onOpen, fallbackKind }) {
  const [failed, setFailed] = useState(false)
  const isMarket = fallbackKind === 'market'
  const fallback = sanitizeText((item.source || item.category || '?').trim().charAt(0).toUpperCase())
  const badImage = !item.image || BAD_IMG.test(item.image)
  // Sanitize l'URL d'image pour prévenir les attaques XSS
  const safeImageUrl = sanitizeImageUrl(upscale(item.image))
  const coverSrc = safeImageUrl && !failed && !(isMarket && badImage) ? safeImageUrl : null

  return (
    <button className="news-card" onClick={onOpen}>
      <div className="nc-media">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            onLoad={e => { if (e.target.naturalWidth && e.target.naturalWidth < 260) setFailed(true) }}
            className="nc-cover"
          />
        ) : isMarket ? (
          <img src={pickMarketImage(item.title)} alt="" loading="lazy" className="nc-cover" />
        ) : (
          <div className="nc-cover-fallback">{fallback}</div>
        )}
        {badge && <span className="nc-badge">{badge}</span>}
      </div>
      <div className="nc-body">
        <div className="nc-title">{sanitizeText(item.title)}</div>
        <span className="nc-time">{fmtDateTime(detectLang(), item.date)}</span>
        <span className="nc-read">{t('readArticle')}</span>
      </div>
      <style jsx>{`
        .news-card {
          display: flex;
          flex-direction: column;
          width: 100%;
          padding: 0;
          border: none;
          border-radius: 22px;
          background: #161616;
          color: #fff;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          overflow: hidden;
        }
        .news-card:active { opacity: 0.92; }
        .nc-media {
          position: relative;
          width: 100%;
          height: 0;
          padding-bottom: 50%;
          background: #0e0e0e;
        }
        .nc-cover {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .nc-cover-fallback {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          font-weight: 700;
          color: rgba(255,255,255,0.85);
          background: linear-gradient(135deg, #16375f 0%, #224b7a 55%, #3a73b0 100%);
        }
        .nc-badge {
          position: absolute;
          top: 14px;
          left: 14px;
          max-width: calc(100% - 28px);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 7px 13px;
          border-radius: 999px;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #fff;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0;
          line-height: 1.3;
        }
        .nc-body {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 15px 16px 17px;
        }
        .nc-title {
          font-size: 17px;
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: 0.1px;
          color: #F8F8FA;
          overflow-wrap: anywhere;
        }
        .nc-time {
          margin-top: 10px;
          font-size: 12.5px;
          font-weight: 500;
          color: #9AA3B2;
          letter-spacing: 0.2px;
        }
        .nc-read {
          margin-top: 15px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 46px;
          padding: 0 20px;
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 999px;
          background: transparent;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0;
          line-height: 1;
          font-family: inherit;
          white-space: nowrap;
        }
        .news-card:active .nc-read { background: rgba(255,255,255,0.08); }
      `}</style>
    </button>
  )
}
