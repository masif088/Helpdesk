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
import { Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'

import KanbanColumn from './KanbanColumn'
import type { StatusColumn, TicketRecord, TicketSortField, TicketSortOrder } from './types'
import { TICKETS_LIST_SORT_BY, TICKETS_LIST_SORT_ORDER } from './types'
import { useMyTicketTimers } from './useMyTicketTimers'

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
  const [ticketStatsMap, setTicketStatsMap] = useState<Map<number, TicketTrackerStat>>(new Map())
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

  const { timerFor, changeTick } = useMyTicketTimers(!isCustomer)

  useEffect(() => {
    loadStats()
  }, [loadStats, changeTick])

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
