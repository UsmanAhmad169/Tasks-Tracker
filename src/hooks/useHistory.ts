import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { getRolledUpSpentMinutes, getTask, listCompletedTasks } from '../db'
import type { Task } from '../types'

export type HistoryItem = {
  task: Task
  /** Parent title when this is a subtask; null for top-level tasks */
  parentTitle: string | null
  totalMinutes: number
}

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const tasks = await listCompletedTasks()
      return Promise.all(
        tasks.map(async (task) => {
          const parent =
            task.parentId != null ? await getTask(task.parentId) : undefined
          return {
            task,
            parentTitle: parent?.title ?? null,
            totalMinutes: await getRolledUpSpentMinutes(task.id),
          }
        }),
      )
    }).subscribe({
      next: (value) => {
        setItems(value)
        setLoading(false)
        setError(null)
      },
      error: (err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    })
    return () => subscription.unsubscribe()
  }, [])

  return { items, loading, error }
}
