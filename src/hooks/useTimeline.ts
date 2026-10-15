import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { listTimelineTasks } from '../db'
import type { Task } from '../types'

const PRIORITY_ORDER: Record<Task['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function sortTimelineTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const startDiff = (a.startDate ?? '').localeCompare(b.startDate ?? '')
    if (startDiff !== 0) return startDiff
    const priorityDiff =
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return a.title.localeCompare(b.title)
  })
}

export function useTimelineTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const subscription = liveQuery(listTimelineTasks).subscribe({
      next: (value) => {
        setTasks(value)
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

  const sorted = useMemo(() => sortTimelineTasks(tasks), [tasks])
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  return { tasks: sorted, byId, loading, error }
}
