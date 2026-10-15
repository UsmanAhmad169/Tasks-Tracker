import { liveQuery } from 'dexie'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createTask,
  deleteTask,
  listActiveTasks,
  listAllTasks,
  listCompletedTasks,
  sortTasksByPriorityThenDue,
  updateTask,
} from '../db'
import type { NewTask, Task, TaskStatus, TaskUpdate } from '../types'

export type TaskTreeNode = Task & { children: TaskTreeNode[] }

function buildTree(tasks: Task[]): TaskTreeNode[] {
  const ids = new Set(tasks.map((t) => t.id))
  const byParent = new Map<string | null, Task[]>()

  for (const task of tasks) {
    // Promote orphans whose parent is filtered out (e.g. completed)
    const key =
      task.parentId != null && ids.has(task.parentId) ? task.parentId : null
    const list = byParent.get(key) ?? []
    list.push(task)
    byParent.set(key, list)
  }

  const walk = (parentId: string | null): TaskTreeNode[] => {
    const siblings = sortTasksByPriorityThenDue(byParent.get(parentId) ?? [])
    return siblings.map((task) => ({
      ...task,
      children: walk(task.id),
    }))
  }

  return walk(null)
}

function useLiveTasks(mode: 'active' | 'completed' | 'all') {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const querier =
      mode === 'active'
        ? listActiveTasks
        : mode === 'completed'
          ? listCompletedTasks
          : listAllTasks

    const subscription = liveQuery(querier).subscribe({
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
  }, [mode])

  return { tasks, loading, error }
}

export function useActiveTasks() {
  const { tasks, loading, error } = useLiveTasks('active')
  const tree = useMemo(() => buildTree(tasks), [tasks])
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  return { tasks, tree, byId, loading, error }
}

export function useCompletedTasks() {
  return useLiveTasks('completed')
}

export function useAllTasks() {
  return useLiveTasks('all')
}

export function useTaskMutations() {
  const add = useCallback(async (input: NewTask) => createTask(input), [])
  const patch = useCallback(
    async (id: string, changes: TaskUpdate) => updateTask(id, changes),
    [],
  )
  const remove = useCallback(async (id: string) => deleteTask(id), [])
  const setStatus = useCallback(
    async (id: string, status: TaskStatus) => updateTask(id, { status }),
    [],
  )

  return { add, patch, remove, setStatus }
}
