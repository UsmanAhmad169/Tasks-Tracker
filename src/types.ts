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
