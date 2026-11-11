import { addDays, format, parseISO } from 'date-fns'
import { useId, useMemo, useState } from 'react'
import { createTask } from '../db'
import { formatMinutes } from '../formatTime'
import { useDayPlan } from '../hooks/useDayPlan'
import { useSpentMinutesByTask } from '../hooks/useSpentMinutes'
import { useTimer } from '../hooks/useTimer'
import { defaultPlannedMinutes } from '../planSuggestions'
import DurationInput from './DurationInput'
import OtherTasksList from './OtherTasksList'
import PlanItemRow, { type PlanMode } from './PlanItemRow'
import PlanTaskPicker from './PlanTaskPicker'
import RetroChart from './RetroChart'
import RetroSummary from './RetroSummary'

function toIso(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function shiftDay(dayIso: string, days: number): string {
  return toIso(addDays(parseISO(dayIso), days))
}

function RetroNote({
  note,
  onSave,
}: {
  note: string
  onSave: (note: string) => Promise<unknown>
}) {
  const noteId = useId()
  const [draft, setDraft] = useState(note)
  const [saved, setSaved] = useState(false)

  return (
    <section className="plan-section" aria-labelledby={`${noteId}-heading`}>
      <div className="plan-section__header">
        <h2 id={`${noteId}-heading`} className="plan-section__title">
          <label htmlFor={noteId}>Notes</label>
        </h2>
        {saved ? (
          <span className="plan-section__meta" role="status">
            Saved
          </span>
        ) : null}
      </div>
      <textarea
        id={noteId}
        className="retro-note"
        rows={4}
        placeholder="What went well, what got in the way, what to change tomorrow…"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setSaved(false)
        }}
        onBlur={async () => {
          if (draft.trim() === note.trim()) return
          await onSave(draft)
          setSaved(true)
        }}
      />
    </section>
  )
}

