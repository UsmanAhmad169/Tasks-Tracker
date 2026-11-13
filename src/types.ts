export type Priority = 'low' | 'medium' | 'high'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Task {
  id: string
  title: string
  description?: string
  priority: Priority
  status: TaskStatus
  /** null = top-level task */
  parentId: string | null
  /** ISO date string YYYY-MM-DD */
  startDate?: string
  /** ISO date string YYYY-MM-DD */
  dueDate?: string
  /** Estimated effort in whole minutes */
  etaMinutes?: number
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface TimeEntry {
  id: string
  taskId: string
  startAt: Date
  /** null while a timer session is running */
  endAt?: Date | null
  /** Set for manual entries or when a timer stops */
  durationMinutes?: number
  note?: string
  createdAt: Date
}

export type NewTask = Omit<
  Task,
  'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'status'
> & {
  status?: TaskStatus
}

export type TaskUpdate = Partial<
  Omit<Task, 'id' | 'createdAt'>
>

export type NewTimeEntry = Omit<TimeEntry, 'id' | 'createdAt'> & {
  createdAt?: Date
}

export type TimeEntryUpdate = Partial<Omit<TimeEntry, 'id' | 'createdAt'>>

export interface DailyEntrySlice {
  entryId: string
  minutes: number
  /** Wall-clock start of the portion that falls on this day */
  startAt: Date
  /** null while the timer is still running */
  endAt: Date | null
  note?: string
  running: boolean
}

export interface DailyTaskTime {
  taskId: string
  title: string
  /** Parent title when this is a subtask; null for top-level tasks */
  parentTitle: string | null
  minutes: number
  entries: DailyEntrySlice[]
}

export interface DailyTimeSummary {
  date: string
  totalMinutes: number
  byTask: DailyTaskTime[]
}

export interface DayPlan {
  /** ISO date string YYYY-MM-DD (primary key) */
  date: string
  /** Time available for planned work, in whole minutes */
  capacityMinutes: number
  retroNote?: string
  createdAt: Date
  updatedAt: Date
}

export interface PlanItem {
  id: string
  /** ISO date string YYYY-MM-DD */
  date: string
  taskId: string
  plannedMinutes: number
  /** What you intend to do on this task that day */
  note?: string
  /** Position within the day's plan (ascending) */
  order: number
  createdAt: Date
}

export type PlanItemStatus = 'on_target' | 'over' | 'under' | 'not_started'

export interface PlanItemResult {
  item: PlanItem
  title: string
  parentTitle: string | null
  /** Task was marked done on this day */
  completedOnDay: boolean
  actualMinutes: number
  /** actual − planned */
  varianceMinutes: number
  status: PlanItemStatus
  running: boolean
  /** Subtasks whose time rolled into this planned item */
  includes: { taskId: string; title: string; minutes: number }[]
}

export interface OtherTaskTime {
  taskId: string
  title: string
  parentTitle: string | null
  minutes: number
  completedOnDay: boolean
  running: boolean
  entries: DailyEntrySlice[]
}

export interface DayRetro {
  date: string
  capacityMinutes: number
  plannedMinutes: number
  /** All time logged on the day */
  actualMinutes: number
  /** Time that counted toward planned items */
  plannedActualMinutes: number
  /** Time on tasks with no planned ancestor-or-self */
  otherMinutes: number
  /** plannedActual ÷ actual; null when nothing was logged */
  adherence: number | null
  /** 1 − Σ|actual − planned| ÷ Σ planned; null when nothing was planned */
  estimateAccuracy: number | null
  items: PlanItemResult[]
  otherTasks: OtherTaskTime[]
}
