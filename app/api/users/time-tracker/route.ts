import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'
import { type Cond, find, getManyMap, tickets, ticketTimeTracker, type TicketTimeTrackerRow } from '@/lib/fsdb'
import { loadActiveJobTypeTitleMap } from '@/lib/job-types-db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import type { UserTimeTrackerTicketSummary } from '@/lib/user-time-tracker-summary'

/** GET /api/users/time-tracker?user_id=xxx&filter=week|month|all&start=&end=&stopped_only=1&active_only=1&limit=15&include_ticket_summary=1 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied

  const url = new URL(request.url)
  const userId = url.searchParams.get('user_id')
  const filter = url.searchParams.get('filter') || 'all'
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const stoppedOnly = url.searchParams.get('stopped_only') === '1'
  const activeOnly = url.searchParams.get('active_only') === '1'
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 500) : 100
  const includeTicketSummary = url.searchParams.get('include_ticket_summary') === '1'

  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  const conditions: Cond<TicketTimeTrackerRow>[] = [['userId', '==', userId]]
  if (filter === 'week' && start) {
    conditions.push(['startTime', '>=', new Date(start)])
  } else if (filter === 'month' && start) {
    conditions.push(['startTime', '>=', new Date(start)])
  } else if (filter === 'custom' && start && end) {
    conditions.push(['startTime', '>=', new Date(start)])
    conditions.push(['startTime', '<=', new Date(end)])
  }
  if (stoppedOnly) {
    conditions.push(['stopTime', '!=', null])
  }
  if (activeOnly) {
    conditions.push(['stopTime', '==', null])
    conditions.push(['trackerType', '==', 'timer'])
  }

  const trackers = await find(ticketTimeTracker, {
    where: conditions,
    orderBy: [['startTime', 'desc']],
    limit,
  })
  const ticketById = await getManyMap(tickets, trackers.map((t) => t.ticketId))
  const rows = trackers.map((tracker) => {
    const t = ticketById.get(String(tracker.ticketId))
    return { tracker, joinedTicketId: t?.id ?? null, joinedTicketTitle: t?.title ?? null }
  })

  const titleMap = await loadActiveJobTypeTitleMap()
  const result = rows.map((r) => ({
    id: r.tracker.id,
    ticket_id: r.tracker.ticketId,
    user_id: r.tracker.userId,
    tracker_type: r.tracker.trackerType,
    job_type: r.tracker.jobType ?? null,
    job_type_title: r.tracker.jobType ? titleMap.get(r.tracker.jobType) ?? null : null,
    start_time: r.tracker.startTime ? new Date(r.tracker.startTime).toISOString() : null,
    stop_time: r.tracker.stopTime ? new Date(r.tracker.stopTime).toISOString() : null,
    duration_seconds: r.tracker.durationSeconds,
    duration_adjustment: r.tracker.durationAdjustment,
    reported_duration_seconds: reportedDurationSeconds({
      durationSeconds: r.tracker.durationSeconds,
      durationAdjustment: r.tracker.durationAdjustment,
    }),
    note: r.tracker.note ?? null,
    created_at: r.tracker.createdAt ? new Date(r.tracker.createdAt).toISOString() : null,
    ticket:
      r.joinedTicketId != null
        ? {
            id: r.joinedTicketId,
            title: r.joinedTicketTitle,
          }
        : null,
  }))

  if (!includeTicketSummary) {
    return NextResponse.json(result)
  }

  const allMatching = await find(ticketTimeTracker, { where: conditions })
  const totals = new Map<number, number>()
  for (const r of allMatching) totals.set(r.ticketId, (totals.get(r.ticketId) ?? 0) + reportedDurationSeconds(r))
  const aggRows = [...totals].map(([ticketId, reported_seconds_total]) => ({ ticketId, reported_seconds_total }))

  let topTickets: UserTimeTrackerTicketSummary['top_tickets'] = []
  if (aggRows.length > 0) {
    const sorted = [...aggRows].sort(
      (a, b) => b.reported_seconds_total - a.reported_seconds_total || a.ticketId - b.ticketId
    )
    const topFive = sorted.slice(0, 5)
    const ids = topFive.map((r) => r.ticketId)
    const titleRows = await getManyMap(tickets, ids)
    const idToTitle = new Map([...titleRows.values()].map((r) => [r.id, r.title]))
    topTickets = topFive.map((row) => ({
      ticket_id: row.ticketId,
      title: idToTitle.get(row.ticketId) ?? null,
      reported_seconds_total: Math.round(Number(row.reported_seconds_total) || 0),
    }))
  }

  const ticket_summary: UserTimeTrackerTicketSummary = {
    distinct_ticket_count: aggRows.length,
    top_tickets: topTickets,
  }

  return NextResponse.json({ sessions: result, ticket_summary })
}
