import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import ChallengesSection from '../components/ChallengesSection'
import { Search, MessageCircle, MoreHorizontal, BadgeCheck, X, Send, ChevronLeft, Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { t, detectLang, timeAgo } from '../lib/i18n'
import { getCommunityPosts, getCommunityUsers, getCommunityUser, followCommunityUser, rocketCommunityPost, getCommunityComments, addCommunityComment, createCommunityPost, getCompanies } from '../services/api'
import { useAuth } from '../lib/auth'

const TABS = ['forYou', 'editorsPick', 'following', 'challenges']

function fmtPriceValue(n, lang) {
  if (n == null) return '—'
  const v = Number(n)
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + ' k'
  return v.toFixed(0)
}

function ChartImage({ symbol, color, bearish, series, price, change_percent }) {
  const data = Array.isArray(series) && series.length > 1 ? series : null
  const points = data
  let poly = '40,90 90,105 140,85 190,130 240,160 290,185 360,235'
  if (points) {
    const w = 400, h = 300
    const min = Math.min(...points), max = Math.max(...points)
    const span = max - min || 1
    const step = (w - 80) / (points.length - 1)
    poly = points.map((v, i) => {
      const x = 40 + i * step
      const y = h - 35 - ((v - min) / span) * (h - 60)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect width="400" height="300" fill="#101014" />
      {[60, 120, 180, 240].map(y => (
        <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#1f1f26" strokeWidth="1" />
      ))}
      {[80, 160, 240, 320].map(x => (
        <line key={x} x1={x} y1="0" x2={x} y2="300" stroke="#1f1f26" strokeWidth="1" />
      ))}
      {bearish && points && (
        <>
          <rect x="30" y="120" width="120" height="120" fill="rgba(255,77,79,0.12)" />
          <rect x="160" y="160" width="120" height="100" fill="rgba(255,77,79,0.10)" />
          <rect x="290" y="200" width="80" height="70" fill="rgba(255,77,79,0.12)" />
        </>
      )}
      {points && (
        <polygon
          points={`40,288 ${points.map((v, i) => {
            const w = 400, h = 300
            const min = Math.min(...points), max = Math.max(...points)
            const span = max - min || 1
            const step = (w - 80) / (points.length - 1)
            const x = 40 + i * step
            const y = h - 35 - ((v - min) / span) * (h - 60)
            return `${x.toFixed(1)},${y.toFixed(1)}`
          }).join(' ')} 360,288`}
          fill={bearish ? 'rgba(255,77,79,0.08)' : 'rgba(0,200,83,0.08)'}
        />
      )}
      <polyline
        points={poly}
        fill="none"
        stroke={bearish ? '#FF4D4F' : '#00C853'}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <g transform="translate(12,12)">
        <circle cx="14" cy="14" r="13" fill="#17171c" stroke="#2a2a33" strokeWidth="1" />
        <text x="14" y="19" textAnchor="middle" fontSize="13" fontWeight="700" fill={color} fontFamily="Inter, sans-serif">
          {symbol.slice(0, 2)}
        </text>
        <rect x="34" y="4" rx="6" width="86" height="20" fill="#17171c" stroke="#2a2a33" strokeWidth="1" />
        <text x="77" y="18" textAnchor="middle" fontSize="10" fontWeight="600" fill={bearish ? '#FF4D4F' : '#00C853'} fontFamily="Inter, sans-serif">
          {bearish ? '▼ BAISSIER' : '▲ HAUSSIER'}
        </text>
      </g>
      {price != null && (
        <g transform="translate(12,278)">
          <text x="0" y="0" fontSize="12" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">
            {fmtPriceValue(price, 'fr')} FCFA
          </text>
          <text x="388" y="0" textAnchor="end" fontSize="12" fontWeight="700" fill={bearish ? '#FF4D4F' : '#00C853'} fontFamily="Inter, sans-serif">
            {(change_percent != null ? change_percent.toFixed(2) : '0.00')}%
          </text>
        </g>
      )}
    </svg>
  )
}

function PostCard({ post, lang, onOpen, onAuthor }) {
  const [rockets, setRockets] = useState(post.rockets || 0)
  const [rocketed, setRocketed] = useState(!!post.rocketed)
  const [busy, setBusy] = useState(false)

  const toggleRocket = async (e) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await rocketCommunityPost(post.id)
      const next = !rocketed
      setRocketed(next)
      setRockets(r => Math.max(0, r + (next ? 1 : -1)))
    } catch {} finally { setBusy(false) }
  }

  const a = post.author || {}
  return (
    <div className="post-card" onClick={() => onOpen(post)}>
      <div className="post-head" onClick={(e) => { e.stopPropagation(); onAuthor(a.id) }}>
        <img src={a.avatar} alt={a.handle} className="post-avatar" />
        <div className="post-user-col">
          <div className="post-name-row">
            <span className="post-name">{a.display_name || a.handle}</span>
            {a.verified && <BadgeCheck size={13} color="#1DA1F2" />}
          </div>
          <span className="post-date">@{a.handle} · {timeAgo(lang, post.created_at)}</span>
        </div>
        {post.is_editor_pick && (
          <span className="editor-badge">{t(lang, 'cEditorBadge')}</span>
        )}
      </div>

      <div className="post-chart-wrap">
        <ChartImage
          symbol={post.symbol}
          color={post.color}
          bearish={post.sentiment === 'bearish'}
          series={post.series}
          price={post.price}
          change_percent={post.change_percent}
        />
      </div>

      <div className="post-title">{post.title}</div>
      {post.content && (
        <div className="post-content">{post.content}</div>
      )}

      <div className="post-actions">
        <button className={`rocket-btn ${rocketed ? 'rocked' : ''}`} onClick={toggleRocket}>
          <span className="rocket-emoji">🚀</span>
          <span className="rocket-count">{rockets}</span>
        </button>
        <button className="comment-btn" onClick={(e) => { e.stopPropagation(); onOpen(post) }}>
          <MessageCircle size={17} color="#fff" />
          <span>{post.comments || 0}</span>
        </button>
        <button className="more-btn" aria-label="plus" onClick={(e) => { e.stopPropagation(); onOpen(post) }}>
          <MoreHorizontal size={18} color="#8f8f8f" />
        </button>
      </div>

      <style jsx>{`
        .post-card {
          background: #1E1E1E; border-radius: 14px; padding: 12px;
          cursor: pointer; transition: transform 0.12s ease;
        }
        .post-card:active { transform: scale(0.985); }
        .post-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer; }
        .post-avatar {
          width: 34px; height: 34px; border-radius: 50%; object-fit: cover;
        }
        .post-user-col { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
        .post-name-row { display: flex; align-items: center; gap: 4px; }
        .post-name { font-size: 14px; font-weight: 700; }
        .post-date { font-size: 11px; color: #8f8f8f; }
        .editor-badge {
          font-size: 9px; font-weight: 700; color: #D4A843;
          background: rgba(212,168,67,0.14); padding: 2px 8px; border-radius: 9px;
          white-space: nowrap;
        }
        .post-chart-wrap {
          border-radius: 10px; overflow: hidden; height: 150px;
          background: #101014;
        }
        .post-title { font-size: 15px; font-weight: 800; margin-top: 10px; line-height: 1.35; }
        .post-content {
          font-size: 12.5px; color: #c9c9c9; line-height: 1.5;
          margin-top: 5px; display: -webkit-box;
          -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .post-actions {
          display: flex; align-items: center; gap: 10px;
          margin-top: 10px;
        }
        .rocket-btn {
          display: flex; align-items: center; gap: 6px;
          height: 30px; padding: 0 12px;
          background: #2A2A2A; border: 1px solid #3a3a3a; border-radius: 15px;
          cursor: pointer; font-family: inherit;
        }
        .rocket-btn.rocked { background: rgba(0,200,83,0.12); border-color: rgba(0,200,83,0.4); }
        .rocket-emoji { font-size: 13px; line-height: 1; }
        .rocket-count { font-size: 13px; font-weight: 600; color: #fff; }
        .comment-btn {
          display: flex; align-items: center; gap: 6px;
          background: none; border: none; color: #fff;
          font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
          padding: 5px 4px;
        }
        .more-btn {
          margin-left: auto; background: none; border: none;
          cursor: pointer; padding: 5px 4px;
        }
      `}</style>
    </div>
  )
}

function PostDetailSheet({ post, lang, onClose, onAuthor }) {
  const [rockets, setRockets] = useState(post.rockets || 0)
  const [rocketed, setRocketed] = useState(!!post.rocketed)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [notAuthed, setNotAuthed] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  useEffect(() => {
    getCommunityComments(post.id)
      .then(r => setComments(r.data.comments || []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false))
  }, [post.id])

  const toggleRocket = async () => {
    if (busy) return
    setBusy(true)
    try {
      await rocketCommunityPost(post.id)
      const next = !rocketed
      setRocketed(next)
      setRockets(r => Math.max(0, r + (next ? 1 : -1)))
    } catch {} finally { setBusy(false) }
  }

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const r = await addCommunityComment(post.id, text.trim())
      setComments(c => [...c, r.data])
      setText('')
    } catch (err) {
      if (err?.response?.status === 401) setNotAuthed(true)
    } finally { setSending(false) }
  }

  const a = post.author || {}
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="back-btn" onClick={onClose}><ChevronLeft size={20} /></button>
          <span className="sheet-title">{t(lang, 'cPost')}</span>
          <button className="sheet-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sheet-body">
          <div className="detail-head" onClick={() => onAuthor(a.id)}>
            <img src={a.avatar} alt={a.handle} className="post-avatar" />
            <div className="post-user-col">
              <div className="post-name-row">
                <span className="post-name">{a.display_name || a.handle}</span>
                {a.verified && <BadgeCheck size={14} color="#1DA1F2" />}
              </div>
              <span className="post-date">@{a.handle} · {timeAgo(lang, post.created_at)}</span>
            </div>
            {post.is_editor_pick && (
              <span className="editor-badge">{t(lang, 'cEditorBadge')}</span>
            )}
          </div>

          <div className="detail-chart-wrap">
            <ChartImage
              symbol={post.symbol}
              color={post.color}
              bearish={post.sentiment === 'bearish'}
              series={post.series}
              price={post.price}
              change_percent={post.change_percent}
            />
          </div>

          <div className="detail-title">{post.title}</div>
          {post.content && <div className="detail-content">{post.content}</div>}

          <div className="detail-actions">
            <button className={`rocket-btn ${rocketed ? 'rocked' : ''}`} onClick={toggleRocket}>
              <span className="rocket-emoji">🚀</span>
              <span className="rocket-count">{rockets}</span>
            </button>
            <button className="comment-btn">
              <MessageCircle size={17} color="#fff" />
              <span>{comments.length}</span>
            </button>
          </div>

          <div className="cmts-label">{t(lang, 'cComments')} <span className="cmt-count">{comments.length}</span></div>
          {loading && <div className="sheet-empty"><Loader2 size={18} className="spin" /> {t(lang, 'loading')}</div>}
          {!loading && comments.length === 0 && <div className="sheet-empty">{t(lang, 'cNoComments')}</div>}
          {comments.map(c => (
            <div key={c.id} className="comment">
              <img src={c.author.avatar} alt={c.author.handle} className="comment-avatar" />
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-name">{c.author.display_name || c.author.handle}</span>
                  {c.author.verified && <BadgeCheck size={13} color="#1DA1F2" />}
                  <span className="comment-time">{timeAgo(lang, c.created_at)}</span>
                </div>
                <div className="comment-text">{c.content}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="sheet-input-row">
          <input
            className="sheet-input"
            placeholder={t(lang, 'cWriteComment')}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send() }}
          />
          <button className="send-btn" onClick={send} disabled={!text.trim() || sending}>
            <Send size={18} />
          </button>
        </div>
        {notAuthed && (
          <div className="auth-prompt">
            <span>{t(lang, 'cLoginRequired')}</span>
            <button onClick={() => router.push('/login?next=/community')}>{t(lang, 'cLoginCta')}</button>
          </div>
        )}
        <style jsx>{`
          .sheet-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            z-index: 90; display: flex; align-items: flex-end; justify-content: center;
          }
          .sheet {
            width: 100%; max-width: 480px; max-height: 90vh;
            background: #141414; border-radius: 20px 20px 0 0;
            display: flex; flex-direction: column; animation: sheetUp 0.22s ease;
          }
          @keyframes sheetUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .sheet-head {
            display: flex; align-items: center; gap: 8px;
            padding: 14px 16px 0;
          }
          .back-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 4px; }
          .sheet-title { flex: 1; font-size: 16px; font-weight: 700; }
          .sheet-close {
            background: #262626; border: none; border-radius: 50%;
            width: 32px; height: 32px; color: #fff;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
          }
          .sheet-body { overflow-y: auto; padding: 12px 16px; flex: 1; }
          .sheet-body::-webkit-scrollbar { display: none; }
          .detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; cursor: pointer; }
          .post-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
          .post-user-col { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
          .post-name-row { display: flex; align-items: center; gap: 4px; }
          .post-name { font-size: 15px; font-weight: 700; }
          .post-date { font-size: 11px; color: #8f8f8f; }
          .editor-badge {
            font-size: 9px; font-weight: 700; color: #D4A843;
            background: rgba(212,168,67,0.14); padding: 2px 8px; border-radius: 9px;
            white-space: nowrap;
          }
          .detail-chart-wrap {
            border-radius: 12px; overflow: hidden; height: 300px;
            background: #101014;
          }
          .detail-title { font-size: 19px; font-weight: 800; margin-top: 14px; line-height: 1.35; }
          .detail-content {
            font-size: 14px; color: #c9c9c9; line-height: 1.6;
            margin-top: 8px; white-space: pre-wrap; word-break: break-word;
          }
          .detail-actions {
            display: flex; align-items: center; gap: 12px;
            margin: 16px 0 4px;
          }
          .rocket-btn {
            display: flex; align-items: center; gap: 7px;
            height: 34px; padding: 0 16px;
            background: #2A2A2A; border: 1px solid #3a3a3a; border-radius: 17px;
            cursor: pointer; font-family: inherit;
          }
          .rocket-btn.rocked { background: rgba(0,200,83,0.12); border-color: rgba(0,200,83,0.4); }
          .rocket-emoji { font-size: 15px; line-height: 1; }
          .rocket-count { font-size: 14px; font-weight: 600; color: #fff; }
          .comment-btn {
            display: flex; align-items: center; gap: 7px;
            background: none; border: none; color: #fff;
            font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
            padding: 6px 4px;
          }
          .cmts-label {
            font-size: 13px; font-weight: 700; color: #a3a3a3;
            margin: 10px 0 2px; text-transform: uppercase; letter-spacing: 0.4px;
          }
          .cmt-count { color: #666; font-size: 12px; }
          .sheet-empty {
            display: flex; align-items: center; gap: 8px; justify-content: center;
            color: #666; font-size: 13px; padding: 24px 0;
          }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .comment { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #1d1d1d; }
          .comment:last-child { border-bottom: none; }
          .comment-avatar { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; }
          .comment-body { flex: 1; min-width: 0; }
          .comment-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #8f8f8f; }
          .comment-name { font-weight: 700; color: #fff; }
          .comment-time { flex: 1; text-align: right; }
          .comment-text { font-size: 13.5px; color: #d6d6d6; line-height: 1.5; margin-top: 3px; }
          .sheet-input-row {
            display: flex; align-items: center; gap: 10px;
            padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
            border-top: 1px solid #1d1d1d;
          }
          .sheet-input {
            flex: 1; background: #1E1E1E; border: 1px solid #2a2a2a; border-radius: 20px;
            height: 40px; padding: 0 16px; color: #fff; font-size: 14px; font-family: inherit;
            outline: none;
          }
          .sheet-input::placeholder { color: #5a5a5a; }
          .send-btn {
            width: 40px; height: 40px; border-radius: 50%; border: none;
            background: #00C853; color: #00130a; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
          }
          .send-btn:disabled { background: #2a2a2a; color: #666; cursor: default; }
          .auth-prompt {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 10px 16px; background: #1d1d1d; font-size: 12px; color: #a3a3a3;
          }
          .auth-prompt button {
            background: #00C853; border: none; color: #00130a; border-radius: 10px;
            padding: 6px 12px; font-weight: 700; font-size: 12px; cursor: pointer; font-family: inherit;
          }
        `}</style>
      </div>
    </div>
  )
}

