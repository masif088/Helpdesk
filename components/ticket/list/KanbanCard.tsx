'use client'

import { CommentOutlined, DeleteOutlined, EditOutlined, FieldTimeOutlined, FlagOutlined, RobotOutlined, SyncOutlined, UserOutlined } from '@ant-design/icons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar, Button, Card, Flex, Modal, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import DateDisplay from '@/components/common/DateDisplay'
import { KANBAN_SEMANTIC_BLUE, KANBAN_SEMANTIC_GREEN, kanbanTagStyle } from '@/lib/kanban-tag-chip-style'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

import type { StatusColumn, TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0 && m === 0) return '< 1m'
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtHours(s: number): string {
  return (s / 3600).toFixed(1) + 'h'
}

function TrackerTooltipContent({ stat }: { stat: TicketTrackerStat | undefined }): ReactNode {
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

const { Text } = Typography

interface KanbanCardProps {
  ticket: TicketRecord
  dragDisabled?: boolean
  canDeleteTicket?: boolean
  isCustomer?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  onCloseTicket?: (id: number) => void
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
  allStatusColumns?: StatusColumn[]
  trackerStat?: TicketTrackerStat
}

export default function KanbanCard({
  ticket,
  dragDisabled = false,
  canDeleteTicket = false,
  isCustomer = false,
  onEdit,
  onDelete,
  onCloseTicket,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
  allStatusColumns,
  trackerStat,
}: KanbanCardProps) {
  const statusCols = allStatusColumns?.length ? allStatusColumns : DEFAULT_ALL_STATUS_COLUMNS
  const statusCol = statusCols.find((c) => c.id === ticket.status)
  const statusTitle = statusCol?.title ?? ticket.status
  const statusColor = statusCol?.color ?? '#8c8c8c'
  const router = useRouter()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id, disabled: dragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      className="kanban-sortable-ticket"
      style={{
        ...style,
        cursor: dragDisabled ? 'default' : 'grab',
      }}
      {...(!dragDisabled ? attributes : {})}
      {...(!dragDisabled ? listeners : {})}
    >
      <Card
        className="kanban-ticket-card"
        size="small"
        style={{
          margin: 6,
          borderRadius: 12,
          boxShadow: 'var(--kanban-card-shadow)',
          maxWidth: 300,
          width: '100%',
          backgroundColor: 'var(--kanban-card-bg)',
          border: '1px solid var(--kanban-card-border)',
        }}
        styles={{ body: { padding: 14, background: 'transparent' } }}
      >
        {/* Tags + menu row — stop drag sensor when interacting with filter chips */}
        <Flex justify="space-between" align="flex-start" style={{ marginBottom: 10 }}>
          <Flex
            gap={6}
            wrap="wrap"
            style={{ flex: 1, minWidth: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {ticket.priority != null && ticket.priority > 0 && (
              <Tag
                style={kanbanTagStyle({
                  neutral: true,
                })}
              >
                P{ticket.priority}
              </Tag>
            )}
            {!isCustomer && ticket.team_name && (
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
            {!isCustomer && ticket.company && (
              <Tag
                style={kanbanTagStyle({
                  ...(ticket.company.color ? { fillHex: ticket.company.color } : { neutral: true }),
                  cursor: onFilterByCompany ? 'pointer' : undefined,
                })}
                title={onFilterByCompany ? 'Filter by this company' : undefined}
                onClick={
                  onFilterByCompany
                    ? (e) => {
                        e.stopPropagation()
                        onFilterByCompany(ticket.company!.id)
                      }
                    : undefined
                }
              >
                {ticket.company.name}
              </Tag>
            )}
            {ticket.tags &&
              ticket.tags.length > 0 &&
              ticket.tags.map((t) => (
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
                          e.stopPropagation()
                          onFilterByTag(t.id)
                        }
                      : undefined
                  }
                >
                  {t.name}
                </Tag>
              ))}
            {Number(ticket.checklist_total) > 0 && (
              <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_GREEN })}>
                Checklist: {ticket.checklist_completed}/{ticket.checklist_total}
              </Tag>
            )}
          </Flex>
          {isCustomer ? (
            <div style={{ display: 'flex', gap: 2 }} onPointerDown={(e) => e.stopPropagation()}>
              <Tooltip title="Edit Ticket">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined style={{ fontSize: 14, color: '#1677ff' }} />}
                  onClick={(e) => { e.stopPropagation(); onEdit(ticket) }}
                />
              </Tooltip>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 2 }} onPointerDown={(e) => e.stopPropagation()}>
              <Tooltip title="Edit">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined style={{ fontSize: 14, color: '#1677ff' }} />}
                  onClick={(e) => { e.stopPropagation(); onEdit(ticket) }}
                />
              </Tooltip>
              {canDeleteTicket && (
                <Tooltip title="Move to trash">
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined style={{ fontSize: 14, color: '#ff4d4f' }} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      Modal.confirm({
                        title: 'Move ticket to trash?',
                        content: 'The ticket will be hidden from the main list. You can open Trash from the sidebar to review.',
                        okText: 'Move to trash',
                        okButtonProps: { danger: true },
                        cancelText: 'Cancel',
                        onOk: () => onDelete(ticket.id),
                      })
                    }}
                  />
                </Tooltip>
              )}
            </div>
          )}
        </Flex>

        {/* Title + subtitle - use <a> for native right-click "Open in new tab" */}
        <a
          href={`/tickets/${ticket.id}`}
          style={{ cursor: 'pointer', display: 'block', color: 'inherit', textDecoration: 'none' }}
          onClick={(e) => {
            e.stopPropagation()
            if (e.button !== 0) return
            if (e.ctrlKey || e.metaKey) return
            e.preventDefault()
            router.push(`/tickets/${ticket.id}`)
          }}
        >
          <Text strong style={{ fontSize: 14, color: 'var(--kanban-card-title)', lineHeight: 1.4, display: 'block' }}>
            {ticket.has_unread_replies && (
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
            )}
            #{ticket.id} {ticket.title}
            {ticket.created_via === 'recurring' && (
              <SyncOutlined title="Created by recurring ticket" style={{ fontSize: 11, color: '#0E7490', marginLeft: 5, verticalAlign: 'middle' }} />
            )}
            {ticket.created_via === 'automation' && (
              <RobotOutlined title="Created by automation" style={{ fontSize: 11, color: '#0E7490', marginLeft: 5, verticalAlign: 'middle' }} />
            )}
          </Text>
          {ticket.by_label && (
            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic', color: '#1890ff', display: 'block', marginTop: 4 }}>
              by {ticket.by_label}
            </Text>
          )}
          {!isCustomer && ticket.short_note && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2, lineHeight: 1.3 }}>
              {ticket.short_note}
            </Text>
          )}
        </a>

        {/* Bottom: due, updated, comment, avatars */}
        <Flex
          justify="space-between"
          align="center"
          style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--kanban-card-divider)' }}
          wrap="wrap"
          gap={8}
        >
          <Flex gap={10} align="center" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            {ticket.due_date && (
              <Flex
                align="center"
                gap={4}
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color:
                    dayjs(ticket.due_date).isBefore(dayjs()) && !isClosedLikeTicketStatus(ticket.status)
                      ? '#ff4d4f'
                      : 'var(--kanban-card-muted)',
                }}
              >
                <FlagOutlined />
                <span>Due <DateDisplay date={ticket.due_date} format="date-only" /></span>
              </Flex>
            )}
            {ticket.updated_at && (
              <Flex align="center" gap={4} style={{ color: 'var(--kanban-card-muted)', fontSize: 11 }}>
                <FieldTimeOutlined />
                <span>Last update <DateDisplay date={ticket.updated_at} format="date-only" /></span>
              </Flex>
            )}
            <Tooltip title={<TrackerTooltipContent stat={trackerStat} />} placement="top" mouseEnterDelay={0.2}>
              <Flex align="center" gap={4} style={{ fontSize: 11, color: 'var(--kanban-card-muted)', cursor: 'default' }}>
                <FieldTimeOutlined />
                <span>{trackerStat && trackerStat.today_seconds > 0 ? fmtHours(trackerStat.today_seconds) : '0.0h'}</span>
                {trackerStat && trackerStat.active_trackers.length > 0 && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a', display: 'inline-block' }} />
                )}
              </Flex>
            </Tooltip>
            {ticket.has_unread_replies && (
              <Tooltip title="Unread replies">
                <CommentOutlined style={{ color: 'var(--kanban-card-muted)', fontSize: 12 }} />
              </Tooltip>
            )}
          </Flex>
          {ticket.assignees && ticket.assignees.length > 0 && (
            <Avatar.Group size="small" maxCount={3}>
              {ticket.assignees.map((assignee) => (
                <Tooltip key={assignee.id} title={assignee.user_name}>
                  <Avatar size="small" icon={<UserOutlined />} />
                </Tooltip>
              ))}
            </Avatar.Group>
          )}
        </Flex>

      </Card>
    </div>
  )
}
