import { useRouter } from 'next/router'
import { useRef } from 'react'
import { RefreshCw, WifiOff, Gauge, Lock, Crown, ArrowRight } from 'lucide-react'
import TriLoader from './TriLoader'
import BottomNav from './BottomNav'
import AiNav from './ai/AiNav'
import useAiStudio from '../lib/useAiStudio'
import { AI_SECTIONS } from '../lib/aiSections'
import { useSwipeNav } from '../lib/useSwipe'
import { useAuth } from '../lib/auth'
import { t } from '../lib/i18n'

export default function AiShell({ section, back = '/ai-studio', children }) {
  const router = useRouter()
  const safeRef = useRef(null)
  const { user, authLoading } = useAuth()
  const isPro = user?.tier === 'pro'
  const { data, loading, error, refresh } = useAiStudio({ enabled: !!isPro })

  const goSection = (dir) => {
    const idx = AI_SECTIONS.findIndex((s) => s.id === section)
    if (idx < 0) return
    const j = dir === 'next' ? idx + 1 : idx - 1
    if (j >= 0 && j < AI_SECTIONS.length) router.push(AI_SECTIONS[j].path)
  }

  useSwipeNav(safeRef, {
    onPrev: () => goSection('prev'),
    onNext: () => goSection('next'),
    onlyTouch: true,
    enabled: section !== 'hub',
  })

  const s = data?.status || {}
  const perf = data?.performance || {}
  const risk = data?.risk || {}
  const port = data?.portfolio || {}
  const h = data?.health || {}
  const bt = data?.backtest || null
  const versions = data?.evolution?.versions || []
  const events = data?.evolution?.events || []
  const decisions = data?.decisions || []
  const activity = Array.isArray(data?.activity) ? data.activity : []
  const features = data?.registry?.features || []
  const models = data?.registry?.models || []
  const positions = port.positions || []
  const dims = h.dimensions || {}
  const dq = h.data_quality || []
  const alerts = data?.alerts || []

  const goBack = () => {
    if (window.history.length > 1) router.back()
    else router.replace(back)
  }

  const ctx = { data, s, perf, risk, port, h, bt, versions, events, decisions, activity, features, models, positions, dims, dq, alerts }

  return (
    <div className="mobile-root">
      <div className="safe-area ai-safe" ref={safeRef}>
        <AiNav
          section={section}
          onBack={goBack}
          version={s.version}
        />

        {authLoading ? (
          <div className="ai-loading"><TriLoader inline /></div>
        ) : !isPro ? (
          <div className="ai-pro-lock">
            <div className="ai-pro-lock-top">
              <div className="ai-pro-lock-ico"><Lock size={22} /></div>
              <span className="ai-pro-lock-badge"><Crown size={11} /> {t('aiProLockBadge')}</span>
            </div>
            <h2 className="ai-pro-lock-title">{t('aiProLockTitle')}</h2>
            <p className="ai-pro-lock-sub">{t('aiProLockSub')}</p>
            <div className="ai-pro-lock-price">{t('aiProLockPrice')}</div>
            <button
              className="ai-pro-lock-cta"
              onClick={() => router.push(user ? '/premium' : `/login?next=${encodeURIComponent('/premium')}`)}
            >
              {t('aiProLockCta')} <ArrowRight size={15} />
            </button>
          </div>
        ) : loading && !data ? (
          <div className="ai-loading"><TriLoader inline /></div>
        ) : error ? (
          <div className="ai-offline">
            <div className="ai-offline-ico"><WifiOff size={21} /></div>
            <h3 className="ai-offline-title">{t('aiOfflineTitle')}</h3>
            <p className="ai-offline-sub">{t('aiOfflineSub')}</p>
            <button className="ai-offline-retry" onClick={refresh}><RefreshCw size={13} /> {t('retry')}</button>
          </div>
        ) : typeof children === 'function' ? (
          children(ctx)
        ) : (
          children
        )}

        <div className="ai-footer-note">
          <Gauge size={13} />
          <span>AI Health · <b className={`ok ${(h.global_status || 'OPERATIONAL').toLowerCase()}`}>{h.global_status || 'OPERATIONAL'}</b> — {t('aiStudioObserver')}</span>
        </div>
      </div>
      <BottomNav />
      <style jsx global>{`
        .ai-safe { padding: 0 16px 8px; touch-action: pan-y; }

        @media (min-width: 1024px) {
          .mobile-root {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
          }
          .mobile-root .ai-safe {
            flex: 1;
            overflow-y: auto;
            max-width: 1080px !important;
            margin: 0 auto !important;
          }
        }

        .ai-loading { display: flex; justify-content: center; padding: 60px 0; }
        .ai-pro-lock {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          margin: 24px 0; padding: 32px 24px;
          border-radius: 22px;
          border: 1px solid rgba(255,215,122,0.28);
          background:
            radial-gradient(130% 120% at 80% -10%, rgba(139,92,246,0.18), transparent 50%),
            radial-gradient(120% 140% at -10% 110%, rgba(255,215,122,0.14), transparent 55%),
            linear-gradient(135deg, rgba(23,37,84,0.9), rgba(30,27,75,0.95));
        }
        .ai-pro-lock-top { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .ai-pro-lock-ico {
          width: 54px; height: 54px; border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, rgba(255,215,122,0.16), rgba(255,215,122,0.06));
          border: 1px solid rgba(255,215,122,0.32); color: #FFD97A;
        }
        .ai-pro-lock-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 999px;
          font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
          color: #FFD97A; background: rgba(255,215,122,0.12);
          border: 1px solid rgba(255,215,122,0.3);
        }
        .ai-pro-lock-title {
          margin: 14px 0 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;
          color: #fff; line-height: 1.3;
        }
        .ai-pro-lock-sub {
          margin: 8px 0 0; font-size: 13px; line-height: 1.55; color: var(--tv-text-secondary);
          max-width: 340px;
        }
        .ai-pro-lock-price {
          margin-top: 18px; font-size: 16px; font-weight: 800; color: #FFD97A;
          letter-spacing: -0.01em;
        }
        .ai-pro-lock-cta {
          margin-top: 14px; display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 22px; border-radius: 999px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #0052FC, #7C3AED);
          color: #fff; font-size: 13.5px; font-weight: 800;
          font-family: inherit; transition: transform .12s ease, box-shadow .12s ease;
        }
        .ai-pro-lock-cta:active { transform: scale(0.97); }
        .ai-pro-lock-cta:hover { box-shadow: 0 6px 20px rgba(0,82,252,0.5); }
        .ai-offline {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: 4px; margin-top: 16px; padding: 30px 22px;
          border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(180deg, rgba(23, 25, 32, 0.72), rgba(11, 12, 16, 0.72));
        }
        .ai-offline-ico {
          width: 46px; height: 46px; border-radius: 15px; margin-bottom: 8px;
          display: flex; align-items: center; justify-content: center;
          color: var(--tv-text-muted); background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
        }
        .ai-offline-title { margin: 0; font-size: 15px; font-weight: 800; color: #fff; }
        .ai-offline-sub {
          margin: 5px 0 0; font-size: 12px; line-height: 1.55;
          color: var(--tv-text-secondary); max-width: 300px;
        }
        .ai-offline-retry {
          margin-top: 14px; display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 15px; border-radius: 999px; cursor: pointer;
          border: 1px solid rgba(24, 194, 124, 0.4); background: rgba(24, 194, 124, 0.1);
          color: #18C27C; font-size: 12px; font-weight: 700; font-family: inherit;
        }
        .ai-offline-retry:active { transform: scale(0.97); }

        .ai-hero {
          position: relative; overflow: hidden; margin-top: 12px;
          padding: 18px 16px 16px;
          border-radius: 22px; border: 1px solid rgba(0,82,252,0.4);
          background:
            radial-gradient(120% 140% at 88% -10%, rgba(139,92,246,0.32), transparent 52%),
            radial-gradient(120% 150% at -10% 110%, rgba(6,182,212,0.22), transparent 55%),
            linear-gradient(135deg, rgba(0,82,252,0.28), rgba(23,37,84,0.5));
        }
        .ai-hero-orb {
          position: absolute; top: -40px; right: -30px; width: 170px; height: 170px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,82,252,0.5), rgba(139,92,246,0.25) 55%, transparent 72%);
          filter: blur(22px); pointer-events: none;
        }
        .ai-hero-top { display: flex; align-items: center; gap: 12px; position: relative; }
        .ai-hero-logo {
          width: 46px; height: 46px; border-radius: 14px; flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #0052FC, #7C3AED); color: #fff;
          box-shadow: 0 8px 20px rgba(0,82,252,0.4);
        }
        .ai-hero-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .ai-hero-name { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; color: #fff; }
        .ai-hero-sub { font-size: 11px; color: rgba(226,232,240,0.7); font-weight: 600; }
        .ai-hero-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
        .ai-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 9px; border-radius: 999px; font-size: 10px; font-weight: 800;
          letter-spacing: 0.08em;
        }
        .ai-badge.active { color: #18C27C; background: rgba(24,194,124,0.12); border: 1px solid rgba(24,194,124,0.35); }
        .ai-dot { width: 6px; height: 6px; border-radius: 50%; background: #18C27C; animation: aiPulse 2s infinite; }
        @keyframes aiPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .ai-badge.hlth { width: fit-content; }
        .ai-badge.hlth.operational { color: #18C27C; background: rgba(24,194,124,0.12); border: 1px solid rgba(24,194,124,0.35); }
        .ai-badge.hlth.degraded { color: #F0A03D; background: rgba(240,160,61,0.1); border: 1px solid rgba(240,160,61,0.35); }
        .ai-hero-version {
          display: flex; align-items: baseline; gap: 9px; margin-top: 14px; position: relative;
        }
        .ai-hero-version-tag {
          font-size: 30px; font-weight: 800; letter-spacing: -0.02em; color: #fff;
          font-variant-numeric: tabular-nums;
        }
        .ai-hero-version-label { font-size: 12px; color: rgba(226,232,240,0.65); font-weight: 600; }
        .ai-hero-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px;
          margin-top: 14px; position: relative;
        }
        .ai-hero-grid > div {
          display: flex; flex-direction: column; gap: 1px;
          padding: 9px 11px; border-radius: 12px;
          background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.06);
        }
        .ai-hero-grid span { font-size: 10px; color: rgba(226,232,240,0.55); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700; }
        .ai-hero-grid b { font-size: 12.5px; color: #fff; font-weight: 700; }

        .ai-observer {
          display: flex; align-items: flex-start; gap: 9px; margin-top: 14px;
          padding: 12px 13px; border-radius: 14px;
          border: 1px solid rgba(76,141,255,0.22); background: rgba(76,141,255,0.06);
          font-size: 12px; line-height: 1.5; color: var(--tv-text-secondary);
        }

        .ai-section { margin-top: 22px; }
        .ai-section-head {
          display: flex; align-items: center; gap: 8px;
          font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: #fff;
          padding: 0 2px; margin-bottom: 11px;
        }
        .ai-section-head :global(svg) { color: #4C8DFF; }
        .ai-section-sub {
          font-size: 11px; font-weight: 600; color: var(--tv-text-muted);
          margin-left: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ai-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
        }
        .ai-tile {
          padding: 12px 12px; border-radius: 14px;
          background: var(--tv-bg-elevated); border: 1px solid var(--tv-border);
        }
        .ai-tile-label { font-size: 10px; color: var(--tv-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .ai-tile-value { font-size: 17px; font-weight: 800; color: #fff; margin-top: 4px; font-variant-numeric: tabular-nums; }
        .ai-tile-value.pos { color: #18C27C; }
        .ai-tile-value.neg { color: #F04438; }
        .ai-tile-sub { font-size: 11px; color: var(--tv-text-muted); margin-top: 2px; }

        .ai-pos-list { margin-top: 10px; border-radius: 16px; border: 1px solid var(--tv-border); background: var(--tv-bg-elevated); padding: 6px 14px; }
        .ai-pos-head { display: flex; justify-content: space-between; padding: 8px 0; font-size: 10px; color: var(--tv-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .ai-pos-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--tv-divider); }
        .ai-pos-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ai-pos-main b { font-size: 13.5px; color: #fff; }
        .ai-pos-sector {
          width: fit-content; font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
          color: #4C8DFF; background: rgba(76,141,255,0.12); border-radius: 999px; padding: 1px 7px; margin-top: 2px;
        }
        .ai-pos-name { font-size: 11px; color: var(--tv-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ai-pos-nums { font-size: 11px; color: var(--tv-text-muted); }
        .ai-pos-nums i { font-style: normal; }
        .ai-pos-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: 0 0 70px; }
        .ai-pos-right b { font-size: 13px; color: #fff; font-variant-numeric: tabular-nums; }
        .ai-pos-bar { width: 70px; height: 4px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .ai-pos-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #0052FC, #7C3AED); }

        .ai-card-dec {
          border-radius: 16px; border: 1px solid var(--tv-border);
          background: var(--tv-bg-elevated); padding: 18px;
        }
        .ai-dec-empty { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--tv-text-muted); font-size: 13px; padding: 8px 0; }

        .ai-dec-list { display: flex; flex-direction: column; gap: 10px; }
        .ai-dec {
          border-radius: 16px; border: 1px solid var(--tv-border);
          background: var(--tv-bg-elevated); padding: 14px;
        }
        .ai-dec.buy { border-left: 3px solid #18C27C; }
        .ai-dec.sell { border-left: 3px solid #F04438; }
        .ai-dec.hold { border-left: 3px solid #F0A03D; }
        .ai-dec-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .ai-dec-type, .ai-dec-status {
          font-size: 10px; font-weight: 800; letter-spacing: 0.07em; padding: 3px 9px; border-radius: 999px;
        }
        .ai-dec-type.buy { color: #18C27C; background: rgba(24,194,124,0.12); border: 1px solid rgba(24,194,124,0.35); }
        .ai-dec-type.sell { color: #F04438; background: rgba(240,68,56,0.12); border: 1px solid rgba(240,68,56,0.35); }
        .ai-dec-type.hold { color: #F0A03D; background: rgba(240,160,61,0.12); border: 1px solid rgba(240,160,61,0.35); }
        .ai-dec-status.executed { color: #18C27C; background: rgba(24,194,124,0.1); border: 1px solid rgba(24,194,124,0.3); }
        .ai-dec-status.pending { color: #F0A03D; background: rgba(240,160,61,0.1); border: 1px solid rgba(240,160,61,0.3); }
        .ai-dec-status.rejected { color: #F04438; background: rgba(240,68,56,0.1); border: 1px solid rgba(240,68,56,0.3); }
        .ai-dec-symbol { font-size: 17px; font-weight: 800; color: #fff; letter-spacing: 0.02em; }
        .ai-dec-name { font-size: 11px; color: var(--tv-text-secondary); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ai-dec-price { font-size: 11px; color: var(--tv-text-muted); margin-top: 3px; }
        .ai-dec-meta { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-top: 9px; font-size: 11px; color: var(--tv-text-muted); }
        .ai-dec-meta b { color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; }
        .ai-conf-track { height: 5px; border-radius: 99px; background: rgba(255,255,255,0.08); margin-top: 9px; overflow: hidden; }
        .ai-conf-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #0052FC, #7C3AED); }
        .ai-dec-factors { margin-top: 10px; }
        .ai-dec-factors-title { font-size: 10px; color: var(--tv-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .ai-factors-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .ai-factor {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px;
          border: 1px solid var(--tv-border);
        }
        .ai-factor.pos { color: #18C27C; background: rgba(24,194,124,0.08); }
        .ai-factor.neg { color: #F04438; background: rgba(240,68,56,0.08); }
        .ai-factor i { font-style: normal; font-weight: 900; }
        .ai-dec-summary { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--tv-divider); font-size: 11.5px; line-height: 1.55; color: var(--tv-text-secondary); }

        .ai-bt-note {
          display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
          padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(139,92,246,0.25);
          background: rgba(139,92,246,0.07); font-size: 11.5px; color: var(--tv-text-secondary);
        }
        .ai-bt-note :global(svg) { color: #8B5CF6; flex: 0 0 auto; }

        .ai-health-card { border-radius: 16px; border: 1px solid var(--tv-border); background: var(--tv-bg-elevated); padding: 14px; }
        .ai-health-card.operational { border-color: rgba(24,194,124,0.3); }
        .ai-health-card.degraded { border-color: rgba(240,160,61,0.3); }
        .ai-health-status { display: flex; margin-bottom: 10px; }
        .ai-health-dims { display: flex; flex-direction: column; gap: 8px; }
        .ai-health-row { display: flex; align-items: center; gap: 10px; }
        .ai-health-label { flex: 0 0 92px; font-size: 11px; color: var(--tv-text-secondary); font-weight: 600; }
        .ai-health-track { flex: 1; height: 6px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .ai-health-fill { height: 100%; border-radius: 99px; transition: width 0.4s; }
        .ai-health-fill.ok { background: linear-gradient(90deg, #18C27C, #4ADE80); }
        .ai-health-fill.warn { background: linear-gradient(90deg, #F0A03D, #FBBF24); }
        .ai-health-fill.bad { background: linear-gradient(90deg, #F04438, #FB7185); }
        .ai-health-fill.none { background: rgba(148,163,184,0.4); }
        .ai-health-val { flex: 0 0 42px; text-align: right; font-size: 11px; color: var(--tv-text-muted); font-variant-numeric: tabular-nums; }

        .ai-dq-list, .ai-feat-card { margin-top: 10px; border-radius: 16px; border: 1px solid var(--tv-border); background: var(--tv-bg-elevated); padding: 12px 14px; }
        .ai-dq-title { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--tv-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 8px; }
        .ai-dq-title :global(svg) { color: #4C8DFF; }
        .ai-dq-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--tv-divider); }
        .ai-dq-main { display: flex; flex-direction: column; gap: 1px; }
        .ai-dq-main b { font-size: 13px; color: #fff; }
        .ai-dq-main span { font-size: 11px; color: var(--tv-text-muted); }
        .ai-dq-nums { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--tv-text-muted); }
        .ai-dq-nums b { color: #fff; }
        .ai-dq-status { font-size: 9px; font-weight: 800; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 999px; }
        .ai-dq-status.ok { color: #18C27C; background: rgba(24,194,124,0.12); }
        .ai-dq-status.warn { color: #F0A03D; background: rgba(240,160,61,0.1); }
        .ai-dq-status.critical { color: #F04438; background: rgba(240,68,56,0.1); }
        .ai-feat-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .ai-feat-chip {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 999px;
          border: 1px solid rgba(76,141,255,0.3); background: rgba(76,141,255,0.08); color: #fff;
        }
        .ai-feat-chip i { font-style: normal; font-size: 10px; color: var(--tv-text-muted); }
        .ai-model-info { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--tv-divider); display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--tv-text-secondary); }
        .ai-model-info b { color: #fff; font-weight: 700; }

        .ai-timeline { display: flex; flex-direction: column; }
        .ai-tl-item { display: flex; gap: 12px; position: relative; padding-bottom: 16px; }
        .ai-tl-item:not(.last)::before {
          content: ''; position: absolute; left: 5px; top: 14px; bottom: 0;
          width: 2px; background: var(--tv-divider);
        }
        .ai-tl-dot {
          width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; margin-top: 3px;
          background: #0052FC; box-shadow: 0 0 12px rgba(0,82,252,0.6);
        }
        .ai-tl-body { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .ai-tl-version { font-size: 14px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
        .ai-tl-status {
          font-size: 10px; font-weight: 800; letter-spacing: 0.06em; padding: 2px 8px; border-radius: 999px;
          color: #18C27C; background: rgba(24,194,124,0.12); border: 1px solid rgba(24,194,124,0.35);
        }
        .ai-tl-status.draft, .ai-tl-status.testing { color: #F0A03D; background: rgba(240,160,61,0.1); border-color: rgba(240,160,61,0.35); }
        .ai-tl-status.retired, .ai-tl-status.rejected { color: #F04438; background: rgba(240,68,56,0.1); border-color: rgba(240,68,56,0.35); }
        .ai-tl-date { font-size: 11px; color: var(--tv-text-muted); }

        .ai-events { margin-top: 12px; border-radius: 16px; border: 1px solid var(--tv-border); background: var(--tv-bg-elevated); padding: 12px 14px; }
        .ai-event-row { display: flex; flex-direction: column; gap: 1px; padding: 8px 0; border-top: 1px solid var(--tv-divider); }
        .ai-event-type { font-size: 11px; font-weight: 700; color: #fff; text-transform: lowercase; }
        .ai-event-detail { font-size: 11px; color: var(--tv-text-secondary); }
        .ai-event-date { font-size: 10px; color: var(--tv-text-muted); }

        .ai-activity { display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--tv-border); background: var(--tv-bg-elevated); padding: 4px 14px; }
        .ai-act-row { display: flex; align-items: flex-start; gap: 11px; padding: 11px 0; border-top: 1px solid var(--tv-divider); }
        .ai-act-icon {
          flex: 0 0 auto; width: 30px; height: 30px; border-radius: 10px; display: flex;
          align-items: center; justify-content: center;
          background: rgba(76,141,255,0.12); color: #4C8DFF;
        }
        .ai-act-icon.decision { color: #A78BFA; background: rgba(139,92,246,0.12); }
        .ai-act-icon.order { color: #4C8DFF; background: rgba(76,141,255,0.12); }
        .ai-act-icon.execution { color: #18C27C; background: rgba(24,194,124,0.12); }
        .ai-act-icon.backtest { color: #8B5CF6; background: rgba(139,92,246,0.12); }
        .ai-act-icon.version { color: #F0A03D; background: rgba(240,160,61,0.12); }
        .ai-act-icon.snapshot { color: #22D3EE; background: rgba(34,211,238,0.12); }
        .ai-act-icon.audit { color: #94A3B8; background: rgba(148,163,184,0.12); }
        .ai-act-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .ai-act-label { font-size: 12.5px; font-weight: 700; color: #fff; }
        .ai-act-detail { font-size: 11px; color: var(--tv-text-secondary); }
        .ai-act-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
        .ai-act-status { font-size: 9px; font-weight: 800; letter-spacing: 0.05em; padding: 1px 7px; border-radius: 999px; }
        .ai-act-status.filled, .ai-act-status.ok, .ai-act-status.completed, .ai-act-status.executed, .ai-act-status.audit { color: #18C27C; background: rgba(24,194,124,0.12); }
        .ai-act-status.pending, .ai-act-status.draft { color: #F0A03D; background: rgba(240,160,61,0.1); }
        .ai-act-status.rejected, .ai-act-status.failed { color: #F04438; background: rgba(240,68,56,0.1); }
        .ai-act-time { font-size: 10px; color: var(--tv-text-muted); white-space: nowrap; }

        .ai-overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 14px; }
        .ai-ov-tile {
          display: flex; flex-direction: column; gap: 6px;
          padding: 14px; border-radius: 16px;
          background: var(--tv-bg-elevated); border: 1px solid var(--tv-border);
        }
        .ai-ov-label { font-size: 10px; color: var(--tv-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .ai-ov-value { font-size: 19px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
        .ai-ov-value.pos { color: #18C27C; }
        .ai-ov-value.neg { color: #F04438; }
        .ai-ov-sub { font-size: 11px; color: var(--tv-text-muted); }

        .ai-cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 12px; }
        .ai-card {
          position: relative; display: flex; flex-direction: column; gap: 8px;
          padding: 14px; border-radius: 16px; text-align: left; cursor: pointer;
          background: var(--tv-bg-elevated); border: 1px solid var(--tv-border);
          font-family: inherit; transition: border-color .15s ease, transform .15s ease;
        }
        .ai-card:active { transform: scale(0.98); }
        .ai-card:hover { border-color: rgba(0,82,252,0.5); }
        .ai-card-ico {
          width: 34px; height: 34px; border-radius: 11px; display: flex; align-items: center; justify-content: center;
          background: rgba(76,141,255,0.14); color: #4C8DFF;
        }
        .ai-card-ico.violet { background: rgba(139,92,246,0.14); color: #A78BFA; }
        .ai-card-ico.green { background: rgba(24,194,124,0.14); color: #18C27C; }
        .ai-card-ico.amber { background: rgba(240,160,61,0.14); color: #F0A03D; }
        .ai-card-ico.cyan { background: rgba(34,211,238,0.14); color: #22D3EE; }
        .ai-card-ico.pink { background: rgba(236,72,153,0.14); color: #F472B6; }
        .ai-card-name { font-size: 13.5px; font-weight: 800; color: #fff; }
        .ai-card-preview { font-size: 11px; color: var(--tv-text-muted); line-height: 1.45; }
        .ai-card-preview b { color: var(--tv-text-secondary); font-weight: 700; }

        .ai-see-all {
          display: inline-flex; align-items: center; gap: 6px; margin-top: 12px;
          font-size: 12.5px; font-weight: 700; color: #4C8DFF; cursor: pointer;
          background: none; border: none; padding: 6px 2px; font-family: inherit;
        }

        .ai-footer-note {
          display: flex; align-items: flex-start; gap: 8px; margin: 26px 0 8px;
          padding: 13px; border-radius: 14px; border: 1px solid var(--tv-border);
          background: var(--tv-bg-elevated); font-size: 11.5px; line-height: 1.5; color: var(--tv-text-secondary);
        }
        .ai-footer-note :global(svg) { flex: 0 0 auto; margin-top: 1px; }
        .ai-footer-note .ok { color: #18C27C; }
        .ai-footer-note .ok.degraded { color: #F0A03D; }

        /* — Alertes du Risk Engine — */
        .ai-alert-list { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
        .ai-alert-row {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 11px 12px; border-radius: 13px;
          border: 1px solid var(--tv-border); background: var(--tv-bg-elevated);
        }
        .ai-alert-row.critical { border-color: rgba(240,68,56,0.35); background: rgba(240,68,56,0.05); }
        .ai-alert-row.warning { border-color: rgba(240,160,61,0.32); background: rgba(240,160,61,0.05); }
        .ai-alert-row.info { border-color: rgba(76,141,255,0.28); background: rgba(76,141,255,0.05); }
        .ai-alert-ico {
          flex: 0 0 auto; width: 26px; height: 26px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center; margin-top: 1px;
        }
        .ai-alert-row.critical .ai-alert-ico { color: #F04438; background: rgba(240,68,56,0.12); }
        .ai-alert-row.warning .ai-alert-ico { color: #F0A03D; background: rgba(240,160,61,0.12); }
        .ai-alert-row.info .ai-alert-ico { color: #4C8DFF; background: rgba(76,141,255,0.12); }
        .ai-alert-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .ai-alert-title { font-size: 12.5px; font-weight: 700; color: #fff; line-height: 1.35; }
        .ai-alert-detail { font-size: 11px; color: var(--tv-text-secondary); line-height: 1.45; }
        .ai-alert-time { font-size: 10px; color: var(--tv-text-muted); white-space: nowrap; }
        .ai-alert-sev {
          font-size: 9px; font-weight: 800; letter-spacing: 0.05em; padding: 1px 7px; border-radius: 999px;
          width: fit-content;
        }
        .ai-alert-sev.critical { color: #F04438; background: rgba(240,68,56,0.12); }
        .ai-alert-sev.warning { color: #F0A03D; background: rgba(240,160,61,0.1); }
        .ai-alert-sev.info { color: #4C8DFF; background: rgba(76,141,255,0.12); }

        /* — Stress tests — */
        .ai-stress-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ai-stress-card {
          padding: 12px; border-radius: 14px; border: 1px solid var(--tv-border);
          background: var(--tv-bg-elevated);
        }
        .ai-stress-card.critical { border-color: rgba(240,68,56,0.4); }
        .ai-stress-card.warning { border-color: rgba(240,160,61,0.38); }
        .ai-stress-name { font-size: 12px; font-weight: 800; color: #fff; }
        .ai-stress-code { font-size: 9px; color: var(--tv-text-muted); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; }
        .ai-stress-imp { font-size: 19px; font-weight: 800; margin-top: 6px; font-variant-numeric: tabular-nums; }
        .ai-stress-imp.critical { color: #F04438; }
        .ai-stress-imp.warning { color: #F0A03D; }
        .ai-stress-meta { font-size: 10px; color: var(--tv-text-muted); margin-top: 4px; line-height: 1.5; }
        .ai-stress-desc { font-size: 10.5px; color: var(--tv-text-secondary); margin-top: 6px; line-height: 1.5; }

        /* — Concentration sectorielle — */
        .ai-sec-card { border-radius: 16px; border: 1px solid var(--tv-border); background: var(--tv-bg-elevated); padding: 14px; margin-top: 10px; }
        .ai-sec-title { font-size: 11px; color: var(--tv-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 10px; }
        .ai-sec-title :global(svg) { color: #4C8DFF; margin-right: 6px; vertical-align: -2px; }
        .ai-sec-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
        .ai-sec-name { flex: 0 0 108px; font-size: 11px; font-weight: 600; color: var(--tv-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ai-sec-track { flex: 1; height: 6px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .ai-sec-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #0052FC, #7C3AED); }
        .ai-sec-fill.over { background: linear-gradient(90deg, #F04438, #FB7185); }
        .ai-sec-pct { flex: 0 0 44px; text-align: right; font-size: 11px; color: var(--tv-text-muted); font-variant-numeric: tabular-nums; }

        /* — Limites & breaches — */
        .ai-limit-status {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 800; letter-spacing: 0.06em; padding: 3px 10px; border-radius: 999px;
        }
        .ai-limit-status.breach { color: #F04438; background: rgba(240,68,56,0.12); border: 1px solid rgba(240,68,56,0.35); }
        .ai-limit-status.warning { color: #F0A03D; background: rgba(240,160,61,0.1); border: 1px solid rgba(240,160,61,0.32); }
        .ai-limit-status.ok { color: #18C27C; background: rgba(24,194,124,0.12); border: 1px solid rgba(24,194,124,0.35); }
        .ai-breach-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 9px 0; border-top: 1px solid var(--tv-divider);
        }
        .ai-breach-main { display: flex; flex-direction: column; gap: 1px; }
        .ai-breach-main b { font-size: 12.5px; color: #fff; }
        .ai-breach-main span { font-size: 10.5px; color: var(--tv-text-muted); }
        .ai-breach-right { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--tv-text-muted); font-variant-numeric: tabular-nums; }
        .ai-breach-right b { color: #fff; }
        .ai-breach-tag { font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 999px; }
        .ai-breach-tag.critical { color: #F04438; background: rgba(240,68,56,0.12); }
        .ai-breach-tag.warning { color: #F0A03D; background: rgba(240,160,61,0.1); }
        .ai-limits-mini { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .ai-limit-chip {
          font-size: 10.5px; font-weight: 600; padding: 3px 8px; border-radius: 999px;
          border: 1px solid var(--tv-border); color: var(--tv-text-secondary); font-variant-numeric: tabular-nums;
        }
        .ai-limit-chip.over { color: #F04438; border-color: rgba(240,68,56,0.4); }

        /* — Explicabilité des décisions — */
        .ai-dec-wrap { display: flex; flex-direction: column; gap: 8px; }
        .ai-dec-click { cursor: pointer; border-radius: 16px; }
        .ai-dec-click .ai-dec { transition: border-color .15s ease; }
        .ai-dec-click:hover .ai-dec, .ai-dec-click.open .ai-dec { border-color: rgba(0,82,252,0.45); }
        .ai-dec-expand {
          display: flex; align-items: center; gap: 6px; margin-top: 10px; padding-top: 10px;
          border-top: 1px solid var(--tv-divider);
          font-size: 11px; font-weight: 700; color: #4C8DFF; font-family: inherit;
          background: none; border-bottom: none; border-left: none; border-right: none;
          cursor: pointer; width: 100%;
        }
        .ai-dec-detail {
          border-radius: 16px; border: 1px solid rgba(0,82,252,0.28);
          background: rgba(0,82,252,0.05); padding: 14px;
        }
        .ai-dec-detail-narr { font-size: 11.5px; line-height: 1.6; color: var(--tv-text-secondary); margin-bottom: 10px; }
        .ai-contr-title { font-size: 10px; color: var(--tv-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin: 10px 0 6px; }
        .ai-contr-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
        .ai-contr-label { flex: 0 0 84px; font-size: 11px; font-weight: 700; color: #fff; }
        .ai-contr-track { flex: 1; height: 7px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; position: relative; }
        .ai-contr-bar { position: absolute; top: 0; height: 100%; border-radius: 99px; }
        .ai-contr-bar.pos { left: 50%; background: linear-gradient(90deg, #18C27C, #4ADE80); }
        .ai-contr-bar.neg { right: 50%; background: linear-gradient(90deg, #F04438, #FB7185); }
        .ai-contr-val { flex: 0 0 74px; text-align: right; font-size: 11px; font-variant-numeric: tabular-nums; }
        .ai-contr-val.pos { color: #18C27C; }
        .ai-contr-val.neg { color: #F04438; }
        .ai-raw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-top: 6px; }
        .ai-raw-item { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; }
        .ai-raw-item span { color: var(--tv-text-muted); }
        .ai-raw-item b { color: var(--tv-text-secondary); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
        .ai-dec-thr { display: flex; gap: 12px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--tv-divider); font-size: 10.5px; color: var(--tv-text-muted); }
        .ai-dec-thr b { color: var(--tv-text-secondary); }

        /* — Export / actions — */
        .ai-exp-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .ai-exp-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 11px; border: 1px solid var(--tv-border);
          background: var(--tv-bg-elevated); color: var(--tv-text); font-size: 11.5px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: border-color .15s ease;
        }
        .ai-exp-btn:hover { border-color: rgba(0,82,252,0.5); }
        .ai-exp-btn:active { transform: scale(0.98); }
        .ai-exp-btn :global(svg) { color: #4C8DFF; }
        .ai-exp-btn.done { border-color: rgba(24,194,124,0.4); }
        .ai-exp-btn.done :global(svg) { color: #18C27C; }
        .ai-admin-note {
          margin-top: 12px; padding: 9px 12px; border-radius: 12px;
          border: 1px solid rgba(240,160,61,0.25); background: rgba(240,160,61,0.06);
          font-size: 10.5px; color: var(--tv-text-secondary); line-height: 1.5;
        }

        /* — Attribution backtest — */
        .ai-attr-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
        .ai-attr-label { flex: 0 0 116px; font-size: 11px; font-weight: 600; color: var(--tv-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ai-attr-track { flex: 1; height: 6px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; position: relative; }
        .ai-attr-bar { position: absolute; top: 0; height: 100%; border-radius: 99px; }
        .ai-attr-bar.pos { left: 50%; background: linear-gradient(90deg, #0052FC, #7C3AED); }
        .ai-attr-bar.neg { right: 50%; background: linear-gradient(90deg, #F04438, #FB7185); }
        .ai-attr-val { flex: 0 0 60px; text-align: right; font-size: 11px; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  )
}
