import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { parseDurationToMinutes } from '../formatTime'
import type { Priority, Task, TaskStatus } from '../types'
import {
  emptyTaskFormValues,
  taskFormValuesFromTask,
  type TaskFormValues,
} from '../taskFormValues'

type TaskFormProps = {
  /** When set, form edits this task; otherwise creates a new one. */
  task?: Task | null
  /** Parent for a new subtask (ignored when editing). */
  parentId?: string | null
  parentTitle?: string | null
  onSubmit: (
    values: TaskFormValues & {
      parentId: string | null
      etaMinutes?: number
    },
  ) => Promise<void> | void
  onCancel: () => void
}

const PRIORITIES: Priority[] = ['high', 'medium', 'low']
const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']

export default function TaskForm({
  task = null,
  parentId = null,
  parentTitle = null,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const formId = useId()
  const isEdit = Boolean(task)
  const [values, setValues] = useState<TaskFormValues>(() =>
    task ? taskFormValuesFromTask(task) : emptyTaskFormValues(),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = <K extends keyof TaskFormValues>(
    key: K,
    value: TaskFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!values.title.trim()) {
      setError('Title is required.')
      return
    }
    if (
      values.startDate &&
      values.dueDate &&
      values.dueDate < values.startDate
    ) {
      setError('Due date must be on or after the start date.')
      return
    }

    let etaMinutes: number | undefined
    if (values.eta.trim()) {
      const parsed = parseDurationToMinutes(values.eta)
      if (parsed == null) {
        setError(
          'ETA must look like “2 hours”, “2h 30m”, or “90” (minutes).',
        )
        return
      }
      etaMinutes = parsed
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        ...values,
        etaMinutes,
        parentId: isEdit ? (task?.parentId ?? null) : parentId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save task.')
    } finally {
      setSaving(false)
    }
  }

  const heading = isEdit
    ? 'Edit task'
    : parentId
      ? 'Add subtask'
      : 'New task'

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <header className="task-form__header">
        <h2 id={`${formId}-title`}>{heading}</h2>
        {parentTitle && !isEdit ? (
          <p className="task-form__parent">Under “{parentTitle}”</p>
        ) : null}
      </header>

      <div className="task-form__field">
        <label htmlFor={`${formId}-title-input`}>Title</label>
        <input
          id={`${formId}-title-input`}
          type="text"
          value={values.title}
          onChange={(e) => setField('title', e.target.value)}
          placeholder="What needs doing?"
          autoFocus
          required
        />
      </div>

      <div className="task-form__field">
        <label htmlFor={`${formId}-desc`}>Description</label>
        <textarea
          id={`${formId}-desc`}
          value={values.description}
          onChange={(e) => setField('description', e.target.value)}
          rows={3}
          placeholder="Optional notes"
        />
      </div>

      <div className="task-form__row">
        <div className="task-form__field">
          <label htmlFor={`${formId}-priority`}>Priority</label>
          <select
            id={`${formId}-priority`}
            value={values.priority}
            onChange={(e) => setField('priority', e.target.value as Priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="task-form__field">
          <label htmlFor={`${formId}-status`}>Status</label>
          <select
            id={`${formId}-status`}
            value={values.status}
            onChange={(e) => setField('status', e.target.value as TaskStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'in_progress' ? 'In progress' : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="task-form__row">
        <div className="task-form__field">
          <label htmlFor={`${formId}-start`}>Start date</label>
          <input
            id={`${formId}-start`}
            type="date"
            value={values.startDate}
            onChange={(e) => setField('startDate', e.target.value)}
          />
        </div>

        <div className="task-form__field">
          <label htmlFor={`${formId}-due`}>Due date</label>
          <input
            id={`${formId}-due`}
            type="date"
            value={values.dueDate}
            onChange={(e) => setField('dueDate', e.target.value)}
          />
        </div>
      </div>

      <div className="task-form__field">
        <label htmlFor={`${formId}-eta`}>ETA</label>
        <input
          id={`${formId}-eta`}
          type="text"
          value={values.eta}
          onChange={(e) => setField('eta', e.target.value)}
          placeholder="e.g. 2 hours or 2 hours 30 minutes"
          autoComplete="off"
        />
        <p className="task-form__hint">
          Optional estimate. Also accepts 2h, 2h 30m, 2:30, or minutes.
        </p>
      </div>

      {error ? (
        <p className="task-form__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="task-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}
        </button>
      </div>
    </form>
  )
}
