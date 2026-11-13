import { useId, useMemo, useState } from 'react'
import { formatMinutes } from '../formatTime'
import { planCandidates } from '../planSuggestions'
import type { Task } from '../types'

const SUGGESTION_LIMIT = 5
const SEARCH_LIMIT = 8
const NEW_TASK_MINUTES = 60

type PlanTaskPickerProps = {
  dayIso: string
  tasks: Task[]
  plannedTaskIds: Set<string>
  spentByTask: Map<string, number>
  freeCapacityMinutes: number
  onAdd: (taskId: string, minutes: number) => Promise<unknown>
  onCreate: (title: string, minutes: number) => Promise<unknown>
}

export default function PlanTaskPicker({
  dayIso,
  tasks,
  plannedTaskIds,
  spentByTask,
  freeCapacityMinutes,
  onAdd,
  onCreate,
}: PlanTaskPickerProps) {
  const searchId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(
    () =>
      planCandidates({
        dayIso,
        tasks,
        plannedTaskIds,
        spentByTask,
        freeCapacityMinutes,
      }),
    [dayIso, tasks, plannedTaskIds, spentByTask, freeCapacityMinutes],
  )

  const trimmed = query.trim()
  const needle = trimmed.toLowerCase()
  const visible = needle
    ? candidates
        .filter(
          (c) =>
            c.task.title.toLowerCase().includes(needle) ||
            (c.parentTitle?.toLowerCase().includes(needle) ?? false),
        )
        .slice(0, SEARCH_LIMIT)
    : candidates.slice(0, SUGGESTION_LIMIT)
  const exactMatch = candidates.some(
    (c) => c.task.title.toLowerCase() === needle,
  )

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setQuery('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to plan.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn--ghost plan-picker__open"
        onClick={() => setOpen(true)}
      >
        + Add task
      </button>
    )
  }

  return (
    <div className="plan-picker">
      <div className="plan-picker__header">
        <label htmlFor={searchId} className="plan-picker__label">
          {needle ? 'Matching tasks' : 'Suggested'}
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            setOpen(false)
            setQuery('')
          }}
        >
          Close
        </button>
      </div>

      <input
        id={searchId}
        type="search"
        className="plan-picker__search"
        placeholder="Search active tasks or type a new one…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={busy}
        autoFocus
      />

      {visible.length === 0 && !trimmed ? (
        <p className="plan-picker__empty">
          Every active task is already on this plan.
        </p>
      ) : null}

      <ul className="plan-picker__list">
        {visible.map(({ task, parentTitle, hint, defaultMinutes }) => (
          <li key={task.id} className="plan-picker__item">
            <div className="plan-picker__item-text">
              <span className="plan-picker__item-title">
                {parentTitle ? (
                  <span className="plan-picker__item-parent">
                    {parentTitle} /{' '}
                  </span>
                ) : null}
                {task.title}
              </span>
              {hint ? <span className="plan-picker__item-hint">{hint}</span> : null}
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy}
              onClick={() => run(() => onAdd(task.id, defaultMinutes))}
              aria-label={`Add ${task.title} for ${formatMinutes(defaultMinutes)}`}
            >
              + {formatMinutes(defaultMinutes)}
            </button>
          </li>
        ))}
        {trimmed && !exactMatch ? (
          <li className="plan-picker__item plan-picker__item--create">
            <span className="plan-picker__item-title">
              Create task “{trimmed}”
            </span>
            <button
              type="button"
              className="btn btn--primary btn--small"
              disabled={busy}
              onClick={() => run(() => onCreate(trimmed, NEW_TASK_MINUTES))}
            >
              + {formatMinutes(NEW_TASK_MINUTES)}
            </button>
          </li>
        ) : null}
      </ul>

      <p className="plan-picker__hint">
        Adjust planned time on the row after adding.
      </p>

      {error ? (
        <p className="time-log__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
