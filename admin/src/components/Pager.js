import React from 'react'

export default function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  const go = (p) => { if (p >= 0 && p < pages) onPage(p) }
  return (
    <div className="adm-pager">
      <div className="info">{total} éléments · {from}–{to}</div>
      <div className="pg">
        <button onClick={() => go(page - 1)} disabled={page <= 0}>‹</button>
        {Array.from({ length: Math.min(pages, 7) }).map((_, i) => {
          let label = i
          if (pages > 7) {
            if (i === 0) label = 0
            else if (i === 6) label = pages - 1
            else label = page - 2 + i
            if (label < 0 || label > pages - 1) return null
          }
          return (
            <button key={i} className={label === page ? 'on' : ''} onClick={() => go(label)}>
              {label + 1}
            </button>
          )
        })}
        <button onClick={() => go(page + 1)} disabled={page >= pages - 1}>›</button>
      </div>
    </div>
  )
}
