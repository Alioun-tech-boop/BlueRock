import { useState, useEffect } from 'react'

export function realPhoto() {
  return null
}

export function coverPhoto() {
  return null
}

export function PhotoAvatar({ name, className, size = 46, avatar, color }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [avatar])
  const initials = (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const bg = color || '#3a3a44'
  if (!failed && avatar && (avatar.startsWith('data:image') || avatar.startsWith('http'))) {
    return (
      <img
        className={className}
        src={avatar}
        alt={name || ''}
        loading="lazy"
        style={{ width: size, height: size, fontSize: size * 0.34, objectFit: 'cover', background: bg, borderRadius: className && className.includes('fs-') ? '50%' : undefined }}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span className={className} style={{ width: size, height: size, fontSize: size * 0.34, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, borderRadius: className && className.includes('fs-') ? '50%' : undefined }}>
      {initials}
    </span>
  )
}