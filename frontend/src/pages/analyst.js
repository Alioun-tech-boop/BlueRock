import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'
import { analystChat } from '../services/api'
import { ArrowLeft, Send, Sparkles, Trash2, RefreshCw, Coins } from 'lucide-react'
import { t } from '../lib/i18n'
import { getMarketStatus } from '../lib/market'
import { useAuth } from '../lib/auth'

const CHAT_KEY = 'bluerock_chat_v1'

function renderInline(text) {
  const out = []
  const re = /(\*\*[^*\n]+\*\*|`[^`]+`|\*[^*\n]+\*)/g
  let last = 0, key = 0, m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={key++}>{tok.slice(1, -1)}</code>)
    else out.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function ChatText({ text }) {
  const lines = text.split('\n')
  const blocks = []
  let list = [], listNum = null, key = 0

  const flushList = () => {
    if (!list.length) return
    const items = list
    blocks.push(
      <ul key={key++} className={listNum ? 'md-ol' : 'md-ul'}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    )
    list = []
    listNum = null
  }

  for (const line of lines) {
    const trim = line.trim()
    if (!trim) { flushList(); continue }
    const h3 = trim.match(/^###\s+(.*)/)
    const h2 = trim.match(/^##\s+(.*)/)
    const h1 = trim.match(/^#\s+(.*)/)
    const bullet = trim.match(/^[-*•]\s+(.*)/)
    const ordered = trim.match(/^\d+[.)]\s+(.*)/)
    if (h3) { flushList(); blocks.push(<h4 key={key++}>{renderInline(h3[1])}</h4>) }
    else if (h2) { flushList(); blocks.push(<h3 key={key++}>{renderInline(h2[1])}</h3>) }
    else if (h1) { flushList(); blocks.push(<h2 key={key++}>{renderInline(h1[1])}</h2>) }
    else if (bullet) { listNum = listNum === null ? false : listNum; list.push(renderInline(bullet[1])) }
    else if (ordered) { listNum = true; list.push(renderInline(ordered[1])) }
    else { flushList(); blocks.push(<p key={key++}>{renderInline(line)}</p>) }
  }
  flushList()
  return <>{blocks}</>
}

function suggestions() {
  return [
    t('sug1'),
    t('sug2'),
    t('sug3'),
    t('sug4'),
    t('sug5'),
  ]
}

export default function Analyst() {
  const router = useRouter()
  const { user, updateUser, refreshProfile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const [market] = useState(() => getMarketStatus())

  useEffect(() => {
    const boot = async () => { try { await refreshProfile() } catch (e) {} }
    if (user) boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]')
      if (Array.isArray(saved) && saved.length) {
        setMessages(saved)
        return
      }
    } catch (e) {}
    setMessages([{ role: 'assistant', content: t('welcomeChat') }])
  }, [])

  useEffect(() => {
    if (messages.length) {
      try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-60))) } catch (e) {}
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return
    const question = text.trim()
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    setLoading(true)
    try {
      const res = await analystChat({ question })
      const answer = res.data.answer || res.data.response || res.data.message || t('noAnswer')
      if (res.data.tokens_remaining != null) updateUser({ ai_tokens: res.data.tokens_remaining })
      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (e) {
      const isQuota = e?.response?.status === 429
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t(isQuota ? 'chatQuota' : 'chatError'),
        error: true,
        question,
        quota: isQuota,
      }])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    localStorage.removeItem(CHAT_KEY)
    setMessages([{ role: 'assistant', content: t('welcomeChat') }])
  }

  return (
    <div className="mobile-root">
      <div className="chat-area">
        <header className="an-header">
          <button className="icon-btn" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div className="an-title">
            <span className="an-name">{t('aiAnalyst')}</span>
            <span className={`an-status ${market.isOpen ? 'open' : 'closed'}`}>
              <Sparkles size={11} /> BRVM · {t(market.label)}
            </span>
          </div>
          <div className="an-right">
            {user && (
              <button
                className={`an-tokens ${user.tier === 'pro' ? 'pro' : ''}`}
                onClick={() => router.push('/premium')}
                title={t('analystTokensTitle')}
              >
                <Coins size={11} /> {user.ai_tokens ?? 0}
              </button>
            )}
            <button className="icon-btn" onClick={clearChat} title={t('clear')}>
              <Trash2 size={17} />
            </button>
          </div>
        </header>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'assistant' && !msg.error
                ? <ChatText text={msg.content} />
                : msg.content}
              {msg.error && (
                <div className="retry-row">
                  {msg.quota ? (
                    <button className="retry-msg quota" onClick={() => router.push('/premium')}>
                      <Sparkles size={12} /> {t('chatUpgrade')}
                    </button>
                  ) : (
                    <button className="retry-msg" onClick={() => sendMessage(msg.question)}>
                      <RefreshCw size={12} /> {t('retry')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-bubble assistant">
              <TriLoader inline />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-suggestions">
          {suggestions().map((s, i) => (
            <button key={i} className="suggestion" onClick={() => sendMessage(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>

        <div className="chat-input-bar">
          <input
            placeholder={t('chatPlaceholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          />
          <button className="send-btn" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
            <Send size={16} />
          </button>
        </div>
      </div>

      <BottomNav />
      <style jsx>{`
        .mobile-root {
          display: flex; flex-direction: column; height: 100vh;
          background: #000000; color: #fff;
          font-family: Inter, -apple-system, sans-serif; overflow: hidden;
        }
        .chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .an-header {
          display: flex; align-items: center; justify-content: space-between;
          height: 60px; padding: 0 16px; flex-shrink: 0;
        }
        .icon-btn {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: none; border: none; color: #fff; cursor: pointer; border-radius: 50%;
        }
        .icon-btn:hover { background: #1a1a1a; }
        .an-title { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .an-name { font-size: 17px; font-weight: 600; }
        .an-right { display: flex; align-items: center; gap: 6px; }
        .an-tokens {
          display: flex; align-items: center; gap: 5px;
          height: 30px; padding: 0 11px;
          background: #1B1B1B; border: 1px solid #2a2a2a; border-radius: 999px;
          color: #9AA3B2; font-size: 12px; font-weight: 600; cursor: pointer;
          font-family: inherit;
        }
        .an-tokens:hover { border-color: #3a3a3a; color: #fff; }
        .an-tokens.pro { color: #FFD77A; border-color: #FFD77A44; background: #2a2416; }
        .retry-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .retry-msg.quota { background: #241d0e; border-color: #FFD77A55; color: #FFD77A; }
        .retry-msg.quota:hover { background: #2f2613; }
        .an-status {
          display: flex; align-items: center; gap: 4px;
          font-size: 11px;
        }
        .an-status.open { color: #18C27C; }
        .an-status.closed { color: #9AA3B2; }
        .chat-messages {
          flex: 1; overflow-y: auto; padding: 8px 16px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .chat-messages::-webkit-scrollbar { display: none; }
        .chat-bubble {
          max-width: 85%; padding: 10px 14px;
          font-size: 14px; line-height: 1.35;
          word-break: break-word;
        }
        .chat-bubble.assistant { align-self: flex-start; }
        .chat-bubble p { margin: 0 0 8px; }
        .chat-bubble p:last-child { margin-bottom: 0; }
        .chat-bubble h2, .chat-bubble h3, .chat-bubble h4 {
          margin: 10px 0 6px; line-height: 1.35;
        }
        .chat-bubble h2 { font-size: 16px; }
        .chat-bubble h3 { font-size: 15px; }
        .chat-bubble h4 { font-size: 14px; }
        .chat-bubble .md-ul, .chat-bubble .md-ol { margin: 0 0 8px; padding-left: 18px; }
        .chat-bubble .md-ul li, .chat-bubble .md-ol li { margin-bottom: 4px; }
        .chat-bubble strong { color: #fff; font-weight: 600; }
        .chat-bubble em { color: #d6d3f0; }
        .chat-bubble code {
          background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 6px;
          padding: 1px 6px; font-size: 12.5px; color: #9be7bd;
        }
        .chat-bubble.assistant { align-self: flex-start; background: #1B1B1B; border-radius: 4px 16px 16px 16px; }
        .chat-bubble.user {
          align-self: flex-end; background: #8b5cf6; border-radius: 16px 4px 16px 16px;
        }
        .retry-msg {
          display: flex; align-items: center; gap: 5px;
          margin-top: 8px; padding: 6px 10px;
          background: #261010; border: 1px solid #F0443855; border-radius: 10px;
          color: #f0b4b4; font-size: 12px; cursor: pointer; font-family: inherit;
        }
        .retry-msg:hover { background: #331616; }
        .chat-suggestions {
          display: flex; gap: 8px; padding: 10px 16px;
          overflow-x: auto; flex-shrink: 0;
        }
        .chat-suggestions::-webkit-scrollbar { display: none; }
        .suggestion {
          flex-shrink: 0; padding: 8px 14px;
          background: #1B1B1B; border: none; border-radius: 14px;
          color: #9AA3B2; font-size: 12px; cursor: pointer; font-family: inherit;
          white-space: nowrap;
        }
        .suggestion:hover { background: #262626; color: #fff; }
        .chat-input-bar {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 16px 14px; flex-shrink: 0;
        }
        .chat-input-bar input {
          flex: 1; height: 44px; padding: 0 16px;
          background: #1B1B1B; border: none; border-radius: 14px;
          color: #fff; font-size: 14px; font-family: inherit; outline: none;
        }
        .chat-input-bar input::placeholder { color: #666; }
        .send-btn {
          width: 44px; height: 44px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: #8b5cf6; border: none; border-radius: 14px;
          color: #fff; cursor: pointer;
        }
        .send-btn:disabled { opacity: 0.4; cursor: default; }
      `}</style>
    </div>
  )
}
