import { useRouter } from 'next/router'
import { useRef } from 'react'
import { ChevronLeft, Brain } from 'lucide-react'
import { AI_SECTIONS } from '../../lib/aiSections'
import { useDragScroll } from '../../lib/useSwipe'
import { t } from '../../lib/i18n'

export default function AiNav({ section, onBack, version }) {
  const router = useRouter()
  const tabsRef = useRef(null)

  useDragScroll(tabsRef, {
    onSwipe: (dir) => {
      const idx = AI_SECTIONS.findIndex((s) => s.id === section)
      if (idx < 0) return
      const j = dir === 'next' ? idx + 1 : idx - 1
      if (j >= 0 && j < AI_SECTIONS.length) router.push(AI_SECTIONS[j].path)
    },
  })

  return (
    <nav className="ai-nav" aria-label="Navigation AI Studio">
      <div className="ai-nav-row">
        <button className="ai-nav-btn" onClick={onBack} aria-label="back">
          <ChevronLeft size={18} />
        </button>

        <div className="ai-nav-brand">
          <span className="ai-nav-logo">
            <Brain size={17} />
          </span>
          <span className="ai-nav-word">
            BLUEROCK
            <em className="ai-nav-ai">AI</em>
          </span>
          {version ? <span className="ai-nav-ver">{version}</span> : null}
        </div>

        <div className="ai-nav-status">
          <span className="ai-nav-pill live">
            <i className="ai-live-dot" />
            {t('aiStudioNavLive')}
          </span>
        </div>
      </div>

      {section !== 'hub' && (
        <div className="ai-nav-tabs" ref={tabsRef} data-ai-scroll>
          {AI_SECTIONS.map((sec) => {
            const Icon = sec.icon
            return (
              <button
                key={sec.id}
                className={`ai-tab ${section === sec.id ? 'active' : ''}`}
                onClick={() => router.push(sec.path)}
              >
                <Icon size={13} />
                <span>{t(sec.key)}</span>
              </button>
            )
          })}
        </div>
      )}

      <style jsx global>{`
        .ai-nav {
          position: sticky;
          top: 8px;
          z-index: 40;
          margin: 10px -2px 0;
          padding: 9px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: linear-gradient(180deg, rgba(23, 25, 32, 0.88), rgba(11, 12, 16, 0.78));
          backdrop-filter: blur(20px) saturate(1.5);
          -webkit-backdrop-filter: blur(20px) saturate(1.5);
          box-shadow: 0 14px 44px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }
        .ai-nav-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ai-nav-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .ai-nav-logo {
          width: 40px;
          height: 40px;
          border-radius: 13px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, #0052FC, #7C3AED 55%, #EC4899);
          box-shadow: 0 6px 18px rgba(0, 82, 252, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .ai-nav-word {
          display: flex;
          align-items: baseline;
          gap: 2px;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #fff;
          white-space: nowrap;
        }
        .ai-nav-word .ai-nav-ai {
          font-style: normal;
          background: linear-gradient(90deg, #4C8DFF, #A78BFA);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .ai-nav-ver {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-family: var(--font-mono);
          font-size: 9.5px;
          letter-spacing: 0.05em;
          color: #9AA3B2;
          border: 1px solid var(--tv-border);
          background: rgba(255, 255, 255, 0.03);
          white-space: nowrap;
        }
        .ai-nav-status {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .ai-nav-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .ai-nav-pill.live {
          color: #18C27C;
          background: rgba(24, 194, 124, 0.1);
          border: 1px solid rgba(24, 194, 124, 0.35);
        }
        .ai-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #18C27C;
          box-shadow: 0 0 8px rgba(24, 194, 124, 0.9);
          animation: aiPulse 1.8s ease-in-out infinite;
        }
        @keyframes aiPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.82); }
        }
        .ai-nav-btn {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.04);
          color: var(--tv-text-secondary);
          cursor: pointer;
          transition: all 0.18s ease;
          font-family: inherit;
        }
        .ai-nav-btn:hover {
          color: #fff;
          border-color: rgba(76, 141, 255, 0.5);
          background: rgba(76, 141, 255, 0.12);
        }
        .ai-nav-btn:disabled { opacity: 0.5; cursor: default; }
        .ai-nav-btn .spin { animation: aiSpin 0.8s linear infinite; }
        @keyframes aiSpin { to { transform: rotate(360deg); } }

        .ai-nav-tabs {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          margin-top: 9px;
          padding: 9px 1px 2px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          scrollbar-width: none;
          -ms-overflow-style: none;
          cursor: grab;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          scroll-behavior: smooth;
        }
        .ai-nav-tabs:active { cursor: grabbing; }
        .ai-nav-tabs::-webkit-scrollbar { display: none; }
        .ai-tab {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          color: var(--tv-text-secondary);
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          transition: all 0.18s ease;
          font-family: inherit;
          white-space: nowrap;
        }
        .ai-tab:hover { color: #fff; background: rgba(255, 255, 255, 0.06); }
        .ai-tab.active {
          color: #fff;
          background: linear-gradient(135deg, #0052FC, #7C3AED);
          box-shadow: 0 6px 18px rgba(0, 82, 252, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
        }

        @media (max-width: 440px) {
          .ai-nav-ver { display: none; }
          .ai-nav-word { font-size: 13.5px; }
        }
        @media (min-width: 1024px) {
          .ai-nav { top: 0px; }
          .ai-nav-tabs {
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
          }
          .ai-nav-tabs::-webkit-scrollbar {
            display: block;
            height: 6px;
          }
          .ai-nav-tabs::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 999px;
          }
        }
      `}</style>
    </nav>
  )
}
