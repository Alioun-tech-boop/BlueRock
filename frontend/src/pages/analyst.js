import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import BottomNav from '../components/BottomNav'
import { analystChat } from '../services/api'
import { ArrowLeft, Send, Sparkles, Trash2, RefreshCw } from 'lucide-react'
import { t } from '../lib/i18n'
import { getMarketStatus } from '../lib/market'

const CHAT_KEY = 'bluerock_chat_v1'

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
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const [market] = useState(() => getMarketStatus())

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
      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t('chatError'), error: true, question }])
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
          <button className="icon-btn" onClick={clearChat} title={t('clear')}>
            <Trash2 size={17} />
          </button>
        </header>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role}`}>
              {msg.content}
              {msg.error && (
                <button className="retry-msg" onClick={() => sendMessage(msg.question)}>
                  <RefreshCw size={12} /> {t('retry')}
                </button>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-bubble assistant">
              <div className="typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
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
          background: #000; color: #fff;
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
        .an-name { font-size: 17px; font-weight: 700; }
        .an-status {
          display: flex; align-items: center; gap: 4px;
          font-size: 11px;
        }
        .an-status.open { color: #00C853; }
        .an-status.closed { color: #a3a3a3; }
        .chat-messages {
          flex: 1; overflow-y: auto; padding: 8px 16px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .chat-messages::-webkit-scrollbar { display: none; }
        .chat-bubble {
          max-width: 85%; padding: 10px 14px;
          font-size: 14px; line-height: 1.5;
          white-space: pre-wrap; word-break: break-word;
        }
        .chat-bubble.assistant {
          align-self: flex-start; background: #1B1B1B; border-radius: 4px 16px 16px 16px;
        }
        .chat-bubble.user {
          align-self: flex-end; background: #8b5cf6; border-radius: 16px 4px 16px 16px;
        }
        .retry-msg {
          display: flex; align-items: center; gap: 5px;
          margin-top: 8px; padding: 6px 10px;
          background: #261010; border: 1px solid #FF4D4F55; border-radius: 10px;
          color: #f0b4b4; font-size: 12px; cursor: pointer; font-family: inherit;
        }
        .retry-msg:hover { background: #331616; }
        .typing { display: flex; gap: 4px; padding: 2px 0; }
        .dot {
          width: 6px; height: 6px; border-radius: 50%; background: #a3a3a3;
          animation: bounce 1.2s infinite;
        }
        .dot:nth-child(2) { animation-delay: 0.15s; }
        .dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        .chat-suggestions {
          display: flex; gap: 8px; padding: 10px 16px;
          overflow-x: auto; flex-shrink: 0;
        }
        .chat-suggestions::-webkit-scrollbar { display: none; }
        .suggestion {
          flex-shrink: 0; padding: 8px 14px;
          background: #1B1B1B; border: none; border-radius: 14px;
          color: #a3a3a3; font-size: 12px; cursor: pointer; font-family: inherit;
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
