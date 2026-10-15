import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSameDay,
  parseISO,
} from 'date-fns'
import { useMemo, useState } from 'react'
import { useTimelineTasks } from '../hooks/useTimeline'
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
  if (totalDays > 21) return format(day, 'M/d')
  if (totalDays > 10) return format(day, 'MMM d')
  return format(day, 'EEE d')
}

function dayOffsetPct(day: Date, range: DateRange): number {
  return (differenceInCalendarDays(day, range.start) / range.totalDays) * 100
}

function buildRange(tasks: Task[]): DateRange {
  const starts = tasks.map((t) => parseISO(t.startDate!))
  const ends = tasks.map((t) => parseISO(t.dueDate!))
  const minStart = starts.reduce((a, b) => (a < b ? a : b))
  const maxEnd = ends.reduce((a, b) => (a > b ? a : b))
  const start = addDays(minStart, -1)
  const end = addDays(maxEnd, 1)
  return {
    start,
    end,
    totalDays: differenceInCalendarDays(end, start) + 1,
  }
}

function buildBars(
  tasks: Task[],
  byId: Map<string, Task>,
  range: DateRange,
): TimelineBar[] {
  return tasks.map((task) => {
    const start = parseISO(task.startDate!)
    const end = parseISO(task.dueDate!)
    const offset = differenceInCalendarDays(start, range.start)
    const span = Math.max(1, differenceInCalendarDays(end, start) + 1)
    const parent =
      task.parentId != null ? (byId.get(task.parentId) ?? null) : null

    return {
      task,
      parentTitle: parent?.title ?? null,
      start,
      end,
      leftPct: (offset / range.totalDays) * 100,
      widthPct: (span / range.totalDays) * 100,
    }
  })
}

export default function TimelineChart() {
  const { tasks, byId, loading, error } = useTimelineTasks()
  const [today] = useState(() => new Date())

  const { bars, ticks, todayPct, rangeLabel, range } = useMemo(() => {
    if (tasks.length === 0) {
      return {
        bars: [] as TimelineBar[],
        ticks: [] as Date[],
        todayPct: null as number | null,
        rangeLabel: '',
        range: null as DateRange | null,
      }
    }

    const range = buildRange(tasks)
    const allDays = eachDayOfInterval({ start: range.start, end: range.end })
    const step =
      range.totalDays <= 14
        ? 1
        : range.totalDays <= 28
          ? 2
          : Math.ceil(range.totalDays / 12)
    const ticks = allDays.filter((_, i) => i % step === 0)

    let todayPct: number | null = null
    if (today >= range.start && today <= addDays(range.end, 1)) {
      const offset = differenceInCalendarDays(today, range.start)
      todayPct = ((offset + 0.5) / range.totalDays) * 100
    }

    const minStart = parseISO(
      tasks.reduce(
        (a, t) => (t.startDate! < a ? t.startDate! : a),
        tasks[0].startDate!,
      ),
    )
    const maxEnd = parseISO(
      tasks.reduce(
        (a, t) => (t.dueDate! > a ? t.dueDate! : a),
        tasks[0].dueDate!,
      ),
    )

    return {
      bars: buildBars(tasks, byId, range),
      ticks,
      todayPct,
      rangeLabel: `${format(minStart, 'MMM d')} – ${format(maxEnd, 'MMM d, yyyy')}`,
      range,
    }
  }, [tasks, byId, today])

  return (
    <section
      className="panel panel--timeline"
      aria-labelledby="timeline-heading"
    >
      <div className="panel__toolbar">
        <div>
          <h1 id="timeline-heading">Timeline</h1>
          <p className="panel__lede">
            Task schedules from start to due date
            {rangeLabel ? ` · ${rangeLabel}` : ''}.
          </p>
        </div>
      </div>

      {loading ? <p className="panel__status">Loading timeline…</p> : null}
      {error ? (
        <p className="panel__status panel__status--error" role="alert">
          {error.message}
        </p>
      ) : null}

      {!loading && !error && tasks.length === 0 ? (
        <p className="task-list__empty">
          No tasks with both a start and due date yet.
        </p>
      ) : null}

      {!loading && !error && bars.length > 0 && range ? (
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
            {bars.map(({ task, parentTitle, start, end, leftPct, widthPct }) => {
              const done = task.status === 'done'
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
                      className={`gantt__bar gantt__bar--${task.priority}${
                        done ? ' gantt__bar--done' : ''
                      }${
                        task.status === 'in_progress'
                          ? ' gantt__bar--active'
                          : ''
                      }`}
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, 1.5)}%`,
                      }}
                      title={`${task.title}: ${format(start, 'MMM d')} – ${format(end, 'MMM d')}`}
                    >
                      <span className="gantt__bar-label">
                        {format(start, 'M/d')}–{format(end, 'M/d')}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="gantt__legend" aria-hidden="true">
            <span className="gantt__legend-item">
              <span className="gantt__swatch gantt__swatch--high" />
              High
            </span>
            <span className="gantt__legend-item">
              <span className="gantt__swatch gantt__swatch--medium" />
              Medium
            </span>
            <span className="gantt__legend-item">
              <span className="gantt__swatch gantt__swatch--low" />
              Low
            </span>
            <span className="gantt__legend-item gantt__legend-item--muted">
              Done tasks are muted
            </span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
