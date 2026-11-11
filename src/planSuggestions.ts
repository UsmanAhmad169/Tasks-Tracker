import { format, parseISO } from 'date-fns'
import { formatMinutes } from './formatTime'
import {
  compareByScheduleUrgency,
  getScheduleHealth,
  scheduleHealthLabel,
} from './scheduleHealth'
import type { Task } from './types'

const DEFAULT_PLANNED_MINUTES = 60
const MIN_PLANNED_MINUTES = 15

export type PlanCandidate = {
  task: Task
  parentTitle: string | null
  /** Why it is worth planning, e.g. "Due today · 45m left of ETA" */
  hint: string | null
  defaultMinutes: number
}

/**
 * Suggested planned time: what's left of the ETA (or 1h), capped to the
 * capacity still free on the day when there is some.
 */
export function defaultPlannedMinutes(
  task: Task,
  spentMinutes: number,
  freeCapacityMinutes: number,
): number {
  const fromEta =
    task.etaMinutes != null
      ? Math.max(MIN_PLANNED_MINUTES, task.etaMinutes - spentMinutes)
      : DEFAULT_PLANNED_MINUTES
  if (freeCapacityMinutes >= MIN_PLANNED_MINUTES) {
    return Math.min(fromEta, freeCapacityMinutes)
  }
  return fromEta
}

function candidateHint(task: Task, day: Date, spentMinutes: number): string | null {
  const parts: string[] = []
  if (task.status === 'in_progress') parts.push('In progress')
  const health = getScheduleHealth(task, day, spentMinutes)
  if (health !== 'on_track' && health !== 'done') {
    parts.push(scheduleHealthLabel(health, task, day, spentMinutes))
  }
  if (task.etaMinutes != null) {
    const left = Math.max(0, task.etaMinutes - spentMinutes)
    parts.push(`${formatMinutes(left)} left of ETA`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Active tasks not yet planned on `dayIso`, most worth planning first:
 * in progress, then by schedule urgency relative to that day.
 */
export function planCandidates(input: {
  dayIso: string
  tasks: Task[]
  plannedTaskIds: Set<string>
  spentByTask: Map<string, number>
  freeCapacityMinutes: number
}): PlanCandidate[] {
  const { dayIso, tasks, plannedTaskIds, spentByTask, freeCapacityMinutes } =
    input
  const day = parseISO(dayIso)
  const byId = new Map(tasks.map((t) => [t.id, t]))

  // A task finished on or after the day was still open then (backfilling)
  const openOnDay = (t: Task) =>
    t.status !== 'done' ||
    (t.completedAt != null && format(t.completedAt, 'yyyy-MM-dd') >= dayIso)

  return tasks
    .filter((t) => openOnDay(t) && !plannedTaskIds.has(t.id))
    .sort((a, b) => {
      const progressDiff =
        Number(b.status === 'in_progress') - Number(a.status === 'in_progress')
      if (progressDiff !== 0) return progressDiff
      return compareByScheduleUrgency(a, b, day, spentByTask)
    })
    .map((task) => {
      const spent = spentByTask.get(task.id) ?? 0
      return {
        task,
        parentTitle:
          task.parentId != null ? (byId.get(task.parentId)?.title ?? null) : null,
        hint: candidateHint(task, day, spent),
        defaultMinutes: defaultPlannedMinutes(task, spent, freeCapacityMinutes),
      }
    })
}
