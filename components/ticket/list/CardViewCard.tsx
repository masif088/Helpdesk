'use client'

import { ClockCircleOutlined, DeleteOutlined, EditOutlined, FieldTimeOutlined, FlagOutlined, MoreOutlined, RobotOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Dropdown, Modal, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

import { Chip, PriorityBadge, StatusPill } from './TicketChips'
import type { StatusColumn, TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0 && m === 0) return '< 1m'
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function TrackerTooltipContent({ stat }: { stat: TicketTrackerStat | undefined }) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      <div>Today: <strong>{stat && stat.today_seconds > 0 ? fmtSeconds(stat.today_seconds) : '—'}</strong></div>
      <div style={{ opacity: 0.7 }}>Yesterday: {stat && stat.yesterday_seconds > 0 ? fmtSeconds(stat.yesterday_seconds) : '—'}</div>
      {stat && stat.active_trackers.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          Running now:
          {stat.active_trackers.map((a, idx) => (
            <div key={idx} style={{ paddingLeft: 8 }}>• {a.user_name}</div>
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.7, marginTop: 2 }}>No active tracker</div>
      )}
    </div>
  )
}

interface CardViewCardProps {
  ticket: TicketRecord
  allStatusColumns?: StatusColumn[]
  canDeleteTicket?: boolean
  isCustomer?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  /** Click priority / status / tag chips to apply list filters */
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
  trackerStat?: TicketTrackerStat
}

/** Card view row: status accent on the left, title + meta, chips and menu on the right. */
export default function CardViewCard({
  ticket,
  allStatusColumns,
  canDeleteTicket = false,
  isCustomer = false,
  onEdit,
  onDelete,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
  trackerStat,
}: CardViewCardProps) {
  const router = useRouter()
  const statusCols = allStatusColumns?.length ? allStatusColumns : DEFAULT_ALL_STATUS_COLUMNS
  const statusCol = statusCols.find((c) => c.id === ticket.status)
  const statusTitle = statusCol?.title ?? ticket.status
  const statusColor = statusCol?.color ?? '#94A3B8'
  const overdue = !!ticket.due_date && dayjs(ticket.due_date).isBefore(dayjs()) && !isClosedLikeTicketStatus(ticket.status)
  const checklistTotal = Number(ticket.checklist_total) || 0
  const checklistDone = Number(ticket.checklist_completed) || 0
  const ticketUrl = `/tickets/${ticket.id}`

  return (
    <article className="ticket-row-card" style={{ ['--row-accent' as string]: statusColor }}>
      <a
        href={ticketUrl}
        className="ticket-row-card__main"
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey) return
          e.preventDefault()
          router.push(ticketUrl)
        }}
      >
        <div className="ticket-row-card__top">
          <span className="kanban-card__id">
            {ticket.has_unread_replies && <span className="kanban-card__unread" title="Unread replies" />}#{ticket.id}
            {ticket.created_via === 'recurring' && <SyncOutlined title="Created by recurring ticket" />}
            {ticket.created_via === 'automation' && <RobotOutlined title="Created by automation" />}
          </span>
          <PriorityBadge priority={ticket.priority} />
          <StatusPill
            color={statusColor}
            title={statusTitle}
            onClick={
              onFilterByStatus
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onFilterByStatus(ticket.status)
                  }
                : undefined
            }
          />
        </div>
        <div className="ticket-row-card__title">{ticket.title}</div>
        <div className="ticket-row-card__meta">
          <span>by {ticket.by_label ?? ticket.creator_name ?? 'Unassigned'}</span>
          {ticket.due_date && (
            <span className={overdue ? 'is-overdue' : undefined}>
              <FlagOutlined /> Due {dayjs(ticket.due_date).format('D MMM YYYY')}
            </span>
          )}
          <span>
            <ClockCircleOutlined /> Updated {dayjs(ticket.updated_at).format('D MMM YYYY')}
          </span>
          <Tooltip title={<TrackerTooltipContent stat={trackerStat} />} placement="top" mouseEnterDelay={0.2}>
            <span>
              {trackerStat && trackerStat.active_trackers.length > 0 ? <span className="kanban-card__live" aria-hidden /> : <FieldTimeOutlined />}
              {trackerStat && trackerStat.today_seconds > 0 ? fmtSeconds(trackerStat.today_seconds) : '0m'} today
            </span>
          </Tooltip>
          {checklistTotal > 0 && (
            <span className="ticket-row-card__checklist">
              <span className="kanban-card__checklist-bar">
                <span style={{ width: `${Math.round((checklistDone / checklistTotal) * 100)}%` }} />
              </span>
              {checklistDone}/{checklistTotal}
            </span>
          )}
        </div>
        {!isCustomer && ticket.short_note && <div className="kanban-card__note">{ticket.short_note}</div>}
      </a>

      <div className="ticket-row-card__side">
        <div className="ticket-row-card__chips">
          {!isCustomer && ticket.company && (
            <Chip
              color={ticket.company.color}
              title={onFilterByCompany ? 'Filter by this company' : undefined}
              onClick={
                onFilterByCompany
                  ? (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onFilterByCompany(ticket.company!.id)
                    }
                  : undefined
              }
            >
              {ticket.company.name}
            </Chip>
          )}
          {ticket.type && <Chip color={ticket.type.color}>{ticket.type.title}</Chip>}
          {ticket.team_name && <Chip>{ticket.team_name}</Chip>}
          {ticket.tags?.map((t) => (
            <Chip
              key={t.id}
              color={t.color}
              title={onFilterByTag ? 'Filter by this tag' : undefined}
              onClick={
                onFilterByTag
                  ? (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onFilterByTag(t.id)
                    }
                  : undefined
              }
            >
              #{t.name}
            </Chip>
          ))}
        </div>
        <Dropdown
          menu={{
            items: [
              { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit(ticket) },
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
                          onOk: () => onDelete(ticket.id),
                        })
                      },
                    },
                  ]
                : []),
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Ticket actions" />
        </Dropdown>
      </div>
    </article>
  )
}
