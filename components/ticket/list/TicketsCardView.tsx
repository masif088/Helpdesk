'use client'

import { App, Button, Checkbox, Col, Empty, Pagination, Row } from 'antd'
import type { ReactNode } from 'react'
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
import { useMyTicketTimers } from './useMyTicketTimers'

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
  /** Folder pages: actions for the selected tickets (shows checkboxes when set) */
  bulkActions?: CardBulkAction[]
}

export type CardBulkAction = {
  key: string
  label: string
  icon?: ReactNode
  danger?: boolean
  /** Confirmation text; {n} is replaced with the number of selected tickets */
  confirm: string
  run: (ids: number[]) => Promise<void>
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
  bulkActions,
}: TicketsCardViewProps) {
  const { modal } = App.useApp()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const bulkOn = !isCustomer && !!bulkActions?.length
  // Drop selections that left the list (moved, deleted, filtered out)
  useEffect(() => {
    setSelected((prev) => {
      const present = new Set(tickets.map((t) => t.id))
      const next = new Set([...prev].filter((id) => present.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [tickets])
  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  const runAction = (a: CardBulkAction) => {
    const ids = [...selected]
    if (!ids.length) return
    modal.confirm({
      title: a.label,
      content: a.confirm.replace('{n}', String(ids.length)),
      okText: a.label,
      okButtonProps: a.danger ? { danger: true } : undefined,
      onOk: async () => {
        await a.run(ids)
        setSelected(new Set())
      },
    })
  }
  const saved = readSessionPage()
  const [page, setPage] = useState(saved.page)
  const [pageSize, setPageSize] = useState(saved.pageSize)
  const [ticketStatsMap, setTicketStatsMap] = useState<Map<number, TicketTrackerStat>>(new Map())
  const lastIdsRef = useRef<string>('')
  const { timerFor, changeTick } = useMyTicketTimers(!isCustomer)

  useEffect(() => {
    const ids = tickets.map((t) => t.id)
    if (ids.length === 0) return
    const key = `${ids.join(',')}|${changeTick}`
    if (key === lastIdsRef.current) return
    lastIdsRef.current = key
    fetch(`/api/tickets/ticket-time-stats?ticket_ids=${ids.join(',')}`)
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

  const pageIds = paged.map((t) => t.id)
  const pageSelected = pageIds.filter((id) => selected.has(id)).length

  return (
    <div style={{ width: '100%' }}>
      {bulkOn ? (
        <div className="bulk-bar">
          <Checkbox
            checked={pageSelected > 0 && pageSelected === pageIds.length}
            indeterminate={pageSelected > 0 && pageSelected < pageIds.length}
            onChange={(e) =>
              setSelected((prev) => {
                const next = new Set(prev)
                for (const id of pageIds) {
                  if (e.target.checked) next.add(id)
                  else next.delete(id)
                }
                return next
              })
            }
          >
            {selected.size > 0 ? `${selected.size} selected` : 'Select page'}
          </Checkbox>
          {selected.size > 0 ? (
            <>
              {sortedTickets.length > selected.size ? (
                <Button type="link" size="small" onClick={() => setSelected(new Set(sortedTickets.map((t) => t.id)))}>
                  Select all {sortedTickets.length}
                </Button>
              ) : null}
              <Button type="link" size="small" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <span style={{ flex: 1 }} />
              {bulkActions!.map((a) => (
                <Button key={a.key} icon={a.icon} danger={a.danger} type={a.danger ? 'primary' : 'default'} onClick={() => runAction(a)}>
                  {a.label}
                </Button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
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
              timer={timerFor(ticket.id)}
              selectable={bulkOn}
              selected={selected.has(ticket.id)}
              onToggleSelect={toggle}
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
