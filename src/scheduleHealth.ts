import {
  addDays,
  differenceInCalendarDays,
  format,
  isWeekend,
  parseISO,
  startOfDay,
} from 'date-fns'
import type { Priority, Task } from './types'

/** Minutes in a standard workday (7 hours). */
export const WORKDAY_MINUTES = 7 * 60

export type ScheduleHealth =
  | 'overdue'
  | 'delayed'
  | 'due_today'
  | 'due_soon'
  | 'on_track'
  | 'done'

const HEALTH_ORDER: Record<ScheduleHealth, number> = {
  overdue: 0,
  delayed: 1,
  due_today: 2,
  due_soon: 3,
  on_track: 4,
  done: 5,
}

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

/** Normalize stored due/start values and Dates to YYYY-MM-DD. */
export function toDayIso(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  return format(value, 'yyyy-MM-dd')
}

function dayFromIso(iso: string): Date {
  return startOfDay(parseISO(toDayIso(iso)))
}

/** Count Mon–Fri days from `from` through `to` inclusive. */
export function countWorkdaysInclusive(from: Date, to: Date): number {
  const start = startOfDay(from)
  const end = startOfDay(to)
  if (end < start) return 0

  let count = 0
  let cursor = start
  while (cursor <= end) {
    if (!isWeekend(cursor)) count += 1
    cursor = addDays(cursor, 1)
  }
  return count
}

function remainingEffortMinutes(
  task: Task,
  spentMinutes: number,
): number | null {
  if (task.etaMinutes == null) return null
  return Math.max(0, task.etaMinutes - spentMinutes)
}

function workdaysNeeded(remainingMinutes: number): number {
  if (remainingMinutes <= 0) return 0
  return Math.ceil(remainingMinutes / WORKDAY_MINUTES)
}

function capacityShortfallLabel(
  task: Task,
  today: Date,
  spentMinutes: number,
): string | null {
  if (!task.dueDate) return null
  const remaining = remainingEffortMinutes(task, spentMinutes)
  if (remaining == null || remaining <= 0) return null

  const todayIso = toDayIso(today)
  const dueIso = toDayIso(task.dueDate)
  if (dueIso < todayIso) return null

  const available = countWorkdaysInclusive(
    dayFromIso(todayIso),
    dayFromIso(dueIso),
  )
  const capacity = available * WORKDAY_MINUTES
  if (remaining <= capacity) return null

  const needed = workdaysNeeded(remaining)
  return `needs ${needed} workday${needed === 1 ? '' : 's'} / ${available} left`
}

/**
 * Schedule health from due date + remaining ETA vs Mon–Fri capacity.
 * Calendar due-today / overdue always win over ETA "delayed".
 * Uses YYYY-MM-DD string compare so local timezone cannot shift the day.
 */
export function getScheduleHealth(
  task: Task,
  today: Date,
  spentMinutes: number,
): ScheduleHealth {
  if (task.status === 'done') return 'done'
  if (!task.dueDate) return 'on_track'

  const todayIso = toDayIso(today)
  const dueIso = toDayIso(task.dueDate)

  if (dueIso < todayIso) return 'overdue'
  if (dueIso === todayIso) return 'due_today'

  const calendarDaysUntil = differenceInCalendarDays(
    dayFromIso(dueIso),
    dayFromIso(todayIso),
  )

  const remaining = remainingEffortMinutes(task, spentMinutes)
  if (remaining != null && remaining > 0) {
    const availableWorkdays = countWorkdaysInclusive(
      dayFromIso(todayIso),
      dayFromIso(dueIso),
    )
    const capacity = availableWorkdays * WORKDAY_MINUTES
    if (remaining > capacity) return 'delayed'
  }

  if (calendarDaysUntil <= 3) return 'due_soon'
  return 'on_track'
}

export function scheduleHealthLabel(
  health: ScheduleHealth,
  task: Task,
  today: Date,
  spentMinutes: number,
): string {
  const todayIso = toDayIso(today)
  const dueIso = task.dueDate ? toDayIso(task.dueDate) : null
  const shortfall = capacityShortfallLabel(task, today, spentMinutes)

  switch (health) {
    case 'done':
      return 'Done'
    case 'overdue': {
      if (!dueIso) return 'Overdue'
      const daysLate = differenceInCalendarDays(
        dayFromIso(todayIso),
        dayFromIso(dueIso),
      )
      if (daysLate === 1) return '1 day late'
      return `${daysLate} days late`
    }
    case 'delayed':
      return shortfall ? `Delayed · ${shortfall}` : 'Delayed'
    case 'due_today':
      return shortfall ? `Due today · ${shortfall}` : 'Due today'
    case 'due_soon': {
      if (!dueIso) return shortfall ? `Due soon · ${shortfall}` : 'Due soon'
      const days = differenceInCalendarDays(
        dayFromIso(dueIso),
        dayFromIso(todayIso),
      )
      const base = days === 1 ? 'Due in 1 day' : `Due in ${days} days`
      return shortfall ? `${base} · ${shortfall}` : base
    }
    case 'on_track':
      return 'On track'
  }
}

export function compareByScheduleUrgency(
  a: Task,
  b: Task,
  today: Date,
  spentByTask: Map<string, number>,
): number {
  const healthA = getScheduleHealth(a, today, spentByTask.get(a.id) ?? 0)
  const healthB = getScheduleHealth(b, today, spentByTask.get(b.id) ?? 0)
  const healthDiff = HEALTH_ORDER[healthA] - HEALTH_ORDER[healthB]
  if (healthDiff !== 0) return healthDiff

  const dueDiff = (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  if (dueDiff !== 0) return dueDiff

  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  if (priorityDiff !== 0) return priorityDiff

  return a.title.localeCompare(b.title)
}

export const SCHEDULE_HEALTH_FILTERS: {
  id: ScheduleHealth
  label: string
}[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'due_today', label: 'Due today' },
  { id: 'due_soon', label: 'Due soon' },
  { id: 'on_track', label: 'On track' },
  { id: 'done', label: 'Done' },
]
