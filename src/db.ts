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
import { WORKDAY_MINUTES } from './scheduleHealth'
import type {
  DailyTimeSummary,
  DayPlan,
  NewTask,
  NewTimeEntry,
  PlanItem,
  Task,
  TaskUpdate,
  TimeEntry,
  TimeEntryUpdate,
} from './types'

const DB_NAME = 'TasksTracker'

export class TasksDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  timeEntries!: EntityTable<TimeEntry, 'id'>
  dayPlans!: EntityTable<DayPlan, 'date'>
  planItems!: EntityTable<PlanItem, 'id'>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      tasks: 'id, parentId, status, priority, dueDate, completedAt, updatedAt',
      timeEntries: 'id, taskId, startAt, endAt',
    })
    this.version(2).stores({
      dayPlans: 'date',
      // One plan row per task per day
      planItems: 'id, date, taskId, &[date+taskId]',
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
    etaMinutes: input.etaMinutes,
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

  if ('etaMinutes' in changes && changes.etaMinutes == null) {
    delete next.etaMinutes
  }

  await db.tasks.put(next)
  return next
}

export async function deleteTask(id: string): Promise<void> {
  const descendantIds = await getDescendantIds(id)
  const ids = [id, ...descendantIds]

  await db.transaction('rw', db.tasks, db.timeEntries, db.planItems, async () => {
    await db.timeEntries.where('taskId').anyOf(ids).delete()
    await db.planItems.where('taskId').anyOf(ids).delete()
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
  // Due date is enough for schedule health; missing start uses due as a 1-day bar.
  return tasks.filter((t) => Boolean(t.dueDate))
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
export async function startTimer(
  taskId: string,
  note?: string,
): Promise<TimeEntry> {
  await stopRunningTimer()
  return createTimeEntry({
    taskId,
    startAt: now(),
    endAt: null,
    note,
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
// Day plans
// ---------------------------------------------------------------------------

export async function getDayPlan(dayIso: string): Promise<DayPlan | undefined> {
  return db.dayPlans.get(dayIso)
}

/** Create the day's plan record on first write; capacity defaults to a workday. */
export async function upsertDayPlan(
  dayIso: string,
  changes: Partial<Pick<DayPlan, 'capacityMinutes' | 'retroNote'>>,
): Promise<DayPlan> {
  return db.transaction('rw', db.dayPlans, async () => {
    const existing = await db.dayPlans.get(dayIso)
    const timestamp = now()
    const next: DayPlan = {
      date: dayIso,
      capacityMinutes: existing?.capacityMinutes ?? WORKDAY_MINUTES,
      retroNote: existing?.retroNote,
      createdAt: existing?.createdAt ?? timestamp,
      ...changes,
      updatedAt: timestamp,
    }
    await db.dayPlans.put(next)
    return next
  })
}

export async function listPlanItems(dayIso: string): Promise<PlanItem[]> {
  return db.planItems.where('date').equals(dayIso).sortBy('order')
}

/**
 * Add a task to a day's plan. If the task is already planned that day,
 * the minutes are added to the existing row instead.
 */
export async function addPlanItem(input: {
  date: string
  taskId: string
  plannedMinutes: number
}): Promise<PlanItem> {
  return db.transaction('rw', db.planItems, async () => {
    const existing = await db.planItems
      .where('[date+taskId]')
      .equals([input.date, input.taskId])
      .first()
    if (existing) {
      const next = {
        ...existing,
        plannedMinutes: existing.plannedMinutes + input.plannedMinutes,
      }
      await db.planItems.put(next)
      return next
    }

    const siblings = await db.planItems.where('date').equals(input.date).toArray()
    const order = siblings.reduce((max, item) => Math.max(max, item.order + 1), 0)
    const item: PlanItem = {
      id: newId(),
      date: input.date,
      taskId: input.taskId,
      plannedMinutes: input.plannedMinutes,
      order,
      createdAt: now(),
    }
    await db.planItems.add(item)
    return item
  })
}

export async function updatePlanItem(
  id: string,
  changes: Partial<Pick<PlanItem, 'plannedMinutes' | 'note'>>,
): Promise<void> {
  // Dexie removes a property when its update value is undefined
  await db.planItems.update(id, changes)
}

export async function removePlanItem(id: string): Promise<void> {
  await db.planItems.delete(id)
}

/** Move an item one slot up (-1) or down (+1) within its day. */
export async function movePlanItem(id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.planItems, async () => {
    const item = await db.planItems.get(id)
    if (!item) return
    const items = await listPlanItems(item.date)
    const from = items.findIndex((i) => i.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= items.length) return
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    await db.planItems.bulkPut(items.map((i, index) => ({ ...i, order: index })))
  })
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
