import { format } from 'date-fns'
import type {
  DailyTimeSummary,
  DayRetro,
  OtherTaskTime,
  PlanItem,
  PlanItemResult,
  PlanItemStatus,
  Task,
} from './types'

/** Variance within ±max(15m, 15% of planned) counts as on target. */
const MIN_TOLERANCE_MINUTES = 15
const TOLERANCE_RATIO = 0.15

export function varianceToleranceMinutes(plannedMinutes: number): number {
  return Math.max(
    MIN_TOLERANCE_MINUTES,
    Math.round(plannedMinutes * TOLERANCE_RATIO),
  )
}

export function planItemStatus(
  plannedMinutes: number,
  actualMinutes: number,
): PlanItemStatus {
  if (actualMinutes <= 0) return 'not_started'
  const variance = actualMinutes - plannedMinutes
  const tolerance = varianceToleranceMinutes(plannedMinutes)
  if (variance > tolerance) return 'over'
  if (variance < -tolerance) return 'under'
  return 'on_target'
}

function completedOnDay(task: Task | undefined, dayIso: string): boolean {
  if (!task?.completedAt || task.status !== 'done') return false
  return format(new Date(task.completedAt), 'yyyy-MM-dd') === dayIso
}

/**
 * Nearest planned ancestor-or-self of `taskId`, so subtask time rolls into a
 * planned parent and a planned subtask keeps its own time.
 */
function plannedOwnerId(
  taskId: string,
  plannedIds: Set<string>,
  tasksById: Map<string, Task>,
): string | null {
  const seen = new Set<string>()
  let current: string | null = taskId
  while (current != null && !seen.has(current)) {
    if (plannedIds.has(current)) return current
    seen.add(current)
    current = tasksById.get(current)?.parentId ?? null
  }
  return null
}

/**
 * Compare a day's plan with the time actually logged that day.
 * Time comes from every entry on the day, wherever it was started.
 */
export function computeDayRetro(input: {
  dayIso: string
  capacityMinutes: number
  items: PlanItem[]
  tasks: Task[]
  summary: DailyTimeSummary
}): DayRetro {
  const { dayIso, capacityMinutes, items, tasks, summary } = input
  const tasksById = new Map(tasks.map((t) => [t.id, t]))
  const plannedIds = new Set(items.map((i) => i.taskId))

  const ownedMinutes = new Map<string, number>()
  const ownedRunning = new Set<string>()
  const includes = new Map<string, PlanItemResult['includes']>()
  const otherTasks: OtherTaskTime[] = []

  for (const row of summary.byTask) {
    const running = row.entries.some((e) => e.running)
    const ownerId = plannedOwnerId(row.taskId, plannedIds, tasksById)

    if (ownerId == null) {
      otherTasks.push({
        taskId: row.taskId,
        title: row.title,
        parentTitle: row.parentTitle,
        minutes: row.minutes,
        completedOnDay: completedOnDay(tasksById.get(row.taskId), dayIso),
        running,
        entries: row.entries,
      })
      continue
    }

    ownedMinutes.set(ownerId, (ownedMinutes.get(ownerId) ?? 0) + row.minutes)
    if (running) ownedRunning.add(ownerId)
    if (ownerId !== row.taskId) {
      const list = includes.get(ownerId) ?? []
      list.push({ taskId: row.taskId, title: row.title, minutes: row.minutes })
      includes.set(ownerId, list)
    }
  }

  const results: PlanItemResult[] = items.map((item) => {
    const task = tasksById.get(item.taskId)
    const parent =
      task?.parentId != null ? tasksById.get(task.parentId) : undefined
    const actualMinutes = ownedMinutes.get(item.taskId) ?? 0
    return {
      item,
      title: task?.title ?? 'Deleted task',
      parentTitle: parent?.title ?? null,
      completedOnDay: completedOnDay(task, dayIso),
      actualMinutes,
      varianceMinutes: actualMinutes - item.plannedMinutes,
      status: planItemStatus(item.plannedMinutes, actualMinutes),
      running: ownedRunning.has(item.taskId),
      includes: (includes.get(item.taskId) ?? []).sort(
        (a, b) => b.minutes - a.minutes,
      ),
    }
  })

  otherTasks.sort((a, b) => b.minutes - a.minutes)

  const plannedMinutes = items.reduce((sum, i) => sum + i.plannedMinutes, 0)
  const plannedActualMinutes = results.reduce(
    (sum, r) => sum + r.actualMinutes,
    0,
  )
  const otherMinutes = otherTasks.reduce((sum, t) => sum + t.minutes, 0)
  const actualMinutes = summary.totalMinutes
  const absVariance = results.reduce(
    (sum, r) => sum + Math.abs(r.varianceMinutes),
    0,
  )

  return {
    date: dayIso,
    capacityMinutes,
    plannedMinutes,
    actualMinutes,
    plannedActualMinutes,
    otherMinutes,
    adherence: actualMinutes > 0 ? plannedActualMinutes / actualMinutes : null,
    estimateAccuracy:
      plannedMinutes > 0 ? Math.max(0, 1 - absVariance / plannedMinutes) : null,
    items: results,
    otherTasks,
  }
}
