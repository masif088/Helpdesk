'use client'

import { Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'

import { formatSlaDuration, type SlaClock, type TicketSla } from '@/lib/sla-format'

const COLOR = { ok: '#0F9D8A', at_risk: '#D97706', breached: '#DC2626', met: '#0F9D8A', missed: '#DC2626' } as const

/** Re-render every `ms` so countdowns stay true while a page is open. */
function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

/** The clock as the viewer sees it right now (a running clock changes state as time passes). */
function liveState(c: SlaClock, now: number): { state: SlaClock['state']; remaining: number | null } {
  if (c.doneAt) return { state: c.state, remaining: null }
  // Count down from the moment the server measured it, and only while the clock is running
  const elapsed = c.ticking && c.asOf ? Math.max(0, Math.round((now - new Date(c.asOf).getTime()) / 1000)) : 0
  const remaining = (c.remainingSeconds ?? 0) - elapsed
  const state = remaining < 0 ? 'breached' : remaining < c.targetMinutes * 60 * 0.2 ? 'at_risk' : 'ok'
  return { state, remaining }
}

function Pill({ label, clock, now }: { label: string; clock: SlaClock; now: number }) {
  const { state, remaining } = liveState(clock, now)
  const color = clock.paused && state !== 'breached' ? '#64748B' : COLOR[state]
  const text =
    state === 'met'
      ? `${label} on time`
      : state === 'missed'
        ? `${label} late`
        : clock.paused
          ? `${label} paused · ${formatSlaDuration(remaining ?? 0)} left`
          : remaining != null && remaining < 0
            ? `${label} ${formatSlaDuration(remaining)} overdue`
            : `${label} ${formatSlaDuration(remaining ?? 0)} left`
  const title = `${label} target: ${formatSlaDuration(clock.targetMinutes * 60)} · ${clock.paused ? 'stopped while waiting on the client' : `due ${dayjs(clock.dueAt).format('D MMM YYYY HH:mm')}`}${clock.doneAt ? ` · done ${dayjs(clock.doneAt).format('D MMM HH:mm')}` : ''}`
  return (
    <Tooltip title={title}>
      <span className="status-pill" style={{ background: `${color}22`, color, whiteSpace: 'nowrap' }}>
        <span className="status-pill__dot" style={{ background: color }} />
        {text}
      </span>
    </Tooltip>
  )
}

/** SLA clocks of a ticket: "Respond 12m left", "Resolve 3h overdue", "Respond on time". */
export default function SlaChips({ sla, compact }: { sla: TicketSla | null | undefined; compact?: boolean }) {
  const now = useNow()
  if (!sla || (!sla.respond && !sla.resolve)) return <span className="cell-muted">—</span>
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: compact ? 4 : 8 }}>
      {sla.respond ? <Pill label="Respond" clock={sla.respond} now={now} /> : null}
      {sla.resolve ? <Pill label="Resolve" clock={sla.resolve} now={now} /> : null}
    </span>
  )
}
