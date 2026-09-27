'use client'

import { CaretRightFilled, PauseOutlined } from '@ant-design/icons'
import { Dropdown, Tooltip } from 'antd'
import { useEffect, useState } from 'react'

function fmtClock(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

/** Timer controls for one ticket (staff only) — see useMyTicketTimers. */
export type TicketTimerProps = {
  /** My running session on this ticket, if any */
  running: { sessionId: string; startTime: string } | null
  jobTypes: { slug: string; title: string; billable?: boolean }[]
  busy: boolean
  onStart: (jobType: string) => void
  onStop: (sessionId: string) => void
}

/** Start (pick a job type) / stop my timer on a ticket. Used in Kanban, List, Card and Round Robin. */
export default function TicketTimerButton({ timer }: { timer: TicketTimerProps }) {
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
