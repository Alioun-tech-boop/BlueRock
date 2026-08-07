import { useState, useRef, useEffect } from 'react'

export default function InfoDot({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <span className="idot-wrap" ref={ref}>
      <button
        type="button"
        className={`idot ${open ? 'open' : ''}`}
        onClick={e => { e.stopPropagation(); setOpen(!open) }}
        aria-label="Plus d'informations"
      >
        i
      </button>
      {open && <span className="idot-pop">{text}</span>}
      <style jsx>{`
        .idot-wrap { position: relative; display: inline-flex; align-items: center; }
        .idot {
          width: 15px; height: 15px; border-radius: 50%;
          border: 1px solid #4a4a4a; background: #262626; color: #9AA3B2;
          font-size: 14px; font-weight: 500;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0; cursor: pointer; font-family: inherit; line-height: 1;
          flex-shrink: 0;
        }
        .idot.open { border-color: #18C27C; color: #18C27C; }
        .idot-pop {
          position: absolute; z-index: 60;
          top: 21px; left: 50%; transform: translateX(-50%);
          width: 210px; max-width: 72vw;
          background: #2a2a2a; border: 1px solid #3d3d3d; border-radius: 10px;
          padding: 8px 10px; font-size: 14px; line-height: 1.35; color: #9AA3B2;
          text-align: left; font-style: normal; font-weight: 400;
          text-transform: none; letter-spacing: 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.55);
        }
      `}</style>
    </span>
  )
}
