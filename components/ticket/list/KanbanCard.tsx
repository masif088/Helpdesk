'use client'

import {
  CaretRightFilled,
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  PauseOutlined,
  RobotOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar, Button, Dropdown, Modal, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import DateDisplay from '@/components/common/DateDisplay'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

import { Chip } from './TicketChips'
import type { StatusColumn, TicketRecord } from './types'

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0 && m === 0) return '< 1m'
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtClock(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

function TrackerTooltipContent({ stat }: { stat: TicketTrackerStat | undefined }): ReactNode {
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

/** Timer controls for one card (staff only). */
export type KanbanTimerProps = {
  /** My running session on this ticket, if any */
  running: { sessionId: string; startTime: string } | null
  jobTypes: { slug: string; title: string; billable?: boolean }[]
  busy: boolean
  onStart: (jobType: string) => void
  onStop: (sessionId: string) => void
}

function TimerControl({ timer }: { timer: KanbanTimerProps }) {
  const [elapsed, setElapsed] = useState(0)
  const running = timer.running
  useEffect(() => {
    if (!running) return
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(running.startTime).getTime()) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [running])

  if (running) {
    return (
      <Tooltip title="Stop my timer">
        <button
          type="button"
          className="kanban-timer is-running"
          disabled={timer.busy}
          onClick={(e) => {
            e.stopPropagation()
            timer.onStop(running.sessionId)
          }}
        >
          <span className="kanban-timer__pulse" aria-hidden />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtClock(elapsed)}</span>
          <PauseOutlined />
        </button>
      </Tooltip>
    )
  }
  return (
    <Dropdown
      trigger={['click']}
      disabled={timer.busy || timer.jobTypes.length === 0}
      menu={{
        items: [
          { key: '__label', type: 'group', label: 'Start timer as…' },
          ...timer.jobTypes.map((j) => ({
            key: j.slug,
            label: j.billable === false ? `${j.title} (non-billable)` : j.title,
          })),
        ],
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation()
          timer.onStart(String(key))
        },
      }}
    >
      <Tooltip title="Start timer">
        <button
          type="button"
          className="kanban-timer"
          disabled={timer.busy}
          aria-label="Start timer"
          onClick={(e) => e.stopPropagation()}
        >
          <CaretRightFilled />
        </button>
      </Tooltip>
    </Dropdown>
  )
}

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
  timer?: KanbanTimerProps
}

function priorityTone(p: number): string {
  if (p === 1) return 'is-p1'
  if (p === 2) return 'is-p2'
  return 'is-p3'
}

export default function KanbanCard({
  ticket,
  dragDisabled = false,
  canDeleteTicket = false,
  isCustomer = false,
  onEdit,
  onDelete,
  onFilterByTag,
  onFilterByCompany,
  trackerStat,
  timer,
}: KanbanCardProps) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: dragDisabled,
  })

  const overdue = !!ticket.due_date && dayjs(ticket.due_date).isBefore(dayjs()) && !isClosedLikeTicketStatus(ticket.status)
  const checklistTotal = Number(ticket.checklist_total) || 0
  const checklistDone = Number(ticket.checklist_completed) || 0
  const someoneTracking = !!trackerStat && trackerStat.active_trackers.length > 0

  return (
    <div
      ref={setNodeRef}
      className="kanban-sortable-ticket"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        cursor: dragDisabled ? 'default' : 'grab',
      }}
      {...(!dragDisabled ? attributes : {})}
      {...(!dragDisabled ? listeners : {})}
    >
      <article className={`kanban-card${timer?.running ? ' is-tracking' : ''}`}>
        <div className="kanban-card__top">
          <span className="kanban-card__id">
            {ticket.has_unread_replies && <span className="kanban-card__unread" title="Unread replies" />}#{ticket.id}
            {ticket.created_via === 'recurring' && <SyncOutlined title="Created by recurring ticket" />}
            {ticket.created_via === 'automation' && <RobotOutlined title="Created by automation" />}
          </span>
          <span className="kanban-card__top-right" onPointerDown={(e) => e.stopPropagation()}>
            <span className="kanban-card__actions">
              <Tooltip title="Edit">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(ticket)
                  }}
                />
              </Tooltip>
              {!isCustomer && canDeleteTicket && (
                <Tooltip title="Move to trash">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
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
            </span>
            {ticket.priority != null && ticket.priority > 0 && (
              <span className={`kanban-card__prio ${priorityTone(ticket.priority)}`}>P{ticket.priority}</span>
            )}
          </span>
        </div>

        {/* Title — <a> keeps native "open in new tab" */}
        <a
          href={`/tickets/${ticket.id}`}
          className="kanban-card__title"
          onClick={(e) => {
            e.stopPropagation()
            if (e.button !== 0 || e.ctrlKey || e.metaKey) return
            e.preventDefault()
            router.push(`/tickets/${ticket.id}`)
          }}
        >
          {ticket.title}
        </a>
        {ticket.by_label && <div className="kanban-card__by">by {ticket.by_label}</div>}
        {!isCustomer && ticket.short_note && <div className="kanban-card__note">{ticket.short_note}</div>}

        <div className="kanban-card__chips" onPointerDown={(e) => e.stopPropagation()}>
          {!isCustomer && ticket.company && (
            <Chip
              color={ticket.company.color}
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
            </Chip>
          )}
          {ticket.type && <Chip color={ticket.type.color}>{ticket.type.title}</Chip>}
          {!isCustomer && ticket.team_name && <Chip>{ticket.team_name}</Chip>}
          {ticket.tags?.map((t) => (
            <Chip
              key={t.id}
              color={t.color}
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
              #{t.name}
            </Chip>
          ))}
        </div>

        {checklistTotal > 0 && (
          <div className="kanban-card__checklist" title={`Checklist ${checklistDone}/${checklistTotal}`}>
            <span className="kanban-card__checklist-bar">
              <span style={{ width: `${Math.round((checklistDone / checklistTotal) * 100)}%` }} />
            </span>
            <span>
              {checklistDone}/{checklistTotal}
            </span>
          </div>
        )}

        <div className="kanban-card__foot">
          <div className="kanban-card__meta">
            {ticket.due_date && (
              <span className={overdue ? 'is-overdue' : undefined}>
                <FlagOutlined /> <DateDisplay date={ticket.due_date} format="date-only" />
              </span>
            )}
            <Tooltip title={<TrackerTooltipContent stat={trackerStat} />} mouseEnterDelay={0.2}>
              <span>
                {someoneTracking && <span className="kanban-card__live" aria-hidden />}
                {trackerStat && trackerStat.today_seconds > 0 ? fmtSeconds(trackerStat.today_seconds) : '0m'} today
              </span>
            </Tooltip>
            {ticket.has_unread_replies && (
              <Tooltip title="Unread replies">
                <CommentOutlined />
              </Tooltip>
            )}
          </div>
          <div className="kanban-card__foot-right" onPointerDown={(e) => e.stopPropagation()}>
            {ticket.assignees && ticket.assignees.length > 0 && (
              <Avatar.Group size={22} max={{ count: 3 }}>
                {ticket.assignees.map((a) => (
                  <Tooltip key={a.id} title={a.user_name}>
                    <Avatar size={22} className="kanban-card__avatar">
                      {(a.user_name || '?').trim().charAt(0).toUpperCase()}
                    </Avatar>
                  </Tooltip>
                ))}
              </Avatar.Group>
            )}
            {timer && <TimerControl timer={timer} />}
          </div>
        </div>
      </article>
    </div>
  )
}
