import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function ChartPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/quote?symbol=ETIT') }, [])
  return <div style={{ background: '#000', height: '100vh', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>Redirection…</div>
}
