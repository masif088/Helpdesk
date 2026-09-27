'use client'

import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { App, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import { useSession } from '@/lib/auth-client'

import type { KanbanTimerProps } from './KanbanCard'
import KanbanColumn from './KanbanColumn'
import type { StatusColumn, TicketRecord, TicketSortField, TicketSortOrder } from './types'
import { TICKETS_LIST_SORT_BY, TICKETS_LIST_SORT_ORDER } from './types'

const { Text } = Typography

/** Prefer droppable/cards under the pointer; avoids wrong column with horizontal scroll + dense cards. */
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args)
  if (byPointer.length > 0) return byPointer
  return closestCorners(args)
}

interface TicketsKanbanViewProps {
  tickets: TicketRecord[]
  columnsToShow: StatusColumn[]
  activeId: number | null
  isCustomer?: boolean
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void | Promise<void>
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  onCloseTicket?: (id: number) => void
  canDeleteTicket?: boolean
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  allStatusColumns?: StatusColumn[]
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

export default function TicketsKanbanView({
  tickets,
  columnsToShow,
  activeId,
  isCustomer = false,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  onCloseTicket,
  canDeleteTicket = false,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
  allStatusColumns,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
}: TicketsKanbanViewProps) {
  const { message } = App.useApp()
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [ticketStatsMap, setTicketStatsMap] = useState<Map<number, TicketTrackerStat>>(new Map())
  /** My running timers by ticket id (staff only) */
  const [myTimers, setMyTimers] = useState<Map<number, { sessionId: string; startTime: string }>>(new Map())
  const [jobTypes, setJobTypes] = useState<KanbanTimerProps['jobTypes']>([])
  const [timerBusyId, setTimerBusyId] = useState<number | null>(null)

  const loadStats = useCallback(() => {
    const ids = tickets.map((t) => t.id).join(',')
    if (!ids) return
    fetch(`/api/tickets/ticket-time-stats?ticket_ids=${ids}`)
      .then((r) => r.json())
      .then((data: TicketTrackerStat[]) => {
        const map = new Map<number, TicketTrackerStat>()
        for (const s of data) map.set(s.ticket_id, s)
        setTicketStatsMap(map)
      })
      .catch(() => {})
  }, [tickets])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const loadMyTimers = useCallback(() => {
    if (isCustomer || !userId) return
    fetch(`/api/users/time-tracker?user_id=${encodeURIComponent(userId)}&active_only=1`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; ticket_id: number; start_time: string }[]) => {
        const map = new Map<number, { sessionId: string; startTime: string }>()
        for (const r of Array.isArray(rows) ? rows : []) map.set(r.ticket_id, { sessionId: r.id, startTime: r.start_time })
        setMyTimers(map)
      })
      .catch(() => {})
  }, [isCustomer, userId])

  useEffect(() => {
    loadMyTimers()
  }, [loadMyTimers])

  useEffect(() => {
    if (isCustomer) return
    fetch('/api/job-types', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setJobTypes(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [isCustomer])

  const startTimer = useCallback(
    async (ticketId: number, jobType: string) => {
      setTimerBusyId(ticketId)
      try {
        const res = await fetch(`/api/tickets/${ticketId}/time-tracker`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', job_type: jobType }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to start timer')
        const row = data as { id: string; start_time: string }
        setMyTimers((prev) => new Map(prev).set(ticketId, { sessionId: row.id, startTime: String(row.start_time) }))
        message.success(`Timer started on #${ticketId}`)
        loadStats()
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Failed to start timer')
      } finally {
        setTimerBusyId(null)
      }
    },
    [loadStats, message]
  )

  const stopTimer = useCallback(
    async (ticketId: number, sessionId: string) => {
      setTimerBusyId(ticketId)
      try {
        const res = await fetch(`/api/tickets/${ticketId}/time-tracker`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop', session_id: sessionId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || 'Failed to stop timer')
        }
        setMyTimers((prev) => {
          const next = new Map(prev)
          next.delete(ticketId)
          return next
        })
        message.success(`Timer stopped on #${ticketId}`)
        loadStats()
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Failed to stop timer')
      } finally {
        setTimerBusyId(null)
      }
    },
    [loadStats, message]
  )

  const timerFor = useCallback(
    (ticketId: number): KanbanTimerProps | undefined =>
      isCustomer
        ? undefined
        : {
            running: myTimers.get(ticketId) ?? null,
            jobTypes,
            busy: timerBusyId === ticketId,
            onStart: (jobType) => void startTimer(ticketId, jobType),
            onStop: (sessionId) => void stopTimer(ticketId, sessionId),
          },
    [isCustomer, myTimers, jobTypes, timerBusyId, startTimer, stopTimer]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      /** Slightly more than a click; still responsive for drag. */
      activationConstraint: {
        distance: 6,
      },
    })
  )

  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) : null

  const board = (
    <div
      className="tickets-kanban-board"
      style={{
        padding: '4px 24px 16px',
        display: 'flex',
        gap: 14,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        overflowY: 'hidden',
        background: 'var(--kanban-board-bg)',
      }}
    >
      {columnsToShow.map((column) => (
        <KanbanColumn
          key={column.id}
          column={column}
          tickets={tickets}
          dragDisabled={isCustomer}
          canDeleteTicket={canDeleteTicket}
          isCustomer={isCustomer}
          onEdit={onEdit}
          onDelete={onDelete}
          onCloseTicket={onCloseTicket}
          sortBy={sortBy}
          sortOrder={sortOrder}
          allStatusColumns={allStatusColumns}
          onFilterByStatus={onFilterByStatus}
          onFilterByTag={onFilterByTag}
          onFilterByCompany={onFilterByCompany}
          ticketStatsMap={ticketStatsMap}
          timerFor={timerFor}
        />
      ))}
    </div>
  )

  if (isCustomer) {
    return board
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {board}
      <DragOverlay>
        {activeTicket ? (
          <div className="kanban-card is-dragging" style={{ width: 272 }}>
            <span className="kanban-card__id">#{activeTicket.id}</span>
            <Text strong style={{ color: 'var(--kanban-card-title)', display: 'block' }}>
              {activeTicket.title}
            </Text>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