function ComposerSheet({ lang, onClose, onCreated }) {
  const router = useRouter()
  const [symbols, setSymbols] = useState([])
  const [symbol, setSymbol] = useState('')
  const [sentiment, setSentiment] = useState('bullish')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCompanies({ limit: 47 })
      .then(r => setSymbols(r.data.companies || []))
      .catch(() => {})
  }, [])

  const publish = async () => {
    if (!symbol || title.trim().length < 5 || sending) return
    setSending(true)
    setError('')
    try {
      const r = await createCommunityPost({ symbol, sentiment, title: title.trim(), content: content.trim() })
      onCreated(r.data)
      onClose()
    } catch (err) {
      if (err?.response?.status === 401) router.push('/login?next=/community')
      else setError(t(lang, 'loadError'))
    } finally { setSending(false) }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-title">{t(lang, 'cNewPost')}</span>
          <button className="sheet-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sheet-body">
          <div className="field-label">{t(lang, 'cPickSymbol')}</div>
          <div className="symbol-grid">
            {symbols.slice(0, 24).map(s => (
              <button
                key={s.symbol}
                className={`symbol-chip ${symbol === s.symbol ? 'active' : ''}`}
                onClick={() => setSymbol(s.symbol)}
              >
                {s.symbol}
              </button>
            ))}
          </div>

          <div className="field-label">{t(lang, 'cSentiment')}</div>
          <div className="sentiment-row">
            <button className={`sent-btn bull ${sentiment === 'bullish' ? 'active' : ''}`} onClick={() => setSentiment('bullish')}>
              <TrendingUp size={16} /> {t(lang, 'cBullish')}
            </button>
            <button className={`sent-btn bear ${sentiment === 'bearish' ? 'active' : ''}`} onClick={() => setSentiment('bearish')}>
              <TrendingDown size={16} /> {t(lang, 'cBearish')}
            </button>
          </div>

          <input
            className="title-input"
            placeholder={t(lang, 'cTitlePlaceholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={240}
          />
          <textarea
            className="content-input"
            placeholder={t(lang, 'cContentPlaceholder')}
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={5}
            maxLength={3000}
          />
          {error && <div className="composer-error">{error}</div>}
        </div>
        <div className="sheet-footer">
          <button
            className="publish-btn"
            disabled={!symbol || title.trim().length < 5 || sending}
            onClick={publish}
          >
            {sending ? t(lang, 'loading') : t(lang, 'cPublish')}
          </button>
        </div>
        <style jsx>{`
          .sheet-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            z-index: 90; display: flex; align-items: flex-end; justify-content: center;
          }
          .sheet {
            width: 100%; max-width: 480px; max-height: 88vh;
            background: #141414; border-radius: 20px 20px 0 0;
            display: flex; flex-direction: column; animation: sheetUp 0.22s ease;
          }
          @keyframes sheetUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .sheet-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 16px 0;
          }
          .sheet-title { font-size: 16px; font-weight: 700; }
          .sheet-close {
            background: #262626; border: none; border-radius: 50%;
            width: 32px; height: 32px; color: #fff;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
          }
          .sheet-body { overflow-y: auto; padding: 14px 16px; }
          .sheet-body::-webkit-scrollbar { display: none; }
          .field-label { font-size: 12px; color: #8f8f8f; margin: 10px 0 8px; font-weight: 600; }
          .symbol-grid { display: flex; flex-wrap: wrap; gap: 8px; }
          .symbol-chip {
            padding: 7px 12px; border-radius: 14px; border: 1px solid #2a2a2a;
            background: #1E1E1E; color: #b0b0b0; font-size: 12px; font-weight: 600;
            cursor: pointer; font-family: 'JetBrains Mono', monospace; font-family: inherit;
          }
          .symbol-chip.active { background: #00C853; border-color: #00C853; color: #00130a; font-weight: 700; }
          .sentiment-row { display: flex; gap: 10px; }
          .sent-btn {
            flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
            height: 40px; border-radius: 12px; border: 1px solid #2a2a2a;
            background: #1E1E1E; color: #8f8f8f; font-size: 13px; font-weight: 600;
            cursor: pointer; font-family: inherit;
          }
          .sent-btn.bull.active { background: rgba(0,200,83,0.12); border-color: #00C853; color: #00C853; }
          .sent-btn.bear.active { background: rgba(255,77,79,0.12); border-color: #FF4D4F; color: #FF4D4F; }
          .title-input {
            width: 100%; margin-top: 14px; height: 44px;
            background: #1E1E1E; border: 1px solid #2a2a2a; border-radius: 12px;
            padding: 0 14px; color: #fff; font-size: 14px; font-family: inherit; outline: none;
          }
          .title-input::placeholder { color: #5a5a5a; }
          .content-input {
            width: 100%; margin-top: 10px; resize: none;
            background: #1E1E1E; border: 1px solid #2a2a2a; border-radius: 12px;
            padding: 12px 14px; color: #fff; font-size: 14px; font-family: inherit; outline: none;
            line-height: 1.5;
          }
          .content-input::placeholder { color: #5a5a5a; }
          .composer-error { color: #FF4D4F; font-size: 12px; margin-top: 8px; }
          .sheet-footer {
            padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
            border-top: 1px solid #1d1d1d;
          }
          .publish-btn {
            width: 100%; height: 46px; border: none; border-radius: 14px;
            background: #00C853; color: #00130a; font-size: 15px; font-weight: 800;
            cursor: pointer; font-family: inherit;
          }
          .publish-btn:disabled { background: #2a2a2a; color: #666; cursor: default; }
        `}</style>
      </div>
    </div>
  )
}

function ProfileSheet({ userId, lang, onClose, onFollowed }) {
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notAuthed, setNotAuthed] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    getCommunityUser(userId)
      .then(r => { setProfile(r.data.user); setPosts(r.data.posts || []) })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [userId])

  const toggleFollow = async () => {
    if (!profile) return
    try {
      const r = await followCommunityUser(profile.id)
      setProfile(p => ({ ...p, is_following: r.data.following }))
      if (onFollowed) onFollowed()
    } catch (err) {
      if (err?.response?.status === 401) setNotAuthed(true)
    }
  }

  const openComments = (post) => {
    onClose()
    onFollowed && onFollowed(post)
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="back-btn" onClick={onClose}><ChevronLeft size={20} /></button>
          <span className="sheet-title">{t(lang, 'cProfile')}</span>
          <button className="sheet-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sheet-body">
          {loading && <div className="sheet-empty"><Loader2 size={18} className="spin" /> {t(lang, 'loading')}</div>}
          {!loading && !profile && <div className="sheet-empty">{t(lang, 'noResults')}</div>}
          {profile && (
            <>
              <div className="profile-head">
                <img src={profile.avatar} alt={profile.handle} className="profile-avatar" />
                <div className="profile-name-row">
                  <span className="profile-name">{profile.display_name || profile.handle}</span>
                  {profile.verified && <BadgeCheck size={17} color="#1DA1F2" />}
                </div>
                <span className="profile-handle">@{profile.handle}</span>
                {profile.bio && <p className="profile-bio">{profile.bio}</p>}
                <div className="profile-stats">
                  <div className="pstat"><span className="pstat-n">{profile.posts_count}</span><span className="pstat-l">{t(lang, 'cPosts')}</span></div>
                  <div className="pstat"><span className="pstat-n">{profile.followers_count}</span><span className="pstat-l">{t(lang, 'cFollowers')}</span></div>
                  <div className="pstat"><span className="pstat-n">{profile.following_count}</span><span className="pstat-l">{t(lang, 'cFollowingCount')}</span></div>
                </div>
                <button
                  className={`follow-btn ${profile.is_following ? 'active' : ''}`}
                  onClick={toggleFollow}
                >
                  {profile.is_following ? t(lang, 'cFollowing') : t(lang, 'cFollow')}
                </button>
                {notAuthed && (
                  <button className="login-prompt" onClick={() => router.push('/login?next=/community')}>
                    {t(lang, 'cLoginCta')}
                  </button>
                )}
              </div>
              <div className="profile-posts-label">{t(lang, 'cPosts')}</div>
              {posts.length === 0 && <div className="sheet-empty">{t(lang, 'cEmpty')}</div>}
              {posts.map(p => (
                <div key={p.id} className="mini-post" onClick={() => openComments(p)}>
                  <span className={`mini-badge ${p.sentiment === 'bearish' ? 'bear' : 'bull'}`}>
                    {p.sentiment === 'bearish' ? '▼' : '▲'}
                  </span>
                  <div className="mini-text">
                    <div className="mini-title">{p.title}</div>
                    <div className="mini-meta">{p.symbol} · 🚀 {p.rockets} · 💬 {p.comments}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <style jsx>{`
          .sheet-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            z-index: 90; display: flex; align-items: flex-end; justify-content: center;
          }
          .sheet {
            width: 100%; max-width: 480px; max-height: 88vh;
            background: #141414; border-radius: 20px 20px 0 0;
            display: flex; flex-direction: column; animation: sheetUp 0.22s ease;
          }
          @keyframes sheetUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .sheet-head {
            display: flex; align-items: center; gap: 8px;
            padding: 16px 16px 0;
          }
          .back-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 4px; }
          .sheet-title { flex: 1; font-size: 16px; font-weight: 700; }
          .sheet-close {
            background: #262626; border: none; border-radius: 50%;
            width: 32px; height: 32px; color: #fff;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
          }
          .sheet-body { overflow-y: auto; padding: 14px 16px 24px; }
          .sheet-body::-webkit-scrollbar { display: none; }
          .sheet-empty {
            display: flex; align-items: center; gap: 8px; justify-content: center;
            color: #666; font-size: 13px; padding: 24px 0;
          }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .profile-head { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 8px 0 16px; }
          .profile-avatar { width: 84px; height: 84px; border-radius: 50%; margin-bottom: 10px; }
          .profile-name-row { display: flex; align-items: center; gap: 6px; }
          .profile-name { font-size: 20px; font-weight: 800; }
          .profile-handle { font-size: 13px; color: #8f8f8f; margin-top: 2px; }
          .profile-bio { font-size: 13.5px; color: #d6d6d6; line-height: 1.5; margin: 10px 0 0; max-width: 320px; }
          .profile-stats { display: flex; gap: 28px; margin: 16px 0; }
          .pstat { display: flex; flex-direction: column; gap: 2px; }
          .pstat-n { font-size: 18px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
          .pstat-l { font-size: 11px; color: #8f8f8f; }
          .follow-btn {
            height: 38px; padding: 0 28px; border-radius: 19px; border: none;
            background: #00C853; color: #00130a; font-weight: 800; font-size: 14px;
            cursor: pointer; font-family: inherit;
          }
          .follow-btn.active { background: #2a2a2a; color: #fff; border: 1px solid #3a3a3a; }
          .login-prompt {
            margin-top: 10px; background: none; border: none;
            color: #8b5cf6; font-size: 13px; cursor: pointer; font-family: inherit;
          }
          .profile-posts-label {
            font-size: 12px; font-weight: 700; color: #a3a3a3;
            margin: 4px 0 8px; text-transform: uppercase; letter-spacing: 0.4px;
          }
          .mini-post {
            display: flex; gap: 10px; align-items: flex-start;
            padding: 12px 0; border-bottom: 1px solid #1d1d1d; cursor: pointer;
          }
          .mini-badge {
            width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 800;
          }
          .mini-badge.bull { background: rgba(0,200,83,0.12); color: #00C853; }
          .mini-badge.bear { background: rgba(255,77,79,0.12); color: #FF4D4F; }
          .mini-text { flex: 1; min-width: 0; }
          .mini-title { font-size: 13.5px; font-weight: 600; line-height: 1.35; }
          .mini-meta { font-size: 11.5px; color: #8f8f8f; margin-top: 3px; font-family: 'JetBrains Mono', monospace; }
        `}</style>
      </div>
    </div>
  )
}

export default function Community() {
  const router = useRouter()
  const { user } = useAuth()
  const [lang, setLang] = useState('fr')
  const [tab, setTab] = useState('forYou')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailPost, setDetailPost] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [profileId, setProfileId] = useState(null)
  const [followingEmpty, setFollowingEmpty] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLang(detectLang())
    return () => { mounted.current = false }
  }, [])

  const loadFeed = (activeTab) => {
    if (activeTab === 'challenges') {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    getCommunityPosts(activeTab, 25)
      .then(r => {
        if (!mounted.current) return
        setPosts(r.data.posts || [])
        setFollowingEmpty((r.data.posts || []).length === 0)
      })
      .catch(() => { if (mounted.current) setError(t('loadError')) })
      .finally(() => { if (mounted.current) setLoading(false) })
  }

  useEffect(() => { loadFeed(tab) }, [tab])

  const switchTab = (id) => { setTab(id) }

  const openComposer = () => {
    setComposerOpen(true)
  }

  const refresh = () => loadFeed(tab)

  return (
    <div className="mobile-root">
      <div className="safe-area">
        <header className="co-header">
          <div className="co-title-col">
            <h1 className="co-title">{t(lang, 'community')}</h1>
            <span className="co-sub">{t(lang, 'cFeed')}</span>
          </div>
          <div className="co-actions">
            <button className="icon-btn" onClick={refresh} aria-label={t(lang, 'refresh')}>
              <Search size={27} />
            </button>
            <button className="write-btn" onClick={openComposer}>
              <span className="write-plus">+</span>
            </button>
          </div>
        </header>

        <div className="tabs-row">
          {TABS.map(id => (
            <button
              key={id}
              className={`feed-tab ${tab === id ? 'active' : ''}`}
              onClick={() => switchTab(id)}
            >
              {t(lang, id)}
            </button>
          ))}
        </div>

        {error && (
          <div className="error-bar">
            <span>{error}</span>
            <button onClick={refresh}>{t(lang, 'tryAgain')}</button>
          </div>
        )}

        {tab === 'challenges' ? (
          <ChallengesSection lang={lang} user={user} />
        ) : loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : posts.length === 0 ? (
          <div className="empty-box">
            <span>{followingEmpty && tab === 'following' ? t(lang, 'cEmpty') : t(lang, 'cEmpty')}</span>
            {tab === 'following' && <span className="empty-sub">{t(lang, 'cLoginRequired')}</span>}
          </div>
        ) : (
          <div className="feed">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                lang={lang}
                onOpen={setDetailPost}
                onAuthor={setProfileId}
              />
            ))}
          </div>
        )}
      </div>

      {detailPost && (
        <PostDetailSheet
          post={detailPost}
          lang={lang}
          onClose={() => setDetailPost(null)}
          onAuthor={setProfileId}
        />
      )}
      {composerOpen && (
        <ComposerSheet lang={lang} onClose={() => setComposerOpen(false)} onCreated={refresh} />
      )}
      {profileId && (
        <ProfileSheet
          userId={profileId}
          lang={lang}
          onClose={() => setProfileId(null)}
          onFollowed={setDetailPost}
        />
      )}

      <BottomNav active="community" />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .safe-area { flex: 1; overflow-y: auto; padding: 0 22px 8px; }
        .safe-area::-webkit-scrollbar { display: none; }
        .co-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 0 14px;
        }
        .co-title-col { display: flex; flex-direction: column; gap: 2px; }
        .co-title {
          font-size: 34px; font-weight: 800; letter-spacing: -0.5px; margin: 0;
          line-height: 1;
        }
        .co-sub { font-size: 12px; color: #8f8f8f; }
        .co-actions { display: flex; align-items: center; gap: 10px; }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; padding: 0;
        }
        .write-btn {
          width: 40px; height: 40px; border-radius: 50%; border: none;
          background: #00C853; color: #00130a; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .write-plus { font-size: 24px; font-weight: 700; line-height: 1; }
        .tabs-row {
          display: flex; align-items: center; gap: 20px;
          padding: 2px 0 16px; overflow-x: auto; scrollbar-width: none;
        }
        .tabs-row::-webkit-scrollbar { display: none; }
        .feed-tab {
          flex-shrink: 0; height: 42px; min-width: 120px;
          padding: 0 20px; border: none; border-radius: 21px;
          background: transparent; color: #8f8f8f;
          font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;
        }
        .feed-tab.active {
          background: #fff; color: #000; font-weight: 700;
        }
        .feed { display: flex; flex-direction: column; gap: 18px; padding-bottom: 12px; }
        .loading-row { display: flex; justify-content: center; padding: 40px; }
        .spinner {
          width: 26px; height: 26px;
          border: 3px solid #262626; border-top-color: #00C853;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-box {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 44px 20px; text-align: center;
          color: #a3a3a3; font-size: 14px;
        }
        .empty-sub { font-size: 12px; color: #666; }
        .error-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.3);
          border-radius: 12px; padding: 10px 12px; margin-bottom: 14px;
          font-size: 12px; color: #ff9d9d;
        }
        .error-bar button {
          background: rgba(255,77,79,0.2); border: none; border-radius: 8px;
          color: #ff9d9d; font-size: 11px; padding: 5px 10px; cursor: pointer; font-family: inherit;
        }
      `}</style>
    </div>
  )
}
