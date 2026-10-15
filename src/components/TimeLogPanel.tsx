import { format, parseISO, startOfDay } from 'date-fns'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { entryDurationMinutes } from '../db'
import { formatMinutes } from '../formatTime'
import { useTaskTimeEntries } from '../hooks/useTaskTimeEntries'
import { formatElapsed } from '../hooks/useTimer'
import type { Task, TimeEntry } from '../types'

type TimeLogPanelProps = {
  task: Task
  running: TimeEntry | null
  elapsedSeconds: number
  busy: boolean
  error: Error | null
  onStart: (taskId: string) => Promise<unknown>
  onStop: () => Promise<unknown>
  onAddManual: (input: {
    taskId: string
    durationMinutes: number
    startAt: Date
    note?: string
  }) => Promise<unknown>
}

export default function TimeLogPanel({
  task,
  running,
  elapsedSeconds,
  busy,
  error,
  onStart,
  onStop,
  onAddManual,
}: TimeLogPanelProps) {
  const formId = useId()
  const isRunningHere = running?.taskId === task.id
  const { entries } = useTaskTimeEntries(task.id)
  const totalMinutes = entries.reduce(
    (sum, entry) => sum + entryDurationMinutes(entry),
    0,
  )

  const [manualDate, setManualDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  )
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [manualSaved, setManualSaved] = useState(false)

  const handleStart = async () => {
    setFormError(null)
    setManualSaved(false)
    try {
      await onStart(task.id)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not start timer.')
    }
  }

  const handleStop = async () => {
    setFormError(null)
    setManualSaved(false)
    try {
      await onStop()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not stop timer.')
    }
  }

  const handleManualSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    setManualSaved(false)

    const minutes = Number(durationMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isInteger(minutes)) {
      setFormError('Duration must be a positive whole number of minutes.')
      return
    }

    if (!manualDate) {
      setFormError('Date is required.')
      return
    }

    try {
      await onAddManual({
        taskId: task.id,
        durationMinutes: minutes,
        startAt: startOfDay(parseISO(manualDate)),
        note: note.trim() || undefined,
      })
      setNote('')
      setManualSaved(true)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not save time entry.',
      )
    }
  }

  return (
    <div className="time-log time-log--on-task" aria-label={`Time log for ${task.title}`}>
      <div className="time-log__timer">
        <h3 className="time-log__subheading">Timer</h3>
        {isRunningHere ? (
          <div className="time-log__running">
            <p className="time-log__elapsed" aria-live="polite">
              {formatElapsed(elapsedSeconds)}
            </p>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={handleStop}
              disabled={busy}
            >
              {busy ? 'Stopping…' : 'Stop'}
            </button>
          </div>
        ) : (
          <div className="time-log__start-row time-log__start-row--compact">
            {running ? (
              <p className="time-log__status">
                Timer running on another task — Start switches it here.
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={handleStart}
              disabled={busy}
            >
              {busy ? 'Starting…' : 'Start'}
            </button>
          </div>
        )}
      </div>

      <form className="time-log__manual" onSubmit={handleManualSubmit} noValidate>
        <h3 className="time-log__subheading">Manual entry</h3>

        <div className="task-form__row">
          <div className="task-form__field">
            <label htmlFor={`${formId}-date`}>Date</label>
            <input
              id={`${formId}-date`}
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="task-form__field">
            <label htmlFor={`${formId}-duration`}>Duration (minutes)</label>
            <input
              id={`${formId}-duration`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              disabled={busy}
              required
            />
          </div>
        </div>

        <div className="task-form__field">
          <label htmlFor={`${formId}-note`}>Note</label>
          <input
            id={`${formId}-note`}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            disabled={busy}
          />
        </div>

        <div className="time-log__manual-actions">
          <button type="submit" className="btn btn--ghost btn--small" disabled={busy}>
            {busy ? 'Saving…' : 'Add entry'}
          </button>
          {manualSaved ? (
            <span className="time-log__saved" role="status">
              Entry saved
            </span>
          ) : null}
        </div>
      </form>

      {formError || error ? (
        <p className="time-log__error" role="alert">
          {formError ?? error?.message}
        </p>
      ) : null}

      <div className="time-log__entries">
        <h3 className="time-log__subheading">
          Logged{totalMinutes > 0 ? ` · ${formatMinutes(totalMinutes)}` : ''}
        </h3>
        {entries.length === 0 ? (
          <p className="time-log__status">No entries yet.</p>
        ) : (
          <ul className="time-log__entry-list">
            {entries.map((entry) => {
              const mins = entryDurationMinutes(entry)
              const isOpen = entry.endAt == null
              return (
                <li key={entry.id} className="time-log__entry">
                  <span className="time-log__entry-date">
                    {format(new Date(entry.startAt), 'MMM d')}
                    {isOpen ? ' · running' : ''}
                  </span>
                  <span className="time-log__entry-mins">
                    {isOpen ? formatElapsed(elapsedSeconds) : formatMinutes(mins)}
                  </span>
                  {entry.note ? (
                    <span className="time-log__entry-note">{entry.note}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
