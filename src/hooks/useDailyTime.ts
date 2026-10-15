import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { getDailyTimeSummary } from '../db'
import type { DailyTimeSummary } from '../types'

export function useDailyTime(dayIso: string) {
  const [summary, setSummary] = useState<DailyTimeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const subscription = liveQuery(() => getDailyTimeSummary(dayIso)).subscribe({
      next: (value) => {
        setSummary(value)
        setLoading(false)
        setError(null)
      },
      error: (err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    })
    return () => subscription.unsubscribe()
  }, [dayIso])

  return { summary, loading, error }
}
