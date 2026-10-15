import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { formatMinutes } from '../formatTime'
import { useSpentMinutesByTask } from '../hooks/useSpentMinutes'
import type { TaskTreeNode } from '../hooks/useTasks'
import { formatElapsed, useTimer } from '../hooks/useTimer'
import type { Priority, Task, TaskStatus } from '../types'
import TimeLogPanel from './TimeLogPanel'

type TaskListProps = {
  tree: TaskTreeNode[]
  onEdit: (task: Task) => void
  onAddSubtask: (parent: Task) => void
  onStatusChange: (task: Task, status: TaskStatus) => void
  onDelete: (task: Task) => void
}

type TimerApi = ReturnType<typeof useTimer>

function formatDateLabel(iso?: string): string | null {
  if (!iso) return null
  try {
    return format(parseISO(iso), 'MMM d')
  } catch {
    return iso
  }
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`priority-badge priority-badge--${priority}`}>
      {priority}
    </span>
  )
}

function StatusSelect({
  task,
  onStatusChange,
}: {
  task: Task
  onStatusChange: (task: Task, status: TaskStatus) => void
}) {
  return (
    <select
      className="task-row__status"
      aria-label={`Status for ${task.title}`}
      value={task.status}
      onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}
    >
      <option value="todo">To do</option>
      <option value="in_progress">In progress</option>
      <option value="done">Done</option>
    </select>
  )
}

function TaskRow({
  node,
  depth,
  logTaskId,
  setLogTaskId,
  onEdit,
  onAddSubtask,
  onStatusChange,
  onDelete,
  timer,
  spentByTask,
}: {
  node: TaskTreeNode
  depth: number
  logTaskId: string | null
  setLogTaskId: (id: string | null) => void
  onEdit: (task: Task) => void
  onAddSubtask: (parent: Task) => void
  onStatusChange: (task: Task, status: TaskStatus) => void
  onDelete: (task: Task) => void
  timer: TimerApi
  spentByTask: Map<string, number>
}) {
  const startLabel = formatDateLabel(node.startDate)
  const dueLabel = formatDateLabel(node.dueDate)
  const dateRange =
    startLabel || dueLabel
      ? [startLabel, dueLabel].filter(Boolean).join(' → ')
      : null

  const logOpen = logTaskId === node.id
  const isRunningHere = timer.running?.taskId === node.id
  const spentMinutes = spentByTask.get(node.id) ?? 0

  return (
    <li
      className={`task-row depth-${Math.min(depth, 4)}`}
      style={{ '--depth': depth } as CSSProperties}
    >
      <div className="task-row__body">
        {depth > 0 ? <span className="task-row__connector" aria-hidden /> : null}

        <div className="task-row__main">
          <div className="task-row__title-line">
            <PriorityBadge priority={node.priority} />
            <button
              type="button"
              className="task-row__title"
              onClick={() => onEdit(node)}
            >
              {node.title}
            </button>
            {isRunningHere ? (
              <span className="task-row__timer-badge" aria-live="polite">
                {formatElapsed(timer.elapsedSeconds)}
              </span>
            ) : null}
          </div>

          {node.description ? (
            <p className="task-row__desc">{node.description}</p>
          ) : null}

          <div className="task-row__meta">
            <StatusSelect task={node} onStatusChange={onStatusChange} />
            {dateRange ? (
              <span className="task-row__dates">{dateRange}</span>
            ) : (
              <span className="task-row__dates task-row__dates--empty">
                No dates
              </span>
            )}
            {spentMinutes > 0 ? (
              <span className="task-row__spent">{formatMinutes(spentMinutes)}</span>
            ) : null}
          </div>
        </div>

        <div className="task-row__actions">
          <button
            type="button"
            className={`btn btn--ghost btn--small${logOpen ? ' is-active' : ''}`}
            aria-expanded={logOpen}
            onClick={() => setLogTaskId(logOpen ? null : node.id)}
          >
            {logOpen ? 'Hide time' : 'Log time'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onAddSubtask(node)}
          >
            Add subtask
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onEdit(node)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small btn--danger"
            onClick={() => {
              if (
                window.confirm(
                  `Delete “${node.title}”${node.children.length ? ' and its subtasks' : ''}?`,
                )
              ) {
                onDelete(node)
              }
            }}
          >
            Delete
          </button>
        </div>

        {logOpen ? (
          <div className="task-row__time-log">
            <TimeLogPanel
              task={node}
              running={timer.running}
              elapsedSeconds={timer.elapsedSeconds}
              busy={timer.busy}
              error={timer.error}
              onStart={timer.start}
              onStop={timer.stop}
              onAddManual={timer.addManual}
            />
          </div>
        ) : null}
      </div>

      {node.children.length > 0 ? (
        <ul className="task-list task-list--nested">
          {node.children.map((child) => (
            <TaskRow
              key={child.id}
              node={child}
              depth={depth + 1}
              logTaskId={logTaskId}
              setLogTaskId={setLogTaskId}
              onEdit={onEdit}
              onAddSubtask={onAddSubtask}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              timer={timer}
              spentByTask={spentByTask}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default function TaskList({
  tree,
  onEdit,
  onAddSubtask,
  onStatusChange,
  onDelete,
}: TaskListProps) {
  const timer = useTimer()
  const { byTask: spentByTask } = useSpentMinutesByTask()
  const [logTaskId, setLogTaskId] = useState<string | null>(null)

  if (tree.length === 0) {
    return (
      <p className="task-list__empty">
        No active tasks yet. Add one to get started.
      </p>
    )
  }

  return (
    <ul className="task-list">
      {tree.map((node) => (
        <TaskRow
          key={node.id}
          node={node}
          depth={0}
          logTaskId={logTaskId}
          setLogTaskId={setLogTaskId}
          onEdit={onEdit}
          onAddSubtask={onAddSubtask}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          timer={timer}
          spentByTask={spentByTask}
        />
      ))}
    </ul>
  )
}
