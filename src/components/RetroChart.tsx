import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMinutes } from '../formatTime'
import type { PlanItemResult } from '../types'

/** Planned vs actual per planned task. */
export default function RetroChart({ items }: { items: PlanItemResult[] }) {
  const chartData = items.map((r) => {
    const fullName = r.parentTitle ? `${r.parentTitle} / ${r.title}` : r.title
    return {
      name: r.title.length > 18 ? `${r.title.slice(0, 16)}…` : r.title,
      fullName,
      planned: r.item.plannedMinutes,
      actual: r.actualMinutes,
    }
  })

  if (chartData.length === 0) return null

  return (
    <figure className="daily-chart retro-chart">
      <figcaption className="retro-chart__legend">
        <span className="retro-chart__key retro-chart__key--planned">
          Planned
        </span>
        <span className="retro-chart__key retro-chart__key--actual">
          Actual
        </span>
      </figcaption>
      <ResponsiveContainer
        width="100%"
        height={Math.max(160, chartData.length * 52)}
      >
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
          barGap={2}
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
            formatter={(value, name) => [
              formatMinutes(Number(value ?? 0)),
              name === 'planned' ? 'Planned' : 'Actual',
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
            dataKey="planned"
            fill="var(--surface-muted)"
            stroke="var(--border)"
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
          />
          <Bar
            dataKey="actual"
            fill="var(--accent)"
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
