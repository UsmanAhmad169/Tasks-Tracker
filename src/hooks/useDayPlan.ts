import { liveQuery } from 'dexie'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addPlanItem,
  db,
  getDailyTimeSummary,
  getDayPlan,
  listPlanItems,
  movePlanItem,
  removePlanItem,
  updatePlanItem,
  upsertDayPlan,
} from '../db'
import { computeDayRetro } from '../dayRetro'
import { WORKDAY_MINUTES } from '../scheduleHealth'
import type { DailyTimeSummary, DayPlan, PlanItem, Task } from '../types'

type DayPlanData = {
  date: string
  plan: DayPlan | undefined
  items: PlanItem[]
  tasks: Task[]
  summary: DailyTimeSummary
}

/** How often to re-read while a timer is running, so actuals keep moving. */
const RUNNING_REFRESH_MS = 60_000

export function useDayPlan(dayIso: string) {
  const [data, setData] = useState<DayPlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    // liveQuery only re-runs on DB writes; refreshTick re-reads running time.
    void refreshTick
    const subscription = liveQuery(async () => {
      const [plan, items, tasks, summary] = await Promise.all([
        getDayPlan(dayIso),
        listPlanItems(dayIso),
        db.tasks.toArray(),
        getDailyTimeSummary(dayIso),
      ])
      return { date: dayIso, plan, items, tasks, summary }
    }).subscribe({
      next: (value) => {
        setData(value)
        setLoading(false)
        setError(null)
      },
      error: (err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    })
    return () => subscription.unsubscribe()
  }, [dayIso, refreshTick])

  const hasRunning =
    data?.summary.byTask.some((row) => row.entries.some((e) => e.running)) ??
    false

  useEffect(() => {
    if (!hasRunning) return
    const id = window.setInterval(
      () => setRefreshTick((n) => n + 1),
      RUNNING_REFRESH_MS,
    )
    return () => window.clearInterval(id)
  }, [hasRunning])

  // Ignore a previous day's data while the new day loads
  const current = data?.date === dayIso ? data : null
  const capacityMinutes = current?.plan?.capacityMinutes ?? WORKDAY_MINUTES

  const retro = useMemo(
    () =>
      current
        ? computeDayRetro({
            dayIso,
            capacityMinutes,
            items: current.items,
            tasks: current.tasks,
            summary: current.summary,
          })
        : null,
    [current, dayIso, capacityMinutes],
  )

  const addItem = useCallback(
    (taskId: string, plannedMinutes: number, date: string = dayIso) =>
      addPlanItem({ date, taskId, plannedMinutes }),
    [dayIso],
  )
  const setPlannedMinutes = useCallback(
    (id: string, minutes: number) =>
      updatePlanItem(id, { plannedMinutes: minutes }),
    [],
  )
  const setItemNote = useCallback(
    (id: string, note: string) =>
      updatePlanItem(id, { note: note.trim() || undefined }),
    [],
  )
  const removeItem = useCallback((id: string) => removePlanItem(id), [])
  const moveItem = useCallback(
    (id: string, direction: -1 | 1) => movePlanItem(id, direction),
    [],
  )
  const setCapacity = useCallback(
    (minutes: number) => upsertDayPlan(dayIso, { capacityMinutes: minutes }),
    [dayIso],
  )
  const setRetroNote = useCallback(
    (note: string) =>
      upsertDayPlan(dayIso, { retroNote: note.trim() || undefined }),
    [dayIso],
  )

  return {
    plan: current?.plan,
    tasks: current?.tasks ?? [],
    retro,
    loading: loading || (current == null && error == null),
    error,
    addItem,
    setPlannedMinutes,
    setItemNote,
    removeItem,
    moveItem,
    setCapacity,
    setRetroNote,
  }
}
