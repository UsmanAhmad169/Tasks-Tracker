import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, entryDurationMinutes } from '../db'

/**
 * Live map of taskId → rolled-up spent minutes (own + all descendants).
 */
export function useSpentMinutesByTask() {
  const [byTask, setByTask] = useState<Map<string, number>>(() => new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [tasks, entries] = await Promise.all([
        db.tasks.toArray(),
        db.timeEntries.toArray(),
      ])

      const own = new Map<string, number>()
      for (const entry of entries) {
        const mins = entryDurationMinutes(entry)
        own.set(entry.taskId, (own.get(entry.taskId) ?? 0) + mins)
      }

      const children = new Map<string, string[]>()
      for (const task of tasks) {
        if (task.parentId == null) continue
        const list = children.get(task.parentId) ?? []
        list.push(task.id)
        children.set(task.parentId, list)
      }

      const rolled = new Map<string, number>()
      const rollup = (id: string): number => {
        const cached = rolled.get(id)
        if (cached != null) return cached
        let sum = own.get(id) ?? 0
        for (const childId of children.get(id) ?? []) {
          sum += rollup(childId)
        }
        rolled.set(id, sum)
        return sum
      }

      for (const task of tasks) rollup(task.id)
      return rolled
    }).subscribe({
      next: (value) => {
        setByTask(value)
        setLoading(false)
      },
      error: () => setLoading(false),
    })
    return () => subscription.unsubscribe()
  }, [])

  return { byTask, loading }
}
