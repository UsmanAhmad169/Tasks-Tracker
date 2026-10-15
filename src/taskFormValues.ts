import { formatMinutesLong } from './formatTime'
import type { NewTask, Priority, Task, TaskStatus } from './types'

export type TaskFormValues = {
  title: string
  description: string
  priority: Priority
  status: TaskStatus
  startDate: string
  dueDate: string
  /** Human duration text, e.g. "2 hours" or "2h 30m" */
  eta: string
}

export function emptyTaskFormValues(): TaskFormValues {
  return {
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    startDate: '',
    dueDate: '',
    eta: '',
  }
}

export function taskFormValuesFromTask(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    startDate: task.startDate ?? '',
    dueDate: task.dueDate ?? '',
    eta:
      task.etaMinutes != null && task.etaMinutes > 0
        ? formatMinutesLong(task.etaMinutes)
        : '',
  }
}

export function taskFormToNewTask(
  values: TaskFormValues & {
    parentId: string | null
    etaMinutes?: number
  },
): NewTask {
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    priority: values.priority,
    status: values.status,
    parentId: values.parentId,
    startDate: values.startDate || undefined,
    dueDate: values.dueDate || undefined,
    etaMinutes: values.etaMinutes,
  }
}
