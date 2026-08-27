import { useCallback, useEffect, useRef, useState } from 'react'
import { getAiStudio } from '../services/api'

export default function useAiStudio({ enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    setError(false)
    try {
      const res = await getAiStudio()
      if (mounted.current) setData(res.data)
    } catch (e) {
      if (mounted.current) setError(true)
    } finally {
      if (mounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => { if (enabled) load() }, [load, enabled])

  const refresh = useCallback(() => {
    setRefreshing(true)
    load(true)
  }, [load])

  return { data, loading, error, refresh, refreshing }
}
