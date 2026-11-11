import { format } from 'date-fns'
import { useState } from 'react'
import { formatMinutes } from '../formatTime'
import type { OtherTaskTime } from '../types'

function entryTimeLabel(startAt: Date, endAt: Date | null, running: boolean) {
  const start = format(startAt, 'h:mm a')
  if (running) return `${start} · running`
  if (!endAt) return start
  return `${start} – ${format(endAt, 'h:mm a')}`
}

type OtherTasksListProps = {
  tasks: OtherTaskTime[]
  totalMinutes: number
  actualMinutes: number
  /** e.g. "tomorrow" or "today" */
  planTargetLabel: string
  onPlan: (taskId: string) => Promise<unknown>
}

export default function OtherTasksList({
  tasks,
  totalMinutes,
  actualMinutes,
  planTargetLabel,
  onPlan,
}: OtherTasksListProps) {
  const [plannedIds, setPlannedIds] = useState<Set<string>>(() => new Set())
  const share =
    actualMinutes > 0 ? Math.round((totalMinutes / actualMinutes) * 100) : 0

  const handlePlan = async (taskId: string) => {
    await onPlan(taskId)
    setPlannedIds((prev) => new Set(prev).add(taskId))
  }

  return (
    <section className="plan-section" aria-labelledby="other-tasks-heading">
      <div className="plan-section__header">
        <h2 id="other-tasks-heading" className="plan-section__title">
          Other tasks worked on
        </h2>
        <span className="plan-section__meta">
          {formatMinutes(totalMinutes)}
          {actualMinutes > 0 ? ` · ${share}% of day` : ''}
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="plan-section__empty">
          {actualMinutes > 0
            ? 'Nothing outside the plan — all logged time went to planned tasks.'
            : 'No time logged yet.'}
        </p>
      ) : (
        <ul className="daily-breakdown">
          {tasks.map((row) => (
            <li key={row.taskId} className="daily-breakdown__task">
              {row.parentTitle ? (
                <p className="daily-breakdown__parent">{row.parentTitle}</p>
              ) : null}
              <div className="daily-breakdown__row">
                <span className="daily-breakdown__title">
                  {row.title}
                  {row.completedOnDay ? (
                    <span className="plan-chip plan-chip--done">✓ Done</span>
                  ) : null}
                </span>
                <span className="daily-breakdown__mins">
                  {formatMinutes(row.minutes)}
                </span>
              </div>
              <div className="other-task__footer">
                <details className="other-task__sessions">
                  <summary>
                    {row.entries.length} session
                    {row.entries.length === 1 ? '' : 's'}
                    {row.running ? ' · running' : ''}
                  </summary>
                  <ul className="daily-breakdown__entries">
                    {row.entries.map((entry) => (
                      <li key={entry.entryId} className="daily-breakdown__entry">
                        <span className="daily-breakdown__entry-time">
                          {entryTimeLabel(entry.startAt, entry.endAt, entry.running)}
                        </span>
                        <span className="daily-breakdown__entry-mins">
                          {formatMinutes(entry.minutes)}
                        </span>
                        {entry.note ? (
                          <span className="daily-breakdown__entry-note">
                            {entry.note}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
                {!row.completedOnDay ? (
                  plannedIds.has(row.taskId) ? (
                    <span className="other-task__added" role="status">
                      Added to {planTargetLabel}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => handlePlan(row.taskId)}
                    >
                      + Plan for {planTargetLabel}
                    </button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
