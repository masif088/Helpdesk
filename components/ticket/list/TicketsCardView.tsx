'use client'

import { Col, Empty, Pagination, Row } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'

import CardViewCard from './CardViewCard'
import {
  sortTickets,
  type StatusColumn,
  type TicketRecord,
  TICKETS_LIST_SORT_BY,
  TICKETS_LIST_SORT_ORDER,
  type TicketSortField,
  type TicketSortOrder,
} from './types'

interface TicketsCardViewProps {
  tickets: TicketRecord[]
  allStatusColumns?: StatusColumn[]
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  canDeleteTicket?: boolean
  isCustomer?: boolean
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

const DEFAULT_PAGE_SIZE = 15
const SESSION_KEY = 'tickets_card_page'

function readSessionPage(): { page: number; pageSize: number } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE }
}

export default function TicketsCardView({
  tickets,
  allStatusColumns,
  onEdit,
  onDelete,
  canDeleteTicket = false,
  isCustomer = false,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
}: TicketsCardViewProps) {
  const saved = readSessionPage()
  const [page, setPage] = useState(saved.page)
  const [pageSize, setPageSize] = useState(saved.pageSize)
  const [ticketStatsMap, setTicketStatsMap] = useState<Map<number, TicketTrackerStat>>(new Map())
  const lastIdsRef = useRef<string>('')

  useEffect(() => {
    const ids = tickets.map((t) => t.id)
    if (ids.length === 0) return
    const key = ids.join(',')
    if (key === lastIdsRef.current) return
    lastIdsRef.current = key
    fetch(`/api/tickets/ticket-time-stats?ticket_ids=${key}`)
      .then((r) => r.json())
      .then((data: TicketTrackerStat[]) => {
        const map = new Map<number, TicketTrackerStat>()
        for (const s of data) map.set(s.ticket_id, s)
        setTicketStatsMap(map)
      })
      .catch(() => { /* ignore */ })
  }, [tickets])

  const sortedTickets = useMemo(
    () => sortTickets(tickets, sortBy, sortOrder),
    [tickets, sortBy, sortOrder]
  )

  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / pageSize))
  const effectivePage = page > totalPages ? totalPages : page

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ page: effectivePage, pageSize })) } catch { /* ignore */ }
  }, [effectivePage, pageSize])

  const paged = useMemo(
    () => sortedTickets.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [sortedTickets, effectivePage, pageSize]
  )

  if (sortedTickets.length === 0) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center' }}>
        <Empty description="No tickets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <Row gutter={24} style={{ paddingRight: 24, paddingLeft: 24, rowGap: 0 }}>
        {paged.map((ticket) => (
          <Col span={24} style={{ marginBottom: 10 }} key={ticket.id}>
            <CardViewCard
              ticket={ticket}
              allStatusColumns={allStatusColumns}
              onEdit={onEdit}
              onDelete={onDelete}
              canDeleteTicket={canDeleteTicket}
              isCustomer={isCustomer}
              onFilterByStatus={onFilterByStatus}
              onFilterByTag={onFilterByTag}
              onFilterByCompany={onFilterByCompany}
              trackerStat={ticketStatsMap.get(ticket.id)}
            />
          </Col>
        ))}
      </Row>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 24px' }}>
        <Pagination
          current={effectivePage}
          pageSize={pageSize}
          total={sortedTickets.length}
          showSizeChanger
          pageSizeOptions={['10', '15', '20', '50']}
          showTotal={(t) => `Total ${t} tickets`}
          onChange={(p, ps) => {
            setPage(p)
            if (ps !== pageSize) { setPageSize(ps); setPage(1) }
          }}
          size="default"
        />
      </div>
    </div>
  )
}
