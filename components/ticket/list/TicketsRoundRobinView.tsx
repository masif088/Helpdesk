'use client'

import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Modal, Table, Tooltip} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import type { CompanyTimeStat } from '@/app/api/tickets/company-time-stats/route'
import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'

import TicketTimerButton from './TicketTimerButton'
import type { StatusColumn, TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS, sortTickets, TICKETS_LIST_SORT_BY, TICKETS_LIST_SORT_ORDER } from './types'
import { useMyTicketTimers } from './useMyTicketTimers'

interface RoundRobinRow {
  key: string
  companyName: string
  companyColor: string | null
  company: string
  tickets: TicketRecord[]
}

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0 && m === 0) return '0.00H'
  return `${h}.${String(m).padStart(2, '0')}H`
}

interface TicketsRoundRobinViewProps {
  tickets: TicketRecord[]
  statusColumns?: StatusColumn[]
  onEdit?: (ticket: TicketRecord) => void
  onDelete?: (id: number) => void
  canDeleteTicket?: boolean
}

function getStatusColor(status: string, columns: StatusColumn[]): string {
  const col = columns.find((c) => c.id === status)
  return col?.color ?? '#d9d9d9'
}

export default function TicketsRoundRobinView({
  tickets,
  statusColumns = DEFAULT_ALL_STATUS_COLUMNS,
  onEdit,
  onDelete,
  canDeleteTicket = false,
}: TicketsRoundRobinViewProps) {
  const router = useRouter()
  const { timerFor, changeTick } = useMyTicketTimers(true)
  const [companyStats, setCompanyStats] = useState<Map<string, CompanyTimeStat>>(new Map())
  const [ticketStats, setTicketStats] = useState<Map<number, TicketTrackerStat>>(new Map())

  // Group tickets by company
  const byCompany = new Map<string, TicketRecord[]>()
  for (const t of tickets) {
    const key = t.company_id ?? '__no_company__'
    if (!byCompany.has(key)) byCompany.set(key, [])
    byCompany.get(key)!.push(t)
  }

  /** Same as list/kanban: Priority up within one company, with tie-break id. */
  for (const [cid, arr] of byCompany) {
    byCompany.set(cid, sortTickets(arr, TICKETS_LIST_SORT_BY, TICKETS_LIST_SORT_ORDER))
  }

  const companyIds = Array.from(byCompany.keys()).sort((a, b) => {
    if (a === '__no_company__') return 1
    if (b === '__no_company__') return -1
    return a.localeCompare(b)
  })
  const maxSlots = Math.max(1, ...Array.from(byCompany.values()).map((a) => a.length))

  const realCompanyIds = companyIds.filter((id) => id !== '__no_company__')

  useEffect(() => {
    if (realCompanyIds.length === 0) return
    const ids = realCompanyIds.join(',')
    fetch(`/api/tickets/company-time-stats?company_ids=${ids}`)
      .then((r) => r.json())
      .then((data: CompanyTimeStat[]) => {
        const map = new Map<string, CompanyTimeStat>()
        for (const s of data) map.set(s.company_id, s)
        setCompanyStats(map)
      })
      .catch(() => {})

    const allTicketIds = tickets.map((t) => t.id).join(',')
    if (allTicketIds) {
      fetch(`/api/tickets/ticket-time-stats?ticket_ids=${allTicketIds}`)
        .then((r) => r.json())
        .then((data: TicketTrackerStat[]) => {
          const map = new Map<number, TicketTrackerStat>()
          for (const s of data) map.set(s.ticket_id, s)
          setTicketStats(map)
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, changeTick])

  const columns: ColumnsType<RoundRobinRow> = [
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      fixed: 'left',
      width: 240,
      render: (_, row) => {
        const stat = companyStats.get(row.company)
        const amName = stat?.active_manager_name ?? null
        return (
          <div className="rr-company">
            <span
              className="rr-company__mark"
              style={row.companyColor ? { background: row.companyColor } : undefined}
              aria-hidden
            >
              {row.companyName.trim().charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="rr-company__name">
                {row.companyName}
                {stat && stat.active_time_hours > 0 && <span className="rr-company__hours">{stat.active_time_hours}h plan</span>}
              </div>
              {stat && (
                <div className="rr-company__meta">
                  {fmtSeconds(stat.today_seconds)} today · AM {amName ?? '—'}
                </div>
              )}
            </div>
          </div>
        )
      },
    },
    ...Array.from({ length: maxSlots }, (_, i) => ({
      title: `Ticket ${i + 1}`,
      key: `slot${i}`,
      width: 140,
      align: 'center' as const,
      render: (_: unknown, row: RoundRobinRow) => {
        const ticket = row.tickets[i]
        if (!ticket) return null
        const statusColor = getStatusColor(ticket.status, statusColumns)
        const tStat = ticketStats.get(ticket.id)
        const tooltipContent = (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>⏱ Today: <strong>{tStat && tStat.today_seconds > 0 ? fmtSeconds(tStat.today_seconds) : '—'}</strong></div>
            <div style={{ color: '#aaa' }}>⏱ Yesterday: {tStat && tStat.yesterday_seconds > 0 ? fmtSeconds(tStat.yesterday_seconds) : '—'}</div>
            {tStat && tStat.active_trackers.length > 0 ? (
              <div style={{ marginTop: 4 }}>
                🟢 Active now:
                {tStat.active_trackers.map((a, idx) => (
                  <div key={idx} style={{ paddingLeft: 8 }}>• {a.user_name}</div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#aaa', marginTop: 2 }}>No active tracker</div>
            )}
          </div>
        )
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', }}>
            <Flex align="center" gap={4} justify="center" style={{ width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Tooltip title={tooltipContent} placement="top" mouseEnterDelay={0.3}>
              <a
                href={`/tickets/${ticket.id}`}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (e.button !== 0) return
                  if (e.ctrlKey || e.metaKey) return
                  e.preventDefault()
                  router.push(`/tickets/${ticket.id}`)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.ctrlKey || e.metaKey) return
                    e.preventDefault()
                    router.push(`/tickets/${ticket.id}`)
                  }
                }}
                className="rr-pill"
                style={{ ['--rr-accent' as string]: statusColor }}
              >
                <span className="rr-pill__dot" aria-hidden />
                #{ticket.id}
                {ticket.priority != null && ticket.priority > 0 && <span className="rr-pill__prio">P{ticket.priority}</span>}
              </a>
              </Tooltip>
              {ticket.short_note ? <p className="rr-note">{ticket.short_note}</p> : null}
              </div>
              {(() => {
                const timer = timerFor(ticket.id)
                return timer ? <TicketTimerButton timer={timer} /> : null
              })()}
              <Dropdown
                menu={{
                  items: [
                    { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit?.(ticket) },
                    ...(canDeleteTicket
                      ? [
                          {
                            key: 'delete',
                            label: 'Move to trash',
                            icon: <DeleteOutlined />,
                            danger: true,
                            onClick: () => {
                              Modal.confirm({
                                title: 'Move ticket to trash?',
                                content: 'The ticket will be hidden from the main list. Open Trash from the sidebar to review.',
                                okText: 'Move to trash',
                                okButtonProps: { danger: true },
                                cancelText: 'Cancel',
                                onOk: () => onDelete?.(ticket.id),
                              })
                            },
                          },
                        ]
                      : []),
                  ],
                }}
                trigger={['click']}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  style={{ padding: 4, height: 28 }}
                />
              </Dropdown>
            </Flex>
            
          </div>
        )
      },
    })),
  ]

  const dataSource: RoundRobinRow[] = (companyIds as string[]).map((cid) => {
    const companyTickets = byCompany.get(cid)!
    const first = companyTickets[0]
    const companyName: string =
      cid === '__no_company__' ? 'No Company' : (first?.company?.name ?? cid)
    return {
      key: String(cid),
      companyName,
      companyColor: first?.company?.color ?? null,
      company: String(cid),
      tickets: companyTickets,
    }
  })

  return (
    <div style={{ padding: '0 24px 24px', overflowX: 'auto' }}>
      <div className="ticket-surface">
        <Table
          className="ticket-table rr-table"
          dataSource={dataSource}
          columns={columns}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </div>
    </div>
  )
}
