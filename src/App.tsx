import { useState } from 'react'
import DailyTimeView from './components/DailyTimeView'
import HistoryView from './components/HistoryView'
import TaskForm from './components/TaskForm'
import TaskList from './components/TaskList'
import TimelineChart from './components/TimelineChart'
import { useActiveTasks, useTaskMutations } from './hooks/useTasks'
import {
  taskFormToNewTask,
  type TaskFormValues,
} from './taskFormValues'
import type { Task, TaskStatus } from './types'
import './App.css'

type TabId = 'active' | 'history' | 'daily' | 'timeline'

type FormMode =
  | { kind: 'closed' }
  | { kind: 'create'; parentId: string | null; parentTitle?: string }
  | { kind: 'edit'; task: Task }

const TABS: { id: TabId; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'history', label: 'History' },
  { id: 'daily', label: 'Daily' },
  { id: 'timeline', label: 'Timeline' },
]

function ActiveView() {
  const { tree, loading, error } = useActiveTasks()
  const { add, patch, remove, setStatus } = useTaskMutations()
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' })

  const handleSubmit = async (
    values: TaskFormValues & { parentId: string | null },
  ) => {
    if (formMode.kind === 'edit') {
      const payload = taskFormToNewTask(values)
      await patch(formMode.task.id, {
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        status: payload.status,
        startDate: payload.startDate,
        dueDate: payload.dueDate,
      })
    } else {
      await add(taskFormToNewTask(values))
    }
    setFormMode({ kind: 'closed' })
  }

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    await setStatus(task.id, status)
  }

  const handleDelete = async (task: Task) => {
    await remove(task.id)
    if (formMode.kind === 'edit' && formMode.task.id === task.id) {
      setFormMode({ kind: 'closed' })
    }
  }

  return (
    <section className="panel" aria-labelledby="active-heading">
      <div className="panel__toolbar">
        <div>
          <h1 id="active-heading">Active</h1>
          <p className="panel__lede">
            Tasks and subtasks, sorted by priority then due date.
          </p>
        </div>
        {formMode.kind === 'closed' ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              setFormMode({ kind: 'create', parentId: null })
            }
          >
            New task
          </button>
        ) : null}
      </div>

      {formMode.kind !== 'closed' ? (
        <div className="panel__form">
          <TaskForm
            key={
              formMode.kind === 'edit'
                ? formMode.task.id
                : `new-${formMode.parentId ?? 'root'}`
            }
            task={formMode.kind === 'edit' ? formMode.task : null}
            parentId={formMode.kind === 'create' ? formMode.parentId : null}
            parentTitle={
              formMode.kind === 'create' ? formMode.parentTitle : null
            }
            onSubmit={handleSubmit}
            onCancel={() => setFormMode({ kind: 'closed' })}
          />
        </div>
      ) : null}

      {loading ? <p className="panel__status">Loading tasks…</p> : null}
      {error ? (
        <p className="panel__status panel__status--error" role="alert">
          {error.message}
        </p>
      ) : null}

      {!loading && !error ? (
        <TaskList
          tree={tree}
          onEdit={(task) => setFormMode({ kind: 'edit', task })}
          onAddSubtask={(parent) =>
            setFormMode({
              kind: 'create',
              parentId: parent.id,
              parentTitle: parent.title,
            })
          }
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      ) : null}
    </section>
  )
}

function App() {
  const [tab, setTab] = useState<TabId>('active')

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-brand">Tasks Tracker</p>
        <nav className="app-tabs" aria-label="Main">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`app-tabs__tab${tab === id ? ' is-active' : ''}`}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main
        className={`app-main${tab === 'timeline' ? ' app-main--wide' : ''}`}
      >
        {tab === 'active' ? <ActiveView /> : null}
        {tab === 'history' ? <HistoryView /> : null}
        {tab === 'daily' ? <DailyTimeView /> : null}
        {tab === 'timeline' ? <TimelineChart /> : null}
      </main>
    </div>
  )
}

export default App
