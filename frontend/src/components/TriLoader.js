export default function TriLoader({ label, compact = false, inline = false }) {
  return (
    <div className={`tl-root ${compact ? 'tl-compact' : ''} ${inline ? 'tl-inline' : ''}`} role="status" aria-label={label || 'Chargement'}>
      <div className="tl-btns">
        {[0, 1, 2, 3].map(i => (
          <span className="tl-btn" key={i} style={{ '--i': i }}>
            <span className="tl-btn-in" />
          </span>
        ))}
      </div>
      {label && <span className="tl-label">{label}</span>}
      <style jsx>{`
        .tl-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 28px 0;
        }
        .tl-btns {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tl-btn {
          position: relative;
          width: 30px;
          height: 30px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }
        .tl-btn-in {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #fff;
          animation: tl-wave 1.7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
          animation-delay: calc(var(--i) * 0.13s);
        }
        .tl-btn:last-child .tl-btn-in {
          background: #18C27C;
          box-shadow: 0 0 12px rgba(24, 194, 124, 0.6), 0 0 28px rgba(24, 194, 124, 0.3);
        }
        @keyframes tl-wave {
          0%, 100% { transform: translateY(0) scale(0.85); opacity: 0.55; }
          35% { transform: translateY(-13px) scale(1.06); opacity: 1; }
          65% { transform: translateY(-2px) scale(0.92); opacity: 0.85; }
        }
        .tl-label {
          font-size: 12.5px;
          font-weight: 600;
          color: #8E8E93;
          letter-spacing: 0.04em;
        }
        .tl-compact { padding: 14px 0; gap: 10px; }
        .tl-compact .tl-btns { gap: 4px; }
        .tl-compact .tl-btn { width: 22px; height: 22px; border-radius: 8px; }
        .tl-compact .tl-btn-in { width: 6px; height: 6px; }
        .tl-compact .tl-label { font-size: 11.5px; }
        .tl-inline { flex-direction: row; gap: 7px; padding: 0; }
        .tl-inline .tl-btns { gap: 2px; }
        .tl-inline .tl-btn { width: 14px; height: 14px; border-radius: 5px; background: transparent; border: none; }
        .tl-inline .tl-btn-in { width: 4.5px; height: 4.5px; }
        .tl-inline .tl-btn-in { animation: tl-wave-inline 1.5s cubic-bezier(0.45, 0, 0.55, 1) infinite; animation-delay: calc(var(--i) * 0.11s); }
        .tl-inline .tl-label { font-size: 11.5px; }
        @keyframes tl-wave-inline {
          0%, 100% { transform: translateY(0) scale(0.8); opacity: 0.5; }
          40% { transform: translateY(-4px) scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
