import { useState } from 'react'

export default function NewsThumb({ image, label, size = 56, radius = 10 }) {
  const [failed, setFailed] = useState(false)
  const box = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #16375f 0%, #224b7a 55%, #3a73b0 100%)',
    color: '#fff',
    fontSize: Math.round(size * 0.42),
    fontWeight: 700,
  }
  if (image && !failed) {
    return (
      <div style={box}>
        <img
          src={image}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    )
  }
  return <div style={box}>{(label || '?').trim().charAt(0).toUpperCase()}</div>
}
