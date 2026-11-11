import { formatMinutes } from '../formatTime'
import type { DayRetro } from '../types'

function formatPercent(ratio: number | null): string {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`
}

type RetroSummaryProps = {
  retro: DayRetro
  /** Today's numbers are partial */
  soFar: boolean
}

export default function RetroSummary({ retro, soFar }: RetroSummaryProps) {
  const tiles = [
    {
      label: 'Planned',
      value: formatMinutes(retro.plannedMinutes),
      detail: `of ${formatMinutes(retro.capacityMinutes)} available`,
    },
    {
      label: soFar ? 'Actual so far' : 'Actual',
      value: formatMinutes(retro.actualMinutes),
      detail: `${formatMinutes(retro.plannedActualMinutes)} on plan`,
    },
    {
      label: 'Adherence',
      value: formatPercent(retro.adherence),
      detail: 'of time went to planned tasks',
    },
    {
      label: 'Est. accuracy',
      value: soFar ? '—' : formatPercent(retro.estimateAccuracy),
      detail: soFar ? 'shown once the day is over' : 'planned vs actual per task',
    },
    {
      label: 'Other tasks',
      value: formatMinutes(retro.otherMinutes),
      detail: `${retro.otherTasks.length} unplanned task${
        retro.otherTasks.length === 1 ? '' : 's'
      }`,
    },
  ]

  return (
    <dl className="retro-tiles">
      {tiles.map((tile) => (
        <div key={tile.label} className="retro-tile">
          <dt className="retro-tile__label">{tile.label}</dt>
          <dd className="retro-tile__value">{tile.value}</dd>
          <dd className="retro-tile__detail">{tile.detail}</dd>
        </div>
      ))}
    </dl>
  )
}
