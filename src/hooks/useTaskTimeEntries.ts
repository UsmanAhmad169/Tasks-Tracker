import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { listTimeEntriesForTask } from '../db'
import type { TimeEntry } from '../types'

/** Live list of time entries for a single task (newest first). */
export function useTaskTimeEntries(taskId: string) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const list = await listTimeEntriesForTask(taskId)
      return list.sort(
        (a, b) =>
          new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
      )
    }).subscribe({
      next: (value) => {
        setEntries(value)
        setLoading(false)
      },
      error: () => setLoading(false),
    })
    return () => subscription.unsubscribe()
  }, [taskId])

  return { entries, loading }
}
