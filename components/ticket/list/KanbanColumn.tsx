'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMemo } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'

import KanbanCard from './KanbanCard'
import type { TicketTimerProps } from './TicketTimerButton'
import {
  sortTickets,
  type StatusColumn,
  type TicketRecord,
  TICKETS_LIST_SORT_BY,
  TICKETS_LIST_SORT_ORDER,
  type TicketSortField,
  type TicketSortOrder,
} from './types'

interface KanbanColumnProps {
  column: StatusColumn
  tickets: TicketRecord[]
  dragDisabled?: boolean
  canDeleteTicket?: boolean
  isCustomer?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  onCloseTicket?: (id: number) => void
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  allStatusColumns?: StatusColumn[]
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
  ticketStatsMap?: Map<number, TicketTrackerStat>
  /** Per-ticket timer controls (staff only) */
  timerFor?: (ticketId: number) => TicketTimerProps | undefined
}

/** A status lane: neutral surface, status color only as dot + top accent line. */
export default function KanbanColumn({
  column,
  tickets,
  dragDisabled = false,
  canDeleteTicket = false,
  isCustomer = false,
  onEdit,
  onDelete,
  onCloseTicket,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
  allStatusColumns,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
  ticketStatsMap,
  timerFor,
}: KanbanColumnProps) {
  const columnTickets = useMemo(() => {
    const filtered = tickets.filter((t) => t.status === column.id)
    return sortTickets(filtered, sortBy, sortOrder)
  }, [tickets, column.id, sortBy, sortOrder])

  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <section
      className={`kanban-lane${isOver ? ' is-over' : ''}`}
      style={{ ['--lane-accent' as string]: column.color || '#94A3B8' }}
      aria-label={column.title}
    >
      <header className="kanban-lane__head">
        <span className="kanban-lane__dot" aria-hidden />
        <span className="kanban-lane__title">{column.title}</span>
        <span className="kanban-lane__count">{columnTickets.length}</span>
      </header>

      <div ref={setNodeRef} className="kanban-lane__body">
        <SortableContext items={columnTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {columnTickets.length === 0 ? (
            <div className="kanban-lane__empty">Drop tickets here</div>
          ) : (
            columnTickets.map((ticket) => (
              <KanbanCard
                key={ticket.id}
                ticket={ticket}
                dragDisabled={dragDisabled}
                canDeleteTicket={canDeleteTicket}
                isCustomer={isCustomer}
                onEdit={onEdit}
                onDelete={onDelete}
                onCloseTicket={onCloseTicket}
                allStatusColumns={allStatusColumns}
                onFilterByStatus={onFilterByStatus}
                onFilterByTag={onFilterByTag}
                onFilterByCompany={onFilterByCompany}
                trackerStat={ticketStatsMap?.get(ticket.id)}
                timer={timerFor?.(ticket.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </section>
  )
}
