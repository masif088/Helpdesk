import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, find, getMany, getManyMap, tickets, ticketTimeTracker, users } from '@/lib/fsdb'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'


export type ActiveTrackerEntry = {
  user_name: string | null
  start_time: string
  ticket_id: number | null
  ticket_title: string | null
}

export type CompanyTimeStat = {
  company_id: string
  today_seconds: number
  active_manager_name: string | null
  has_active_tracker: boolean
  active_tracker_user_name: string | null
  active_tracker_start_time: string | null
  active_trackers: ActiveTrackerEntry[]
}

/** GET /api/tickets/company-time-stats?company_ids=id1,id2,... */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('company_ids') ?? ''
  const companyIds = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (companyIds.length === 0) {
    return NextResponse.json([])
  }
  const wanted = new Set(companyIds)

  // Start of today in UTC (UTC midnight = 07:00 WIB, which naturally covers overnight shifts ending before 07:00 WIB)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // Today's sessions + running sessions are few; join them to tickets in memory to get the company.
  const [todaySessions, activeSessions] = await Promise.all([
    find(ticketTimeTracker, { where: [['startTime', '>=', todayStart]] }),
    find(ticketTimeTracker, { where: [['stopTime', '==', null]] }),
  ])
  const ticketById = await getManyMap(tickets, [...todaySessions, ...activeSessions].map((s) => s.ticketId))
  const companyOf = (ticketId: number) => ticketById.get(String(ticketId))?.companyId ?? null

  // Total time logged today per company (completed sessions)
  const timeMap = new Map<string, number>()
  for (const s of todaySessions) {
    if (!s.stopTime) continue
    const cid = companyOf(s.ticketId)
    if (!cid || !wanted.has(cid)) continue
    timeMap.set(cid, (timeMap.get(cid) ?? 0) + reportedDurationSeconds(s))
  }

  // Active trackers (stopTime IS NULL) grouped per company
  const activeMap = new Map<string, { userId: string; startTime: Date; ticketId: number | null; ticketTitle: string | null }[]>()
  for (const s of activeSessions) {
    const cid = companyOf(s.ticketId)
    if (!cid || !wanted.has(cid)) continue
    const arr = activeMap.get(cid) ?? []
    arr.push({
      userId: s.userId,
      startTime: s.startTime,
      ticketId: s.ticketId,
      ticketTitle: ticketById.get(String(s.ticketId))?.title ?? null,
    })
    activeMap.set(cid, arr)
  }

  // Company active manager
  const companyRows = await getMany(companies, companyIds)

  // Resolve tracker user and manager names in one batch
  const people = await getManyMap(users, [
    ...[...activeMap.values()].flat().map((a) => a.userId),
    ...companyRows.map((c) => c.activeManagerId),
  ])
  const nameOf = (id: string) => {
    const u = people.get(id)
    return u ? u.fullName ?? u.id : null
  }

  const result: CompanyTimeStat[] = companyRows.map((c) => {
    const actives = activeMap.get(c.id) ?? []
    // Sort by earliest start first (longest running)
    actives.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    const first = actives[0] ?? null
    return {
      company_id: c.id,
      today_seconds: timeMap.get(c.id) ?? 0,
      active_manager_name: c.activeManagerId ? nameOf(c.activeManagerId) : null,
      has_active_tracker: actives.length > 0,
      active_tracker_user_name: first ? nameOf(first.userId) : null,
      active_tracker_start_time: first ? first.startTime.toISOString() : null,
      active_trackers: actives.map((a) => ({
        user_name: nameOf(a.userId),
        start_time: a.startTime.toISOString(),
        ticket_id: a.ticketId,
        ticket_title: a.ticketTitle,
      })),
    }
  })

  return NextResponse.json(result)
}
