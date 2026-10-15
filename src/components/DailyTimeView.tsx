import { format } from 'date-fns'
import { useId, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDailyTime } from '../hooks/useDailyTime'
import { formatMinutes } from '../formatTime'

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function entryTimeLabel(startAt: Date, endAt: Date | null, running: boolean) {
  const start = format(startAt, 'h:mm a')
  if (running) return `${start} · running`
  if (!endAt) return start
  return `${start} – ${format(endAt, 'h:mm a')}`
}

export default function DailyTimeView() {
  const formId = useId()
  const [day, setDay] = useState(todayIso)
  const { summary, loading, error } = useDailyTime(day)
  const daySummary = summary?.date === day ? summary : null
  const ready = !loading && !error && daySummary != null

  const chartData =
    daySummary?.byTask.map((row) => {
      const label = row.parentTitle
        ? `${row.parentTitle} / ${row.title}`
        : row.title
      return {
        name: label.length > 18 ? `${label.slice(0, 16)}…` : label,
        fullName: label,
        minutes: row.minutes,
      }
    }) ?? []

  return (
    <section className="panel" aria-labelledby="daily-heading">
      <div className="panel__toolbar">
        <div>
          <h1 id="daily-heading">Daily</h1>
          <p className="panel__lede">
            Time spent on a calendar day, including sessions that span midnight.
          </p>
        </div>
      </div>

      <div className="daily-picker task-form__field">
        <label htmlFor={`${formId}-day`}>Date</label>
        <input
          id={`${formId}-day`}
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>

      {!ready && !error ? (
        <p className="panel__status">Loading daily time…</p>
      ) : null}
      {error ? (
        <p className="panel__status panel__status--error" role="alert">
          {error.message}
        </p>
      ) : null}

      {ready && daySummary ? (
        <>
          <p className="daily-total" aria-live="polite">
            <span className="daily-total__label">Total</span>
            <span className="daily-total__value">
              {formatMinutes(daySummary.totalMinutes)}
            </span>
          </p>

          {daySummary.byTask.length === 0 ? (
            <p className="task-list__empty">No time logged on this day.</p>
          ) : (
            <>
              {chartData.length > 0 ? (
                <div className="daily-chart">
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(160, chartData.length * 36)}
                  >
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        type="number"
                        tick={{ fill: 'var(--text)', fontSize: 12 }}
                        tickFormatter={(v: number) => formatMinutes(v)}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fill: 'var(--text-h)', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value) => [
                          formatMinutes(Number(value ?? 0)),
                          'Time',
                        ]}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as
                            | { fullName?: string }
                            | undefined
                          return row?.fullName ?? ''
                        }}
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                      />
                      <Bar
                        dataKey="minutes"
                        fill="var(--accent)"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}

              <ul className="daily-breakdown">
                {daySummary.byTask.map((row) => (
                  <li key={row.taskId} className="daily-breakdown__task">
                    {row.parentTitle ? (
                      <p className="daily-breakdown__parent">{row.parentTitle}</p>
                    ) : null}
                    <div className="daily-breakdown__row">
                      <span className="daily-breakdown__title">{row.title}</span>
                      <span className="daily-breakdown__mins">
                        {formatMinutes(row.minutes)}
                      </span>
                    </div>
                    <ul className="daily-breakdown__entries">
                      {row.entries.map((entry) => (
                        <li key={entry.entryId} className="daily-breakdown__entry">
                          <span className="daily-breakdown__entry-time">
                            {entryTimeLabel(
                              entry.startAt,
                              entry.endAt,
                              entry.running,
                            )}
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
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}
    </section>
  )
}
