import Dexie, { type EntityTable } from 'dexie'
import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  isBefore,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfDay,
} from 'date-fns'
import type {
  DailyTimeSummary,
  NewTask,
  NewTimeEntry,
  Task,
  TaskUpdate,
  TimeEntry,
  TimeEntryUpdate,
} from './types'

const DB_NAME = 'TasksTracker'

export class TasksDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  timeEntries!: EntityTable<TimeEntry, 'id'>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      tasks: 'id, parentId, status, priority, dueDate, completedAt, updatedAt',
      timeEntries: 'id, taskId, startAt, endAt',
    })
  }
}

export const db = new TasksDatabase()

function newId(): string {
  return crypto.randomUUID()
}

function now(): Date {
  return new Date()
}

/** Round elapsed ms to whole minutes (minimum 1 when any positive elapsed). */
function minutesBetween(start: Date, end: Date): number {
  const raw = differenceInMinutes(end, start)
  if (raw <= 0) {
    const ms = end.getTime() - start.getTime()
    return ms > 0 ? 1 : 0
  }
  return raw
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Duration of an entry in whole minutes (uses stored duration when set). */
export function entryDurationMinutes(
  entry: TimeEntry,
  asOf: Date = now(),
): number {
  if (entry.durationMinutes != null) return entry.durationMinutes
  const startAt = asDate(entry.startAt)
  if (entry.endAt) return minutesBetween(startAt, asDate(entry.endAt))
  return minutesBetween(startAt, asOf)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTask(input: NewTask): Promise<Task> {
  const timestamp = now()
  const status = input.status ?? 'todo'
  const task: Task = {
    id: newId(),
    title: input.title,
    description: input.description,
    priority: input.priority,
    status,
    parentId: input.parentId,
    startDate: input.startDate,
    dueDate: input.dueDate,
    completedAt: status === 'done' ? timestamp : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.tasks.add(task)
  return task
}

export async function getTask(id: string): Promise<Task | undefined> {
  return db.tasks.get(id)
}

export async function updateTask(
  id: string,
  changes: TaskUpdate,
): Promise<Task | undefined> {
  const existing = await db.tasks.get(id)
  if (!existing) return undefined

  const timestamp = now()
  const next: Task = {
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: timestamp,
  }

  if (changes.status === 'done' && existing.status !== 'done') {
    next.completedAt = changes.completedAt ?? timestamp
  } else if (changes.status != null && changes.status !== 'done') {
    next.completedAt = undefined
  }

  await db.tasks.put(next)
  return next
}

export async function deleteTask(id: string): Promise<void> {
  const descendantIds = await getDescendantIds(id)
  const ids = [id, ...descendantIds]

  await db.transaction('rw', db.tasks, db.timeEntries, async () => {
    await db.timeEntries.where('taskId').anyOf(ids).delete()
    await db.tasks.bulkDelete(ids)
  })
}

export async function listActiveTasks(): Promise<Task[]> {
  return db.tasks.where('status').anyOf(['todo', 'in_progress']).toArray()
}

export async function listCompletedTasks(): Promise<Task[]> {
  const tasks = await db.tasks.where('status').equals('done').toArray()
  return tasks.sort((a, b) => {
    const aTime = a.completedAt?.getTime() ?? 0
    const bTime = b.completedAt?.getTime() ?? 0
    return bTime - aTime
  })
}

export async function listAllTasks(): Promise<Task[]> {
  return db.tasks.toArray()
}

export async function listTimelineTasks(): Promise<Task[]> {
  const tasks = await db.tasks.toArray()
  return tasks.filter((t) => Boolean(t.startDate && t.dueDate))
}

export async function getSubtasks(parentId: string): Promise<Task[]> {
  return db.tasks.where('parentId').equals(parentId).toArray()
}

export async function getDescendantIds(rootId: string): Promise<string[]> {
  const all = await db.tasks.toArray()
  const byParent = new Map<string | null, Task[]>()
  for (const task of all) {
    const key = task.parentId
    const list = byParent.get(key) ?? []
    list.push(task)
    byParent.set(key, list)
  }

  const result: string[] = []
  const stack = [...(byParent.get(rootId) ?? [])]
  while (stack.length > 0) {
    const current = stack.pop()!
    result.push(current.id)
    const children = byParent.get(current.id) ?? []
    stack.push(...children)
  }
  return result
}

const PRIORITY_ORDER: Record<Task['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function sortTasksByPriorityThenDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    const aDue = a.dueDate ?? '9999-12-31'
    const bDue = b.dueDate ?? '9999-12-31'
    return aDue.localeCompare(bDue)
  })
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

export async function createTimeEntry(input: NewTimeEntry): Promise<TimeEntry> {
  const entry: TimeEntry = {
    id: newId(),
    taskId: input.taskId,
    startAt: input.startAt,
    endAt: input.endAt ?? null,
    durationMinutes: input.durationMinutes,
    note: input.note,
    createdAt: input.createdAt ?? now(),
  }
  await db.timeEntries.add(entry)
  return entry
}

export async function getTimeEntry(id: string): Promise<TimeEntry | undefined> {
  return db.timeEntries.get(id)
}

export async function updateTimeEntry(
  id: string,
  changes: TimeEntryUpdate,
): Promise<TimeEntry | undefined> {
  const existing = await db.timeEntries.get(id)
  if (!existing) return undefined
  const next: TimeEntry = { ...existing, ...changes, id: existing.id }
  await db.timeEntries.put(next)
  return next
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await db.timeEntries.delete(id)
}

export async function listTimeEntriesForTask(
  taskId: string,
): Promise<TimeEntry[]> {
  return db.timeEntries.where('taskId').equals(taskId).toArray()
}

export async function listTimeEntriesForTasks(
  taskIds: string[],
): Promise<TimeEntry[]> {
  if (taskIds.length === 0) return []
  return db.timeEntries.where('taskId').anyOf(taskIds).toArray()
}

export async function getRunningTimer(): Promise<TimeEntry | undefined> {
  return db.timeEntries.filter((e) => e.endAt == null).first()
}

/** Stop any running timer and persist its duration. Returns the stopped entry, if any. */
export async function stopRunningTimer(
  endAt: Date = now(),
): Promise<TimeEntry | undefined> {
  const running = await getRunningTimer()
  if (!running) return undefined

  const durationMinutes = minutesBetween(running.startAt, endAt)
  return updateTimeEntry(running.id, {
    endAt,
    durationMinutes,
  })
}

/**
 * Start a timer on `taskId`. Stops any previously running timer first
 * (one active timer at a time).
 */
export async function startTimer(taskId: string): Promise<TimeEntry> {
  await stopRunningTimer()
  return createTimeEntry({
    taskId,
    startAt: now(),
    endAt: null,
  })
}

export async function addManualTimeEntry(input: {
  taskId: string
  durationMinutes: number
  startAt?: Date
  note?: string
}): Promise<TimeEntry> {
  const startAt = input.startAt ?? now()
  const endAt = addMinutes(startAt, input.durationMinutes)
  return createTimeEntry({
    taskId: input.taskId,
    startAt,
    endAt,
    durationMinutes: input.durationMinutes,
    note: input.note,
  })
}

/** Own entries only (no descendants). Includes running timer time as of `asOf`. */
export async function getOwnSpentMinutes(
  taskId: string,
  asOf: Date = now(),
): Promise<number> {
  const entries = await listTimeEntriesForTask(taskId)
  return entries.reduce((sum, e) => sum + entryDurationMinutes(e, asOf), 0)
}

/**
 * Parent spent time = own entries + all descendants (time rollup).
 */
export async function getRolledUpSpentMinutes(
  taskId: string,
  asOf: Date = now(),
): Promise<number> {
  const descendantIds = await getDescendantIds(taskId)
  const ids = [taskId, ...descendantIds]
  const entries = await listTimeEntriesForTasks(ids)
  return entries.reduce((sum, e) => sum + entryDurationMinutes(e, asOf), 0)
}

/**
 * Minutes from an entry that fall on a calendar day (YYYY-MM-DD).
 * Splits multi-day sessions across day boundaries.
 */
export function minutesOnDay(
  entry: TimeEntry,
  dayIso: string,
  asOf: Date = now(),
): number {
  // Prefer stored duration for single-day manual/timer entries so totals
  // match what the user entered even if wall-clock rounding differs.
  if (
    entry.durationMinutes != null &&
    entry.endAt != null &&
    format(asDate(entry.startAt), 'yyyy-MM-dd') === dayIso &&
    format(asDate(entry.endAt), 'yyyy-MM-dd') === dayIso
  ) {
    return entry.durationMinutes
  }

  const dayStart = startOfDay(parseISO(dayIso))
  const dayEnd = addDays(dayStart, 1)
  const rangeEnd = entry.endAt != null ? asDate(entry.endAt) : asOf
  const overlapStart = maxDate([asDate(entry.startAt), dayStart])
  const overlapEnd = minDate([rangeEnd, dayEnd])
  if (!isBefore(overlapStart, overlapEnd)) return 0
  return minutesBetween(overlapStart, overlapEnd)
}

export async function getDailyTimeSummary(
  dayIso: string,
  asOf: Date = now(),
): Promise<DailyTimeSummary> {
  const dayStart = startOfDay(parseISO(dayIso))
  const entries = await db.timeEntries.toArray()
  const byTaskId = new Map<
    string,
    { minutes: number; entries: DailyTimeSummary['byTask'][number]['entries'] }
  >()

  for (const entry of entries) {
    const mins = minutesOnDay(entry, dayIso, asOf)
    if (mins <= 0) continue

    const startAt = asDate(entry.startAt)
    const rangeEnd = entry.endAt != null ? asDate(entry.endAt) : asOf
    const sliceStart = maxDate([startAt, dayStart])
    const running = entry.endAt == null

    const bucket = byTaskId.get(entry.taskId) ?? { minutes: 0, entries: [] }
    bucket.minutes += mins
    bucket.entries.push({
      entryId: entry.id,
      minutes: mins,
      startAt: sliceStart,
      endAt: running ? null : minDate([rangeEnd, addDays(dayStart, 1)]),
      note: entry.note,
      running,
    })
    byTaskId.set(entry.taskId, bucket)
  }

  const byTask = await Promise.all(
    [...byTaskId.entries()].map(async ([taskId, bucket]) => {
      const task = await db.tasks.get(taskId)
      const parent =
        task?.parentId != null ? await db.tasks.get(task.parentId) : undefined
      bucket.entries.sort(
        (a, b) => b.startAt.getTime() - a.startAt.getTime(),
      )
      return {
        taskId,
        title: task?.title ?? 'Deleted task',
        parentTitle: parent?.title ?? null,
        minutes: bucket.minutes,
        entries: bucket.entries,
      }
    }),
  )

  byTask.sort((a, b) => b.minutes - a.minutes)
  const totalMinutes = byTask.reduce((sum, row) => sum + row.minutes, 0)

  return { date: dayIso, totalMinutes, byTask }
}

/**
 * Span of calendar days an entry covers (for debugging / charts).
 * Empty if the session has not started yet relative to `asOf`.
 */
export function calendarDaysCovered(
  entry: TimeEntry,
  asOf: Date = now(),
): string[] {
  const end = entry.endAt ?? asOf
  if (isBefore(end, entry.startAt)) return []
  const days = differenceInCalendarDays(end, entry.startAt)
  const startDay = startOfDay(entry.startAt)
  const result: string[] = []
  for (let i = 0; i <= days; i++) {
    result.push(format(addDays(startDay, i), 'yyyy-MM-dd'))
  }
  return result
}

// ---------------------------------------------------------------------------
// First-run seed
// ---------------------------------------------------------------------------

export async function seedIfEmpty(): Promise<boolean> {
  const count = await db.tasks.count()
  if (count > 0) return false

  const today = format(now(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(now(), 1), 'yyyy-MM-dd')
  const nextWeek = format(addDays(now(), 7), 'yyyy-MM-dd')
  const yesterday = format(addDays(now(), -1), 'yyyy-MM-dd')
  const threeDaysAgo = format(addDays(now(), -3), 'yyyy-MM-dd')

  await db.transaction('rw', db.tasks, db.timeEntries, async () => {
    const launch = await createTask({
      title: 'Ship local task tracker',
      description: 'Core features: tasks, time tracking, history, and timeline.',
      priority: 'high',
      status: 'in_progress',
      parentId: null,
      startDate: yesterday,
      dueDate: nextWeek,
    })

    const design = await createTask({
      title: 'Design data model',
      description: 'Tasks, subtasks, and time entries in IndexedDB.',
      priority: 'high',
      status: 'done',
      parentId: launch.id,
      startDate: threeDaysAgo,
      dueDate: yesterday,
    })
    await updateTask(design.id, {
      status: 'done',
      completedAt: parseISO(`${yesterday}T16:00:00`),
    })

    await createTask({
      title: 'Build Active list UI',
      priority: 'medium',
      status: 'todo',
      parentId: launch.id,
      startDate: today,
      dueDate: tomorrow,
    })

    await createTask({
      title: 'Wire time tracking panel',
      priority: 'medium',
      status: 'todo',
      parentId: launch.id,
      startDate: today,
      dueDate: nextWeek,
    })

    const reading = await createTask({
      title: 'Read Dexie docs',
      priority: 'low',
      status: 'done',
      parentId: null,
      startDate: threeDaysAgo,
      dueDate: yesterday,
    })
    await updateTask(reading.id, {
      status: 'done',
      completedAt: parseISO(`${yesterday}T10:30:00`),
    })

    await createTask({
      title: 'Plan weekly review',
      description: 'Capture wins and open loops for next week.',
      priority: 'low',
      status: 'todo',
      parentId: null,
      startDate: tomorrow,
      dueDate: nextWeek,
    })

    await addManualTimeEntry({
      taskId: design.id,
      durationMinutes: 90,
      startAt: parseISO(`${threeDaysAgo}T09:00:00`),
      note: 'Schema sketch + indexes',
    })

    await addManualTimeEntry({
      taskId: design.id,
      durationMinutes: 45,
      startAt: parseISO(`${yesterday}T14:00:00`),
      note: 'CRUD helpers',
    })

    await addManualTimeEntry({
      taskId: reading.id,
      durationMinutes: 30,
      startAt: parseISO(`${yesterday}T09:00:00`),
    })
  })

  return true
}
