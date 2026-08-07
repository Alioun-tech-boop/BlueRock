import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Premium() {
  const router = useRouter()
  useEffect(() => { router.replace('/patrimoine') }, [router])
  return null
}
