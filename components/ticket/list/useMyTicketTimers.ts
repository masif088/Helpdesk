'use client'

import { App } from 'antd'
import { useCallback, useEffect, useState } from 'react'

import { useSession } from '@/lib/auth-client'

import type { TicketTimerProps } from './TicketTimerButton'

/**
 * Start / stop my own time tracker from ticket lists (Kanban, List, Card, Round Robin).
 * Loads my running timers and the active job types once; `timerFor(id)` feeds <TicketTimerButton>.
 * `changeTick` increments after every start/stop so views can refresh their time stats.
 */
export function useMyTicketTimers(enabled: boolean) {
  const { message } = App.useApp()
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [running, setRunning] = useState<Map<number, { sessionId: string; startTime: string }>>(new Map())
  const [jobTypes, setJobTypes] = useState<TicketTimerProps['jobTypes']>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [changeTick, setChangeTick] = useState(0)

  useEffect(() => {
    if (!enabled || !userId) return
    fetch(`/api/users/time-tracker?user_id=${encodeURIComponent(userId)}&active_only=1`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; ticket_id: number; start_time: string }[]) => {
        const map = new Map<number, { sessionId: string; startTime: string }>()
        for (const r of Array.isArray(rows) ? rows : []) map.set(r.ticket_id, { sessionId: r.id, startTime: r.start_time })
        setRunning(map)
      })
      .catch(() => {})
  }, [enabled, userId])

  useEffect(() => {
    if (!enabled) return
    fetch('/api/job-types', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setJobTypes(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [enabled])

  const post = async (ticketId: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/tickets/${ticketId}/time-tracker`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Timer request failed')
    return data
  }

  const start = useCallback(
    async (ticketId: number, jobType: string) => {
      setBusyId(ticketId)
      try {
        const row = (await post(ticketId, { action: 'start', job_type: jobType })) as { id: string; start_time: string }
        setRunning((prev) => new Map(prev).set(ticketId, { sessionId: row.id, startTime: String(row.start_time) }))
        setChangeTick((n) => n + 1)
        message.success(`Timer started on #${ticketId}`)
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Failed to start timer')
      } finally {
        setBusyId(null)
      }
    },
    [message]
  )

  const stop = useCallback(
    async (ticketId: number, sessionId: string) => {
      setBusyId(ticketId)
      try {
        await post(ticketId, { action: 'stop', session_id: sessionId })
        setRunning((prev) => {
          const next = new Map(prev)
          next.delete(ticketId)
          return next
        })
        setChangeTick((n) => n + 1)
        message.success(`Timer stopped on #${ticketId}`)
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Failed to stop timer')
      } finally {
        setBusyId(null)
      }
    },
    [message]
  )

  const timerFor = useCallback(
    (ticketId: number): TicketTimerProps | undefined =>
      enabled
        ? {
            running: running.get(ticketId) ?? null,
            jobTypes,
            busy: busyId === ticketId,
            onStart: (jobType) => void start(ticketId, jobType),
            onStop: (sessionId) => void stop(ticketId, sessionId),
          }
        : undefined,
    [enabled, running, jobTypes, busyId, start, stop]
  )

  return { timerFor, changeTick }
}
