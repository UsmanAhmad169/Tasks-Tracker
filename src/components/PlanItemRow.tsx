import { useLayoutEffect, useRef, useState } from 'react'
import { formatMinutes, formatSignedMinutes } from '../formatTime'
import { formatElapsed } from '../hooks/useTimer'
import type { PlanItemResult, PlanItemStatus } from '../types'
import DurationInput from './DurationInput'

export type PlanMode = 'future' | 'today' | 'past'

const STATUS_LABEL: Record<PlanItemStatus, string> = {
  on_target: 'On target',
  over: 'Over',
  under: 'Under',
  not_started: 'Not started',
}

/**
 * Inline "what will I do" note. Saves on blur; Escape reverts. Remount with a
 * `key` on `note` to pick up external changes.
 */
function PlanNoteInput({
  note,
  title,
  onSave,
}: {
  note: string
  title: string
  onSave: (note: string) => void
}) {
  const [draft, setDraft] = useState(note)
  // Escape blurs before the reverted draft renders; skip that blur's save
  const discarding = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow to fit the text (field-sizing: content isn't supported everywhere)
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [draft])

  return (
    <textarea
      ref={textareaRef}
      className="plan-row__note"
      rows={1}
      placeholder="What will you work on?"
      aria-label={`What you plan to do on ${title}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (discarding.current) {
          discarding.current = false
          return
        }
        if (draft.trim() !== note) onSave(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          discarding.current = true
          setDraft(note)
          e.currentTarget.blur()
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

type PlanItemRowProps = {
  result: PlanItemResult
  mode: PlanMode
  isFirst: boolean
  isLast: boolean
  /** Timer is running on this exact task */
  timerHere: boolean
  elapsedSeconds: number
  timerBusy: boolean
  onStart: (taskId: string) => void
  onStop: () => void
  onPlannedChange: (minutes: number) => void
  onNoteChange: (note: string) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

export default function PlanItemRow({
  result,
  mode,
  isFirst,
  isLast,
  timerHere,
  elapsedSeconds,
  timerBusy,
  onStart,
  onStop,
  onPlannedChange,
  onNoteChange,
  onMove,
  onRemove,
}: PlanItemRowProps) {
  const { item, title, parentTitle, actualMinutes, status } = result
  const showActual = mode !== 'future'
  // Mid-day, "under" just means not finished yet — only flag overruns
  const showStatus =
    mode === 'past' || (mode === 'today' && status === 'over')
  const progress =
    item.plannedMinutes > 0
      ? Math.min(1, actualMinutes / item.plannedMinutes)
      : 0

  return (
    <li
      className={`plan-row${result.running ? ' plan-row--running' : ''}${
        result.completedOnDay ? ' plan-row--done' : ''
      }`}
    >
      <div className="plan-row__order">
        <button
          type="button"
          className="plan-row__order-btn"
          onClick={() => onMove(-1)}
          disabled={isFirst}
          aria-label={`Move ${title} up`}
        >
          ↑
        </button>
        <button
          type="button"
          className="plan-row__order-btn"
          onClick={() => onMove(1)}
          disabled={isLast}
          aria-label={`Move ${title} down`}
        >
          ↓
        </button>
      </div>

      <div className="plan-row__main">
        {parentTitle ? <p className="plan-row__parent">{parentTitle}</p> : null}
        <div className="plan-row__title-line">
          <span className="plan-row__title">{title}</span>
          {result.completedOnDay ? (
            <span className="plan-chip plan-chip--done">✓ Done</span>
          ) : null}
          {showStatus ? (
            <span className={`plan-chip plan-chip--${status}`}>
              {STATUS_LABEL[status]}
            </span>
          ) : null}
          {timerHere ? (
            <span className="task-row__timer-badge" aria-live="polite">
              {formatElapsed(elapsedSeconds)}
            </span>
          ) : result.running ? (
            <span className="plan-row__running-note">running on subtask</span>
          ) : null}
        </div>

        <PlanNoteInput
          key={item.note ?? ''}
          note={item.note ?? ''}
          title={title}
          onSave={onNoteChange}
        />

        {showActual ? (
          <div
            className={`plan-row__progress${
              status === 'over' ? ' plan-row__progress--over' : ''
            }`}
            role="progressbar"
            aria-label={`${title} progress`}
            aria-valuemin={0}
            aria-valuemax={item.plannedMinutes}
            aria-valuenow={Math.min(actualMinutes, item.plannedMinutes)}
          >
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}

        {result.includes.length > 0 ? (
          <p className="plan-row__includes">
            incl.{' '}
            {result.includes
              .map((sub) => `${sub.title} ${formatMinutes(sub.minutes)}`)
              .join(', ')}
          </p>
        ) : null}
      </div>

      <div className="plan-row__numbers">
        <label className="plan-row__field">
          <span className="plan-row__field-label">Planned</span>
          <DurationInput
            key={item.plannedMinutes}
            minutes={item.plannedMinutes}
            onCommit={onPlannedChange}
            className="plan-row__planned"
            aria-label={`Planned time for ${title}`}
          />
        </label>
        {showActual ? (
          <div className="plan-row__field">
            <span className="plan-row__field-label">Actual</span>
            <span className="plan-row__actual">
              {formatMinutes(actualMinutes)}
            </span>
            {mode === 'past' && actualMinutes > 0 ? (
              <span className={`plan-row__variance plan-row__variance--${status}`}>
                {formatSignedMinutes(result.varianceMinutes)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="plan-row__actions">
        {mode === 'today' ? (
          timerHere ? (
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={onStop}
              disabled={timerBusy}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onStart(item.taskId)}
              disabled={timerBusy}
            >
              Start
            </button>
          )
        ) : null}
        <button
          type="button"
          className="btn btn--ghost btn--small btn--danger"
          onClick={onRemove}
          aria-label={`Remove ${title} from plan`}
        >
          Remove
        </button>
      </div>
    </li>
  )
}
