import { liveQuery } from 'dexie'
import { useCallback, useEffect, useState } from 'react'
import {
  addManualTimeEntry,
  deleteTimeEntry,
  getRunningTimer,
  startTimer,
  stopRunningTimer,
} from '../db'
import type { TimeEntry } from '../types'

export type ManualTimeInput = {
  taskId: string
  durationMinutes: number
  /** ISO date YYYY-MM-DD; defaults to today when omitted by callers */
  startAt: Date
  note?: string
}

export function useTimer() {
  const [running, setRunning] = useState<TimeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const subscription = liveQuery(() => getRunningTimer()).subscribe({
      next: (entry) => {
        setRunning(entry ?? null)
        setLoading(false)
        setError(null)
      },
      error: (err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!running) return
    setTick(Date.now())
    const id = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running?.id])

  const elapsedSeconds = running
    ? Math.max(
        0,
        Math.floor((tick - running.startAt.getTime()) / 1000),
      )
    : 0

  const start = useCallback(async (taskId: string) => {
    setBusy(true)
    setError(null)
    try {
      return await startTimer(taskId)
    } catch (err) {
      const next = err instanceof Error ? err : new Error(String(err))
      setError(next)
      throw next
    } finally {
      setBusy(false)
    }
  }, [])

  const stop = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      return await stopRunningTimer()
    } catch (err) {
      const next = err instanceof Error ? err : new Error(String(err))
      setError(next)
      throw next
    } finally {
      setBusy(false)
    }
  }, [])

  const addManual = useCallback(async (input: ManualTimeInput) => {
    setBusy(true)
    setError(null)
    try {
      return await addManualTimeEntry({
        taskId: input.taskId,
        durationMinutes: input.durationMinutes,
        startAt: input.startAt,
        note: input.note,
      })
    } catch (err) {
      const next = err instanceof Error ? err : new Error(String(err))
      setError(next)
      throw next
    } finally {
      setBusy(false)
    }
  }, [])

  const removeEntry = useCallback(async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await deleteTimeEntry(id)
    } catch (err) {
      const next = err instanceof Error ? err : new Error(String(err))
      setError(next)
      throw next
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    running,
    elapsedSeconds,
    loading,
    error,
    busy,
    start,
    stop,
    addManual,
    removeEntry,
  }
}

/** Format seconds as H:MM:SS or M:SS. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${minutes}:${ss}`
}
