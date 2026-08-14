import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/watchlist')
  }, [router])

  return (
    <div className="redir">
      <style jsx>{`
        .redir {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0A0A0A;
        }
      `}</style>
    </div>
  )
}