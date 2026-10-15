import { format, isToday, isYesterday } from 'date-fns'
import { useMemo } from 'react'
import { useHistory, type HistoryItem } from '../hooks/useHistory'
import { formatMinutes } from '../formatTime'
import type { Priority } from '../types'

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`priority-badge priority-badge--${priority}`}>
      {priority}
    </span>
  )
}

type HistoryGroup = {
  key: string
  label: string
  items: HistoryItem[]
}

function dayKey(date: Date | undefined): string {
  if (!date) return 'unknown'
  return format(date, 'yyyy-MM-dd')
}

function dayLabel(date: Date | undefined): string {
  if (!date) return 'Unknown date'
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMM d, yyyy')
}

function groupByCompletedDate(items: HistoryItem[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>()

  for (const item of items) {
    const key = dayKey(item.task.completedAt)
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      groups.set(key, {
        key,
        label: dayLabel(item.task.completedAt),
        items: [item],
      })
    }
  }

  // Preserve completion order from useHistory (newest first)
  return [...groups.values()]
}

export default function HistoryView() {
  const { items, loading, error } = useHistory()
  const groups = useMemo(() => groupByCompletedDate(items), [items])

  return (
    <section className="panel" aria-labelledby="history-heading">
      <div className="panel__toolbar">
        <div>
          <h1 id="history-heading">History</h1>
          <p className="panel__lede">
            Completed tasks with completion date and total time spent.
          </p>
        </div>
      </div>

      {loading ? <p className="panel__status">Loading history…</p> : null}
      {error ? (
        <p className="panel__status panel__status--error" role="alert">
          {error.message}
        </p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="task-list__empty">No completed tasks yet.</p>
      ) : null}

      {!loading && !error && groups.length > 0 ? (
        <div className="history-groups">
          {groups.map((group) => (
            <section
              key={group.key}
              className="history-group"
              aria-labelledby={`history-day-${group.key}`}
            >
              <h2
                id={`history-day-${group.key}`}
                className="history-group__heading"
              >
                {group.label}
              </h2>
              <ul className="history-list">
                {group.items.map(({ task, parentTitle, totalMinutes }) => (
                  <li key={task.id} className="history-item">
                    {parentTitle ? (
                      <p className="history-item__parent">{parentTitle}</p>
                    ) : null}
                    <div className="history-item__title-line">
                      <span className="history-item__title">{task.title}</span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    {task.description ? (
                      <p className="history-item__desc">{task.description}</p>
                    ) : null}
                    <div className="history-item__meta">
                      <span className="history-item__completed">
                        {task.completedAt
                          ? format(task.completedAt, 'h:mm a')
                          : '—'}
                      </span>
                      <span
                        className={`history-item__time${
                          task.etaMinutes != null &&
                          totalMinutes > task.etaMinutes
                            ? ' history-item__time--over'
                            : ''
                        }`}
                        title={
                          task.etaMinutes != null
                            ? `Spent ${formatMinutes(totalMinutes)} of ETA ${formatMinutes(task.etaMinutes)}`
                            : undefined
                        }
                      >
                        {formatMinutes(totalMinutes)}
                        {task.etaMinutes != null
                          ? ` / ${formatMinutes(task.etaMinutes)}`
                          : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  )
}
