import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import { useId, useMemo, useState } from 'react'
import { useSpentMinutesByTask } from '../hooks/useSpentMinutes'
import { useTimelineTasks } from '../hooks/useTimeline'
import {
  SCHEDULE_HEALTH_FILTERS,
  compareByScheduleUrgency,
  getScheduleHealth,
  scheduleHealthLabel,
  toDayIso,
  type ScheduleHealth,
} from '../scheduleHealth'
import type { Priority, Task, TaskStatus } from '../types'

type DateRange = {
  start: Date
  end: Date
  totalDays: number
}

type TimelineBar = {
  task: Task
  parentTitle: string | null
  start: Date
  end: Date
  leftPct: number
  widthPct: number
  health: ScheduleHealth
  healthLabel: string
}

function toIsoDay(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function monthRange(anchor: Date): { startIso: string; endIso: string } {
  return {
    startIso: toIsoDay(startOfMonth(anchor)),
    endIso: toIsoDay(endOfMonth(anchor)),
  }
}

function makeRange(startIso: string, endIso: string): DateRange {
  let start = startOfDay(parseISO(startIso))
  let end = startOfDay(parseISO(endIso))
  if (end < start) {
    const tmp = start
    start = end
    end = tmp
  }
  return {
    start,
    end,
    totalDays: differenceInCalendarDays(end, start) + 1,
  }
}

function formatRangeLabel(range: DateRange): string {
  if (
    isSameMonth(range.start, range.end) &&
    isSameDay(range.start, startOfMonth(range.start)) &&
    isSameDay(range.end, endOfMonth(range.end))
  ) {
    return format(range.start, 'MMMM yyyy')
  }
  if (range.start.getFullYear() === range.end.getFullYear()) {
    return `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`
  }
  return `${format(range.start, 'MMM d, yyyy')} – ${format(range.end, 'MMM d, yyyy')}`
}

/** Start/due span for charting; missing startDate → single day on due date. */
function taskSpan(task: Task): { start: Date; end: Date } | null {
  if (!task.dueDate) return null
  const end = startOfDay(parseISO(toDayIso(task.dueDate)))
  const start = task.startDate
    ? startOfDay(parseISO(toDayIso(task.startDate)))
    : end
  return end < start ? { start: end, end } : { start, end }
}

function taskOverlapsRange(task: Task, range: DateRange): boolean {
  const span = taskSpan(task)
  if (!span) return false
  return span.start <= range.end && span.end >= range.start
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`priority-badge priority-badge--${priority}`}>
      {priority}
    </span>
  )
}

function statusLabel(status: TaskStatus): string {
  if (status === 'in_progress') return 'In progress'
  if (status === 'done') return 'Done'
  return 'To do'
}

function tickLabel(day: Date, totalDays: number): string {
  if (totalDays > 45) return format(day, 'M/d')
  if (totalDays > 21) return format(day, 'MMM d')
  if (totalDays > 10) return format(day, 'MMM d')
  return format(day, 'EEE d')
}

function dayOffsetPct(day: Date, range: DateRange): number {
  return (differenceInCalendarDays(day, range.start) / range.totalDays) * 100
}

function buildBars(
  tasks: Task[],
  byId: Map<string, Task>,
  range: DateRange,
  today: Date,
  spentByTask: Map<string, number>,
): TimelineBar[] {
  return tasks.flatMap((task) => {
    const dates = taskSpan(task)
    if (!dates) return []
    const { start, end } = dates
    const overlaps = start <= range.end && end >= range.start
    let leftPct: number
    let widthPct: number
    if (overlaps) {
      const visibleStart = maxDate([start, range.start])
      const visibleEnd = minDate([end, range.end])
      const offset = differenceInCalendarDays(visibleStart, range.start)
      const spanDays = Math.max(
        1,
        differenceInCalendarDays(visibleEnd, visibleStart) + 1,
      )
      leftPct = (offset / range.totalDays) * 100
      widthPct = (spanDays / range.totalDays) * 100
    } else {
      // Filtered tasks outside the window still get a row marker at the edge.
      leftPct = end < range.start ? 0 : 100 - 1.5
      widthPct = 1.5
    }
    const parent =
      task.parentId != null ? (byId.get(task.parentId) ?? null) : null
    const spent = spentByTask.get(task.id) ?? 0
    const health = getScheduleHealth(task, today, spent)

    return [
      {
        task,
        parentTitle: parent?.title ?? null,
        start,
        end,
        leftPct,
        widthPct,
        health,
        healthLabel: scheduleHealthLabel(health, task, today, spent),
      },
    ]
  })
}