export default function PlanView() {
  const formId = useId()
  const [todayIso] = useState(() => toIso(new Date()))
  const [day, setDay] = useState(todayIso)
  const {
    plan,
    tasks,
    retro,
    loading,
    error,
    addItem,
    setPlannedMinutes,
    setItemNote,
    removeItem,
    moveItem,
    setCapacity,
    setRetroNote,
  } = useDayPlan(day)
  const timer = useTimer()
  const { byTask: spentByTask } = useSpentMinutesByTask()

  const mode: PlanMode =
    day > todayIso ? 'future' : day === todayIso ? 'today' : 'past'

  const plannedTaskIds = useMemo(
    () => new Set(retro?.items.map((r) => r.item.taskId) ?? []),
    [retro],
  )
  const freeCapacity = retro
    ? Math.max(0, retro.capacityMinutes - retro.plannedMinutes)
    : 0
  const loadRatio =
    retro && retro.capacityMinutes > 0
      ? retro.plannedMinutes / retro.capacityMinutes
      : 0

  // Other tasks from a past day go onto today's plan; otherwise the next day
  const planTarget = mode === 'past' ? todayIso : shiftDay(day, 1)
  const planTargetLabel =
    planTarget === todayIso
      ? 'today'
      : planTarget === shiftDay(todayIso, 1)
        ? 'tomorrow'
        : format(parseISO(planTarget), 'MMM d')

  const handleCreate = async (title: string, minutes: number) => {
    const task = await createTask({ title, priority: 'medium', parentId: null })
    await addItem(task.id, minutes)
  }

  const handlePlanOther = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    const minutes = task
      ? defaultPlannedMinutes(task, spentByTask.get(taskId) ?? 0, 0)
      : 60
    await addItem(taskId, minutes, planTarget)
  }

  return (
    <section className="panel" aria-labelledby="plan-heading">
      <div className="panel__toolbar">
        <div>
          <h1 id="plan-heading">Plan</h1>
          <p className="panel__lede">
            Plan the day, then compare it with where the time actually went.
          </p>
        </div>
      </div>

      <div className="plan-nav">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setDay(shiftDay(day, -1))}
          aria-label="Previous day"
        >
          ←
        </button>
        <div className="task-form__field plan-nav__field">
          <label htmlFor={`${formId}-day`} className="visually-hidden">
            Date
          </label>
          <input
            id={`${formId}-day`}
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setDay(shiftDay(day, 1))}
          aria-label="Next day"
        >
          →
        </button>
        <div className="plan-nav__quick">
          <button
            type="button"
            className={`btn btn--ghost btn--small${day === todayIso ? ' is-active' : ''}`}
            onClick={() => setDay(todayIso)}
          >
            Today
          </button>
          <button
            type="button"
            className={`btn btn--ghost btn--small${
              day === shiftDay(todayIso, 1) ? ' is-active' : ''
            }`}
            onClick={() => setDay(shiftDay(todayIso, 1))}
          >
            Plan tomorrow
          </button>
        </div>
      </div>

      {loading && !error ? <p className="panel__status">Loading plan…</p> : null}
      {error ? (
        <p className="panel__status panel__status--error" role="alert">
          {error.message}
        </p>
      ) : null}

      {!loading && !error && retro ? (
        <>
          {mode !== 'future' ? (
            <RetroSummary retro={retro} soFar={mode === 'today'} />
          ) : null}

          <section className="plan-section" aria-labelledby="plan-list-heading">
            <div className="plan-section__header">
              <h2 id="plan-list-heading" className="plan-section__title">
                {format(parseISO(day), 'EEEE, MMM d')}
              </h2>
            </div>

            <div className="plan-capacity">
              <label className="plan-capacity__field">
                <span className="plan-row__field-label">Available</span>
                <DurationInput
                  key={`${day}-${retro.capacityMinutes}`}
                  minutes={retro.capacityMinutes}
                  onCommit={(minutes) => void setCapacity(minutes)}
                  className="plan-capacity__input"
                  aria-label="Available time"
                />
              </label>
              <div className="plan-capacity__bar-wrap">
                <p className="plan-capacity__text">
                  Planned {formatMinutes(retro.plannedMinutes)} /{' '}
                  {formatMinutes(retro.capacityMinutes)}
                  <span
                    className={
                      loadRatio > 1 ? 'plan-capacity__pct--over' : undefined
                    }
                  >
                    {' · '}
                    {Math.round(loadRatio * 100)}%
                    {loadRatio > 1 ? ' — over capacity' : ''}
                  </span>
                </p>
                <div
                  className={`plan-capacity__bar${
                    loadRatio > 1 ? ' plan-capacity__bar--over' : ''
                  }`}
                  aria-hidden
                >
                  <span style={{ width: `${Math.min(1, loadRatio) * 100}%` }} />
                </div>
              </div>
            </div>

            {retro.items.length === 0 ? (
              <p className="plan-section__empty">
                {mode === 'past' && !plan
                  ? 'No plan was made for this day. Add tasks to backfill one.'
                  : 'Nothing planned yet. Add the tasks you intend to work on.'}
              </p>
            ) : (
              <ul className="plan-list">
                {retro.items.map((result, index) => (
                  <PlanItemRow
                    key={result.item.id}
                    result={result}
                    mode={mode}
                    isFirst={index === 0}
                    isLast={index === retro.items.length - 1}
                    timerHere={timer.running?.taskId === result.item.taskId}
                    elapsedSeconds={timer.elapsedSeconds}
                    timerBusy={timer.busy}
                    onStart={(taskId) =>
                      void timer.start(taskId, result.item.note)
                    }
                    onStop={() => void timer.stop()}
                    onPlannedChange={(minutes) =>
                      void setPlannedMinutes(result.item.id, minutes)
                    }
                    onNoteChange={(note) => void setItemNote(result.item.id, note)}
                    onMove={(direction) => void moveItem(result.item.id, direction)}
                    onRemove={() => void removeItem(result.item.id)}
                  />
                ))}
              </ul>
            )}

            <PlanTaskPicker
              key={day}
              dayIso={day}
              tasks={tasks}
              plannedTaskIds={plannedTaskIds}
              spentByTask={spentByTask}
              freeCapacityMinutes={freeCapacity}
              onAdd={(taskId, minutes) => addItem(taskId, minutes)}
              onCreate={handleCreate}
            />
          </section>

          {mode !== 'future' ? (
            <>
              <RetroChart items={retro.items} />
              <OtherTasksList
                key={`other-${day}`}
                tasks={retro.otherTasks}
                totalMinutes={retro.otherMinutes}
                actualMinutes={retro.actualMinutes}
                planTargetLabel={planTargetLabel}
                onPlan={handlePlanOther}
              />
              <RetroNote
                key={`note-${day}`}
                note={plan?.retroNote ?? ''}
                onSave={setRetroNote}
              />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
