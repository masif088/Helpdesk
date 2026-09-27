'use client'

import { ClockCircleOutlined, DeleteOutlined, EditOutlined, FieldTimeOutlined, FlagOutlined, MoreOutlined, RobotOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Modal, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import { KANBAN_SEMANTIC_BLUE, KANBAN_SEMANTIC_GREEN, kanbanTagStyle } from '@/lib/kanban-tag-chip-style'

import type { StatusColumn, TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'

const { Text } = Typography

function fmtHours(s: number): string {
  return (s / 3600).toFixed(1) + 'h'
}

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0 && m === 0) return '< 1m'
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function TrackerTooltipContent({ stat }: { stat: TicketTrackerStat | undefined }) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      <div>⏱ Today: <strong>{stat && stat.today_seconds > 0 ? fmtSeconds(stat.today_seconds) : '—'}</strong></div>
      <div style={{ color: '#aaa' }}>⏱ Yesterday: {stat && stat.yesterday_seconds > 0 ? fmtSeconds(stat.yesterday_seconds) : '—'}</div>
      {stat && stat.active_trackers.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          🟢 Active now:
          {stat.active_trackers.map((a, idx) => (
            <div key={idx} style={{ paddingLeft: 8 }}>• {a.user_name}</div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#aaa', marginTop: 2 }}>No active tracker</div>
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
  const statusColor = statusCol?.color ?? '#8c8c8c'

  const ticketUrl = `/tickets/${ticket.id}`
  return (
    <Flex
      justify="space-between"
      gap={12}
      align="stretch"
      style={{
        width: '100%',
        padding: 16,
        background: 'var(--kanban-card-bg)',
        borderRadius: 12,
        border: '1px solid var(--kanban-card-border)',
        boxShadow: 'var(--kanban-card-shadow)',
      }}
    >
      <a
        href={ticketUrl}
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          color: 'inherit',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          if (e.button !== 0) return
          if (e.ctrlKey || e.metaKey) return
          e.preventDefault()
          router.push(ticketUrl)
        }}
      >
      <Flex vertical justify="flex-start" align="flex-start" gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ fontSize: 16, fontWeight: 700, color: 'var(--kanban-card-title)', lineHeight: 1.4 }}>
          {ticket.has_unread_replies && (
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
          )}
          #{ticket.id} {ticket.title}
          {ticket.created_via === 'recurring' && (
            <SyncOutlined title="Created by recurring ticket" style={{ fontSize: 12, color: '#0E7490', marginLeft: 6, verticalAlign: 'middle' }} />
          )}
          {ticket.created_via === 'automation' && (
            <RobotOutlined title="Created by automation" style={{ fontSize: 12, color: '#0E7490', marginLeft: 6, verticalAlign: 'middle' }} />
          )}
        </Text>
        <Text style={{ fontSize: 13, color: '#1890ff', display: 'block' }}>
          by {ticket.by_label ?? ticket.creator_name ?? 'Unassigned'}
        </Text>
        {!isCustomer && ticket.short_note && (
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2, lineHeight: 1.3 }}>
            {ticket.short_note}
          </Text>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 4, width: '100%' }}>
          {ticket.due_date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
              <FlagOutlined style={{ fontSize: 12 }} />
              Due {dayjs(ticket.due_date).format('MMM DD, YYYY')}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
            <ClockCircleOutlined style={{ fontSize: 12 }} />
            Last update {dayjs(ticket.updated_at).format('MMM DD, YYYY')}
          </span>
          <Tooltip title={<TrackerTooltipContent stat={trackerStat} />} placement="top" mouseEnterDelay={0.2}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--kanban-card-muted)', cursor: 'default', userSelect: 'none' }}>
              <FieldTimeOutlined style={{ fontSize: 12 }} />
              {trackerStat && (trackerStat.today_seconds > 0 || trackerStat.yesterday_seconds > 0)
                ? fmtHours(trackerStat.today_seconds)
                : '0.0h'}
              {trackerStat && trackerStat.active_trackers.length > 0 && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a', display: 'inline-block' }} />
              )}
            </span>
          </Tooltip>
        </div>
        {Number(ticket.checklist_total) > 0 && (
          <span style={{ marginTop: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
            Checklist: {ticket.checklist_completed}/{ticket.checklist_total}
          </span>
        )}
      </Flex>
      </a>
      <Flex justify="flex-end" gap={6} align="center" wrap="wrap" style={{ flexShrink: 0 }}>
        {ticket.priority != null && ticket.priority > 0 && (
          <Tag style={kanbanTagStyle({ neutral: true })}>P{ticket.priority}</Tag>
        )}
        {ticket.team_name && (
          <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_BLUE })}>{ticket.team_name}</Tag>
        )}
        {ticket.type && (
          <Tag
            style={kanbanTagStyle({
              ...(ticket.type.color ? { fillHex: ticket.type.color } : { neutral: true }),
            })}
          >
            {ticket.type.title}
          </Tag>
        )}
        {ticket.company && (
          <Tag
            style={kanbanTagStyle({
              ...(ticket.company.color ? { fillHex: ticket.company.color } : { neutral: true }),
              cursor: onFilterByCompany ? 'pointer' : undefined,
            })}
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
          </Tag>
        )}
        {ticket.tags?.map((t) => (
          <Tag
            key={t.id}
            style={kanbanTagStyle({
              ...(t.color ? { fillHex: t.color } : { neutral: true }),
              cursor: onFilterByTag ? 'pointer' : undefined,
            })}
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
            {t.name}
          </Tag>
        ))}
        {onFilterByStatus ? (
          <Tag
            style={kanbanTagStyle({
              fillHex: statusColor,
              cursor: 'pointer',
            })}
            title="Filter by this status"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFilterByStatus(ticket.status)
            }}
          >
            {statusTitle}
          </Tag>
        ) : (
          <Tag style={kanbanTagStyle({ fillHex: statusColor })}>{statusTitle}</Tag>
        )}
        {Number(ticket.checklist_total) > 0 && (
          <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_GREEN })}>
            Checklist: {ticket.checklist_completed}/{ticket.checklist_total}
          </Tag>
        )}
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
          <Button type="text" size="small" icon={<MoreOutlined />} style={{ marginLeft: 4 }} />
        </Dropdown>
      </Flex>
    </Flex>
  )
}