export default function TimelineChart() {
  const formId = useId()
  const { tasks, byId, loading, error } = useTimelineTasks()
  const { byTask: spentByTask } = useSpentMinutesByTask()
  const [today] = useState(() => new Date())
  const [healthFilter, setHealthFilter] = useState<ScheduleHealth | null>(null)

  const initialMonth = useMemo(() => monthRange(today), [today])
  const [rangeStartIso, setRangeStartIso] = useState(initialMonth.startIso)
  const [rangeEndIso, setRangeEndIso] = useState(initialMonth.endIso)

  const range = useMemo(
    () => makeRange(rangeStartIso, rangeEndIso),
    [rangeStartIso, rangeEndIso],
  )
  const rangeLabel = formatRangeLabel(range)

  const tasksInRange = useMemo(
    () => tasks.filter((task) => taskOverlapsRange(task, range)),
    [tasks, range],
  )

  // Counts use every dated task, not only the chart window (so Due today
  // stays accurate after Fit tasks / narrow ranges).
  const healthCounts = useMemo(() => {
    const counts: Record<ScheduleHealth, number> = {
      overdue: 0,
      delayed: 0,
      due_today: 0,
      due_soon: 0,
      on_track: 0,
      done: 0,
    }
    for (const task of tasks) {
      const health = getScheduleHealth(
        task,
        today,
        spentByTask.get(task.id) ?? 0,
      )
      counts[health] += 1
    }
    return counts
  }, [tasks, today, spentByTask])

  const filteredTasks = useMemo(() => {
    const pool =
      healthFilter == null
        ? tasksInRange
        : tasks.filter(
            (task) =>
              getScheduleHealth(task, today, spentByTask.get(task.id) ?? 0) ===
              healthFilter,
          )
    return [...pool].sort((a, b) =>
      compareByScheduleUrgency(a, b, today, spentByTask),
    )
  }, [tasks, tasksInRange, healthFilter, today, spentByTask])

  const { bars, ticks, todayPct } = useMemo(() => {
    const allDays = eachDayOfInterval({ start: range.start, end: range.end })
    const step =
      range.totalDays <= 14
        ? 1
        : range.totalDays <= 31
          ? 2
          : Math.ceil(range.totalDays / 14)
    const ticks = allDays.filter((_, i) => i % step === 0)

    let todayPct: number | null = null
    if (today >= range.start && today <= range.end) {
      const offset = differenceInCalendarDays(today, range.start)
      todayPct = ((offset + 0.5) / range.totalDays) * 100
    }

    return {
      bars: buildBars(filteredTasks, byId, range, today, spentByTask),
      ticks,
      todayPct,
    }
  }, [filteredTasks, byId, range, today, spentByTask])

  const setMonth = (anchor: Date) => {
    const next = monthRange(anchor)
    setRangeStartIso(next.startIso)
    setRangeEndIso(next.endIso)
    setHealthFilter(null)
  }

  const fitToTasks = () => {
    if (tasks.length === 0) {
      setMonth(today)
      return
    }
    const spans = tasks.map(taskSpan).filter((s) => s != null)
    if (spans.length === 0) {
      setMonth(today)
      return
    }
    setRangeStartIso(toIsoDay(minDate(spans.map((s) => s.start))))
    setRangeEndIso(toIsoDay(maxDate(spans.map((s) => s.end))))
    setHealthFilter(null)
  }

  const onStartChange = (value: string) => {
    if (!value) return
    setRangeStartIso(value)
    if (value > rangeEndIso) setRangeEndIso(value)
  }

  const onEndChange = (value: string) => {
    if (!value) return
    setRangeEndIso(value)
    if (value < rangeStartIso) setRangeStartIso(value)
  }

  const toggleFilter = (id: ScheduleHealth) => {
    setHealthFilter((prev) => (prev === id ? null : id))
  }

  const monthAnchor = startOfMonth(range.start)

  return (
    <section
      className="panel panel--timeline"
      aria-labelledby="timeline-heading"
    >
      <div className="panel__toolbar">
        <div>
          <h1 id="timeline-heading">Timeline</h1>
          <p className="panel__lede">
            Pending, due, and delayed work by schedule
            {rangeLabel ? ` · ${rangeLabel}` : ''}.
          </p>
        </div>
      </div>

      <div className="gantt__range" role="group" aria-label="Chart date range">
        <div className="gantt__range-fields">
          <div className="task-form__field gantt__range-field">
            <label htmlFor={`${formId}-from`}>From</label>
            <input
              id={`${formId}-from`}
              type="date"
              value={rangeStartIso}
              onChange={(e) => onStartChange(e.target.value)}
            />
          </div>
          <div className="task-form__field gantt__range-field">
            <label htmlFor={`${formId}-to`}>To</label>
            <input
              id={`${formId}-to`}
              type="date"
              value={rangeEndIso}
              min={rangeStartIso}
              onChange={(e) => onEndChange(e.target.value)}
            />
          </div>
        </div>
        <div className="gantt__range-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMonth(addMonths(monthAnchor, -1))}
          >
            Prev month
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMonth(today)}
          >
            This month
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMonth(addMonths(monthAnchor, 1))}
          >
            Next month
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={fitToTasks}
            disabled={tasks.length === 0}
          >
            Fit tasks
          </button>
        </div>
      </div>

      {loading ? <p className="panel__status">Loading timeline…</p> : null}
      {error ? (
        <p className="panel__status panel__status--error" role="alert">
          {error.message}
        </p>
      ) : null}

      {!loading && !error && tasks.length === 0 ? (
        <p className="task-list__empty">No tasks with a due date yet.</p>
      ) : null}

      {!loading && !error && tasks.length > 0 ? (
        <div
          className="gantt__filters"
          role="toolbar"
          aria-label="Filter by schedule health"
        >
          <button
            type="button"
            className={`gantt__chip${healthFilter == null ? ' is-active' : ''}`}
            aria-pressed={healthFilter == null}
            onClick={() => setHealthFilter(null)}
          >
            All
            <span className="gantt__chip-count">{tasksInRange.length}</span>
          </button>
          {SCHEDULE_HEALTH_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`gantt__chip gantt__chip--${id}${
                healthFilter === id ? ' is-active' : ''
              }`}
              aria-pressed={healthFilter === id}
              onClick={() => toggleFilter(id)}
              disabled={healthCounts[id] === 0}
            >
              {label}
              <span className="gantt__chip-count">{healthCounts[id]}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!loading &&
      !error &&
      tasks.length > 0 &&
      healthFilter == null &&
      tasksInRange.length === 0 ? (
        <p className="task-list__empty">
          No dated tasks overlap {rangeLabel}. Try another range or Fit tasks.
        </p>
      ) : null}

      {!loading && !error && filteredTasks.length === 0 && healthFilter != null ? (
        <p className="task-list__empty">No tasks in this filter.</p>
      ) : null}

      {!loading && !error && bars.length > 0 ? (
        <div className="gantt" role="img" aria-label="Task timeline chart">
          <div className="gantt__axis" aria-hidden="true">
            <div className="gantt__label-col" />
            <div className="gantt__track-col">
              <div className="gantt__ticks">
                {ticks.map((day) => (
                  <span
                    key={day.toISOString()}
                    className={`gantt__tick${
                      isSameDay(day, today) ? ' gantt__tick--today' : ''
                    }`}
                    style={{ left: `${dayOffsetPct(day, range)}%` }}
                  >
                    {tickLabel(day, range.totalDays)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <ul className="gantt__rows">
            {bars.map(
              ({
                task,
                parentTitle,
                start,
                end,
                leftPct,
                widthPct,
                health,
                healthLabel,
              }) => {
                const done = health === 'done'
                return (
                  <li
                    key={task.id}
                    className={`gantt__row${done ? ' gantt__row--done' : ''}`}
                  >
                    <div className="gantt__label">
                      {parentTitle ? (
                        <p className="gantt__parent">{parentTitle}</p>
                      ) : null}
                      <div className="gantt__title-line">
                        <span className="gantt__title">{task.title}</span>
                        <PriorityBadge priority={task.priority} />
                      </div>
                      <p className="gantt__meta">
                        <span>{statusLabel(task.status)}</span>
                        <span aria-hidden="true"> · </span>
                        <span
                          className={`gantt__health gantt__health--${health}`}
                        >
                          {healthLabel}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {format(start, 'MMM d')} – {format(end, 'MMM d')}
                        </span>
                      </p>
                    </div>
                    <div className="gantt__track">
                      {todayPct != null ? (
                        <span
                          className="gantt__today"
                          style={{ left: `${todayPct}%` }}
                          title="Today"
                        />
                      ) : null}
                      <div
                        className={`gantt__bar gantt__bar--${health}${
                          task.status === 'in_progress'
                            ? ' gantt__bar--active'
                            : ''
                        }`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${Math.max(widthPct, 1.5)}%`,
                        }}
                        title={`${task.title}: ${healthLabel} · ${format(start, 'MMM d')} – ${format(end, 'MMM d')}`}
                      >
                        <span className="gantt__bar-label">
                          {format(start, 'M/d')}–{format(end, 'M/d')}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              },
            )}
          </ul>

          <div className="gantt__legend" aria-hidden="true">
            {SCHEDULE_HEALTH_FILTERS.map(({ id, label }) => (
              <span key={id} className="gantt__legend-item">
                <span className={`gantt__swatch gantt__swatch--${id}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
