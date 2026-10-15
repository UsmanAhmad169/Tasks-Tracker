import type { NewTask, Priority, Task, TaskStatus } from './types'

export type TaskFormValues = {
  title: string
  description: string
  priority: Priority
  status: TaskStatus
  startDate: string
  dueDate: string
}

export function emptyTaskFormValues(): TaskFormValues {
  return {
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    startDate: '',
    dueDate: '',
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
  }
}

export function taskFormToNewTask(
  values: TaskFormValues & { parentId: string | null },
): NewTask {
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    priority: values.priority,
    status: values.status,
    parentId: values.parentId,
    startDate: values.startDate || undefined,
    dueDate: values.dueDate || undefined,
  }
}
