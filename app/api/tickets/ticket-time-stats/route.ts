import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { find, getManyMap, ticketTimeTracker, type TicketTimeTrackerRow, users } from '@/lib/fsdb'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

export type TicketTrackerStat = {
  ticket_id: number
  today_seconds: number
  yesterday_seconds: number
  active_trackers: { user_name: string; start_time: string }[]
}

/** GET /api/tickets/ticket-time-stats?ticket_ids=1,2,3 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('ticket_ids') ?? ''
  const ticketIds = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
  if (ticketIds.length === 0) return NextResponse.json([])

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)

  // All sessions of these tickets that are running or stopped since yesterday; summed in memory.
  const [recent, activeRows] = await Promise.all([
    find(ticketTimeTracker, {
      where: [
        ['ticketId', 'in', ticketIds],
        ['stopTime', '>=', yesterdayStart],
      ],
    }),
    find(ticketTimeTracker, {
      where: [
        ['ticketId', 'in', ticketIds],
        ['stopTime', '==', null],
      ],
    }),
  ])

  const sumByTicket = (rows: TicketTimeTrackerRow[]) => {
    const out: { ticketId: number; totalSeconds: number }[] = []
    const acc = new Map<number, number>()
    for (const r of rows) acc.set(r.ticketId, (acc.get(r.ticketId) ?? 0) + reportedDurationSeconds(r))
    for (const [ticketId, totalSeconds] of acc) out.push({ ticketId, totalSeconds })
    return out
  }
  // Completed sessions that STOPPED today (covers sessions started yesterday but finished today)
  const timeRows = sumByTicket(recent.filter((r) => r.stopTime && r.stopTime >= todayStart))
  // Completed sessions that stopped yesterday
  const yesterdayRows = sumByTicket(recent.filter((r) => r.stopTime && r.stopTime < todayStart))

  const userById = await getManyMap(users, activeRows.map((r) => r.userId))
  const userMap = new Map<string, string>()
  for (const u of userById.values()) userMap.set(u.id, u.fullName ?? u.id)

  const nowMs = Date.now()

  const timeMap = new Map<number, number>()
  for (const r of timeRows) timeMap.set(r.ticketId, r.totalSeconds)

  const yesterdayMap = new Map<number, number>()
  for (const r of yesterdayRows) yesterdayMap.set(r.ticketId, r.totalSeconds)

  const activeMap = new Map<number, { user_name: string; start_time: string }[]>()
  for (const r of activeRows) {
    const arr = activeMap.get(r.ticketId) ?? []
    arr.push({ user_name: userMap.get(r.userId) ?? r.userId, start_time: r.startTime.toISOString() })
    activeMap.set(r.ticketId, arr)
    // Add elapsed seconds from active session into today's total
    const elapsedSec = Math.floor((nowMs - r.startTime.getTime()) / 1000)
    timeMap.set(r.ticketId, (timeMap.get(r.ticketId) ?? 0) + Math.max(0, elapsedSec))
  }

  const result: TicketTrackerStat[] = ticketIds.map((id) => ({
    ticket_id: id,
    today_seconds: timeMap.get(id) ?? 0,
    yesterday_seconds: yesterdayMap.get(id) ?? 0,
    active_trackers: activeMap.get(id) ?? [],
  }))

  return NextResponse.json(result)
}
