import { useEffect, useState } from 'react'
import { BrainCircuit, Rocket, Repeat2, Eye } from 'lucide-react'
import { t } from '../../lib/i18n'
import { getCommunityAiWatch, getCommunityAiPulse } from '../../services/api'
import TriLoader from '../TriLoader'

const SENT_COLOR = { bullish: '#18C27C', bearish: '#E11D48', neutral: '#F59E0B' }

export default function AiPulseSection({ lang }) {
  const [watch, setWatch] = useState([])
  const [sel, setSel] = useState('')
  const [pulse, setPulse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getCommunityAiWatch()
      .then(r => {
        const w = r.data.watch || []
        setWatch(w)
        if (w.length > 0) setSel(w[0].symbol)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    if (!sel) return
    setLoading(true)
    setPulse(null)
    getCommunityAiPulse(sel)
      .then(r => setPulse(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sel])

  if (failed || watch.length === 0) return null

  const p = pulse?.pulse
  const momentum = p ? p.momentum : 0
  const barWidth = Math.max(4, Math.min(96, Math.abs(momentum)))

  return (
    <section className="ai-root">
      <div className="ai-head">
        <span className="ai-title"><BrainCircuit size={16} color="#fff" />{t(lang, 'cAiPulse')}</span>
        <span className="ai-sub">{t(lang, 'cAiPulseSub')}</span>
      </div>
      <div className="ai-chips">
        {watch.map(w => (
          <button key={w.symbol} className={`ai-chip ${sel === w.symbol ? 'on' : ''}`}
            onClick={() => setSel(w.symbol)}>
            {w.symbol}
            <span className={`ai-chip-dot ${w.momentum >= 0 ? 'up' : 'down'}`} />
          </button>
        ))}
      </div>
      {loading || !pulse ? (
        <div className="ai-loading"><TriLoader compact label={t(lang, 'cAiPulse')} /></div>
      ) : p && p.posts > 0 ? (
        <>
          <div className="ai-card">
            <div className="ai-card-top">
              <span className="ai-ticker">{pulse.symbol}</span>
              <b>{pulse.company_name}</b>
              <span className="ai-buzz">⚡ {t(lang, 'cBuzz')} {pulse.buzz}/10</span>
            </div>
            <div className="ai-meter">
              <span className={`ai-meter-val ${momentum >= 0 ? 'up' : 'down'}`}>
                {(momentum >= 0 ? '+' : '') + momentum}
              </span>
              <div className="ai-meter-track">
                <div className={`ai-meter-bar ${momentum >= 0 ? 'up' : 'down'}`}
                  style={{ width: `${barWidth}%`, right: momentum < 0 ? 'auto' : undefined, left: momentum >= 0 ? '50%' : undefined }} />
                <div className="ai-meter-zero" />
              </div>
            </div>
            <div className="ai-sent-stack">
              <div className="ai-sent-bar">
                <span style={{ width: `${p.bullish_pct}%`, background: SENT_COLOR.bullish }} />
                <span style={{ width: `${p.neutral_pct}%`, background: SENT_COLOR.neutral }} />
                <span style={{ width: `${p.bearish_pct}%`, background: SENT_COLOR.bearish }} />
              </div>
              <div className="ai-legend">
                <span><i style={{ background: SENT_COLOR.bullish }} />{p.bullish_pct}% {t(lang, 'cBullish')}</span>
                <span><i style={{ background: SENT_COLOR.neutral }} />{p.neutral_pct}% {t(lang, 'cNeutral')}</span>
                <span><i style={{ background: SENT_COLOR.bearish }} />{p.bearish_pct}% {t(lang, 'cBearish')}</span>
              </div>
            </div>
            <div className="ai-counts">
              <span>{p.posts} {t(lang, 'cPosts')}</span>
              <span><Rocket size={12} />{p.engagement}</span>
            </div>
          </div>
          {pulse.top_posts && pulse.top_posts.length > 0 && (
            <div className="ai-top">
              <div className="ai-top-head">{t(lang, 'cTopPosts')}</div>
              {pulse.top_posts.map(p => (
                <div key={p.id} className="ai-top-row">
                  <span className={`ai-sent-dot`} style={{ background: SENT_COLOR[p.sentiment] || '#888' }} />
                  <span className="ai-top-t">{p.title}</span>
                  <span className="ai-top-stats">
                    <span><Rocket size={11} />{p.rockets}</span>
                    <span><Repeat2 size={11} />{p.shares}</span>
                    <span><Eye size={11} />{p.views}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="ai-empty">{t(lang, 'cNoPulse')}</div>
      )}
      <style jsx>{`
        .ai-root {
          background: #0A0A0D; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px;
          padding: 14px; display: flex; flex-direction: column; gap: 10px; margin-top: 10px;
        }
        .ai-head { display: flex; align-items: center; gap: 8px; }
        .ai-title { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: #fff; }
        .ai-sub { font-size: 11.5px; color: rgba(255,255,255,0.45); font-weight: 700; }
        .ai-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .ai-chip {
          display: inline-flex; align-items: center; gap: 5px; font-family: 'Inter', -apple-system, sans-serif;
          font-size: 11px; font-weight: 800; background: #ffffff0a; border: 1px solid #ffffff14;
          color: rgba(255,255,255,0.6); border-radius: 999px; padding: 4px 10px; cursor: pointer;
        }
        .ai-chip.on { background: rgba(255,255,255,0.12); border-color: #fff; color: #fff; }
        .ai-chip-dot { width: 6px; height: 6px; border-radius: 50%; }
        .ai-chip-dot.up { background: #18C27C; }
        .ai-chip-dot.down { background: #E11D48; }
        .ai-loading, .ai-empty { font-size: 12.5px; color: rgba(255,255,255,0.45); text-align: center; padding: 8px; }
        .ai-card { background: #ffffff08; border: 1px solid #ffffff12; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 9px; }
        .ai-card-top { display: flex; align-items: center; gap: 8px; }
        .ai-ticker {
          font-family: 'Inter', -apple-system, sans-serif; font-size: 11.5px; font-weight: 800;
          background: rgba(255,255,255,0.10); color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: 6px; padding: 1px 7px;
        }
        .ai-buzz { margin-left: auto; font-size: 11px; font-weight: 800; color: #F59E0B; }
        .ai-meter { display: flex; align-items: center; gap: 10px; }
        .ai-meter-val { font-family: 'Inter', -apple-system, sans-serif; font-size: 20px; font-weight: 800; min-width: 64px; }
        .ai-meter-val.up { color: #18C27C; }
        .ai-meter-val.down { color: #ff6b8f; }
        .ai-meter-track {
          position: relative; flex: 1; height: 10px; border-radius: 999px;
          background: linear-gradient(90deg, #18C27C33, #ffffff12 45%, #ffffff12 55%, #E11D4833);
        }
        .ai-meter-bar { position: absolute; top: 0; bottom: 0; border-radius: 999px; }
        .ai-meter-bar.up { background: #18C27C; }
        .ai-meter-bar.down { background: #E11D48; }
        .ai-meter-zero { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: #ffffff55; }
        .ai-sent-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: #ffffff0a; }
        .ai-legend { display: flex; gap: 12px; font-size: 11.5px; color: rgba(255,255,255,0.6); }
        .ai-legend span { display: inline-flex; align-items: center; gap: 4px; }
        .ai-legend i { width: 8px; height: 8px; border-radius: 3px; display: inline-block; }
        .ai-counts { display: flex; gap: 14px; font-size: 12px; color: rgba(255,255,255,0.55); }
        .ai-counts span { display: inline-flex; align-items: center; gap: 4px; }
        .ai-top { display: flex; flex-direction: column; }
        .ai-top-head { font-size: 11.5px; font-weight: 800; color: rgba(255,255,255,0.6); padding: 4px 0; }
        .ai-top-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid #ffffff0c; font-size: 12.5px; }
        .ai-sent-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
        .ai-top-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,0.85); }
        .ai-top-stats { display: flex; gap: 9px; color: rgba(255,255,255,0.5); flex: none; font-size: 11.5px; }
        .ai-top-stats span { display: inline-flex; align-items: center; gap: 3px; }
      `}</style>
    </section>
  )
}