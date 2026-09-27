import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import {
  companies,
  find,
  getMany,
  teamMembers,
  teams,
  ticketAssignees,
  tickets,
  ticketTimeTracker,
  users,
} from '@/lib/fsdb'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager(sessionRole(session))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const viewBy = url.searchParams.get('view_by') as 'customer' | 'user' | 'team' | null

  if (!dateFrom || !dateTo || !viewBy || !['customer', 'user', 'team'].includes(viewBy)) {
    return NextResponse.json({ error: 'date_from, date_to, view_by required' }, { status: 400 })
  }

  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
  }
  to.setHours(23, 59, 59, 999)

  // Fetch all tickets in date range
  const ticketRows = (
    await find(tickets, {
      where: [
        ['createdAt', '>=', from],
        ['createdAt', '<=', to],
      ],
    })
  ).filter((t) => t.ticketType !== 'spam' && t.ticketType !== 'trash')

  const ticketIds = ticketRows.map((t) => t.id)
  const companyIds = [...new Set(ticketRows.map((t) => t.companyId).filter(Boolean) as string[])]

  // Fetch assignees for all tickets
  const assigneeRows = await find(ticketAssignees, { where: [['ticketId', 'in', ticketIds]] })

  // Fetch time tracker in range, restricted to these tickets
  const ticketIdSet = new Set(ticketIds)
  const trackerRows = ticketIds.length
    ? (
        await find(ticketTimeTracker, {
          where: [
            ['startTime', '>=', from],
            ['startTime', '<=', to],
          ],
        })
      ).filter((tr) => ticketIdSet.has(tr.ticketId))
    : []

  // Fetch companies (include activeTeamId)
  const companyRows = await getMany(companies, companyIds)
  const companyMap = new Map(companyRows.map((c) => [c.id, c]))

  // Collect all user ids
  const allUserIds = [
    ...new Set([...assigneeRows.map((a) => a.userId), ...trackerRows.map((t) => t.userId)]),
  ]
  const userRows = await getMany(users, allUserIds)
  const userMap = new Map(userRows.map((u) => [u.id, u]))

  // Fetch team memberships for these users (used in user/team views)
  const teamMemberRows = await find(teamMembers, { where: [['userId', 'in', allUserIds]] })

  // Fetch teams for active team IDs from companies + user memberships
  const activeTeamIds = companyRows.map((c) => c.activeTeamId).filter(Boolean) as string[]
  const allTeamIds = [...new Set([...teamMemberRows.map((m) => m.teamId), ...activeTeamIds])]
  const teamRows = await getMany(teams, allTeamIds)
  const teamMap = new Map(teamRows.map((t) => [t.id, t]))

  // userId -> teamIds (for user/team views)
  const userTeamIds = new Map<string, string[]>()
  for (const m of teamMemberRows) {
    const arr = userTeamIds.get(m.userId) ?? []
    if (!arr.includes(m.teamId)) arr.push(m.teamId)
    userTeamIds.set(m.userId, arr)
  }

  // companyId -> active team info
  const companyActiveTeam = new Map<string, { id: string; name: string }>()
  for (const c of companyRows) {
    if (c.activeTeamId) {
      const t = teamMap.get(c.activeTeamId)
      if (t) companyActiveTeam.set(c.id, { id: t.id, name: t.name })
    }
  }

  // ticketId -> companyId
  const ticketCompany = new Map(ticketRows.map((t) => [t.id, t.companyId]))

  // ticketId -> assignee userIds
  const ticketAssigneeMap = new Map<number, string[]>()
  for (const a of assigneeRows) {
    const arr = ticketAssigneeMap.get(a.ticketId) ?? []
    arr.push(a.userId)
    ticketAssigneeMap.set(a.ticketId, arr)
  }

  // tracker seconds per ticketId per userId
  function trackerSec(row: { durationSeconds: number | null; durationAdjustment: number | null }) {
    return reportedDurationSeconds(row) ?? 0
  }

  if (viewBy === 'customer') {
    type UserBreakdown = { id: string; name: string; seconds: number; ticket_count: number; teams: { id: string; name: string }[] }
    type CustomerEntry = {
      company_id: string
      company_name: string
      company_color: string | null
      ticket_count: number
      total_seconds: number
      users: { id: string; name: string }[]
      teams: { id: string; name: string }[]
      user_breakdown: UserBreakdown[]
    }
    const map = new Map<string, CustomerEntry>()
    // cid -> userId -> breakdown
    const userBreakdownMap = new Map<string, Map<string, { seconds: number; tickets: Set<number> }>>()

    for (const t of ticketRows) {
      const cid = t.companyId
      if (!cid) continue
      if (!map.has(cid)) {
        const c = companyMap.get(cid)
        map.set(cid, { company_id: cid, company_name: c?.name ?? 'Unknown', company_color: c?.color ?? null, ticket_count: 0, total_seconds: 0, users: [], teams: [], user_breakdown: [] })
      }
      map.get(cid)!.ticket_count++
    }

    for (const tr of trackerRows) {
      const cid = ticketCompany.get(tr.ticketId)
      if (!cid || !map.has(cid)) continue
      const sec = trackerSec(tr)
      map.get(cid)!.total_seconds += sec

      const u = userMap.get(tr.userId)
      if (u) {
        const entry = map.get(cid)!
        if (!entry.users.some((x) => x.id === tr.userId)) {
          entry.users.push({ id: tr.userId, name: u.fullName || u.email || tr.userId })
        }
        // user breakdown
        const ubMap = userBreakdownMap.get(cid) ?? new Map()
        const ub = ubMap.get(tr.userId) ?? { seconds: 0, tickets: new Set<number>() }
        ub.seconds += sec
        ub.tickets.add(tr.ticketId)
        ubMap.set(tr.userId, ub)
        userBreakdownMap.set(cid, ubMap)
      }
    }

    // Set teams from company's active team
    for (const [cid, entry] of map) {
      const activeTeam = companyActiveTeam.get(cid)
      if (activeTeam) entry.teams = [activeTeam]

      const ubMap = userBreakdownMap.get(cid) ?? new Map()
      entry.user_breakdown = [...ubMap.entries()]
        .map(([uid, ub]) => {
          const u = userMap.get(uid)
          return {
            id: uid,
            name: u?.fullName || u?.email || uid,
            seconds: Math.round(ub.seconds),
            ticket_count: ub.tickets.size,
          }
        })
        .sort((a, b) => b.seconds - a.seconds)
    }

    const result = [...map.values()].sort((a, b) => b.ticket_count - a.ticket_count)
    return NextResponse.json({ view_by: 'customer', rows: result })
  }

  if (viewBy === 'user') {
    // Per user: customers worked on, ticket count, total time
    type UserEntry = {
      user_id: string
      user_name: string
      ticket_count: number
      total_seconds: number
      customers: { id: string; name: string; ticket_count: number; seconds: number }[]
    }
    const map = new Map<string, UserEntry>()

    // userId -> customerId -> { tickets, seconds }
    const userCustomerMap = new Map<string, Map<string, { tickets: Set<number>; seconds: number }>>()

    for (const tr of trackerRows) {
      if (!map.has(tr.userId)) {
        const u = userMap.get(tr.userId)
        map.set(tr.userId, {
          user_id: tr.userId,
          user_name: u?.fullName || u?.email || tr.userId,
          ticket_count: 0,
          total_seconds: 0,
          customers: [],
        })
      }
      map.get(tr.userId)!.total_seconds += trackerSec(tr)

      const cid = ticketCompany.get(tr.ticketId)
      if (cid) {
        const byCustomer = userCustomerMap.get(tr.userId) ?? new Map()
        const entry = byCustomer.get(cid) ?? { tickets: new Set<number>(), seconds: 0 }
        entry.tickets.add(tr.ticketId)
        entry.seconds += trackerSec(tr)
        byCustomer.set(cid, entry)
        userCustomerMap.set(tr.userId, byCustomer)
      }
    }

    // Build customer breakdown per user
    for (const [uid, entry] of map) {
      const byCustomer = userCustomerMap.get(uid) ?? new Map()
      entry.ticket_count = new Set([...byCustomer.values()].flatMap((v) => [...v.tickets])).size
      entry.customers = [...byCustomer.entries()]
        .map(([cid, { tickets, seconds }]) => ({
          id: cid,
          name: companyMap.get(cid)?.name ?? 'Unknown',
          ticket_count: tickets.size,
          seconds: Math.round(seconds),
        }))
        .sort((a, b) => b.seconds - a.seconds)
    }

    const result = [...map.values()].sort((a, b) => b.ticket_count - a.ticket_count)
    return NextResponse.json({ view_by: 'user', rows: result })
  }

  if (viewBy === 'team') {
    // Per team: customers worked on, ticket count, total time
    type TeamEntry = {
      team_id: string
      team_name: string
      ticket_count: number
      total_seconds: number
      customers: { id: string; name: string; ticket_count: number }[]
      members: { id: string; name: string }[]
    }
    const map = new Map<string, TeamEntry>()

    // userId -> tracker rows
    const userTrackerTickets = new Map<string, Set<number>>()
    for (const tr of trackerRows) {
      const s = userTrackerTickets.get(tr.userId) ?? new Set()
      s.add(tr.ticketId)
      userTrackerTickets.set(tr.userId, s)
    }

    // team -> seconds, team -> customerId -> seconds
    const teamSeconds = new Map<string, number>()
    const teamCustomerSeconds = new Map<string, Map<string, number>>()
    for (const tr of trackerRows) {
      const cid = ticketCompany.get(tr.ticketId)
      const sec = trackerSec(tr)
      for (const tid of userTeamIds.get(tr.userId) ?? []) {
        teamSeconds.set(tid, (teamSeconds.get(tid) ?? 0) + sec)
        if (cid) {
          const byCustomer = teamCustomerSeconds.get(tid) ?? new Map<string, number>()
          byCustomer.set(cid, (byCustomer.get(cid) ?? 0) + sec)
          teamCustomerSeconds.set(tid, byCustomer)
        }
      }
    }

    for (const tid of allTeamIds) {
      const team = teamMap.get(tid)
      if (!team) continue
      const members = teamMemberRows.filter((m) => m.teamId === tid).map((m) => m.userId)
      const allTickets = new Set<number>()
      const customerTicketCount = new Map<string, number>()
      const memberList: { id: string; name: string }[] = []

      for (const uid of members) {
        const u = userMap.get(uid)
        if (u) memberList.push({ id: uid, name: u.fullName || u.email || uid })
        for (const ticketId of userTrackerTickets.get(uid) ?? []) {
          allTickets.add(ticketId)
          const cid = ticketCompany.get(ticketId)
          if (!cid) continue
          customerTicketCount.set(cid, (customerTicketCount.get(cid) ?? 0) + 1)
        }
      }

      const byCustomer = teamCustomerSeconds.get(tid) ?? new Map<string, number>()
      map.set(tid, {
        team_id: tid,
        team_name: team.name,
        ticket_count: allTickets.size,
        total_seconds: Math.round(teamSeconds.get(tid) ?? 0),
        customers: [...customerTicketCount.entries()]
          .map(([cid, count]) => ({
            id: cid,
            name: companyMap.get(cid)?.name ?? 'Unknown',
            ticket_count: count,
            seconds: Math.round(byCustomer.get(cid) ?? 0),
          }))
          .sort((a, b) => b.seconds - a.seconds),
        members: memberList,
      })
    }

    const result = [...map.values()].sort((a, b) => b.ticket_count - a.ticket_count)
    return NextResponse.json({ view_by: 'team', rows: result })
  }

  return NextResponse.json({ error: 'Unknown view_by' }, { status: 400 })
}
