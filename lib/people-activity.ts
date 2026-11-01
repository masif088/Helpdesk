/**
 * Who is working, and how loaded are they, in a period: GET /api/users/activity. Per team member: time tracked in the period
 * (clipped to it), the tickets worked on, a running timer, the open tickets on their plate, and whether they are on leave or in
 * meetings. The rules without a database are in `lib/people-activity-core.ts`.
 */
import { listCalendarItems } from '@/lib/calendar'
import { type CalendarViewer } from '@/lib/calendar-core'
import {
  companies,
  find,
  getManyMap,
  teamMembers,
  ticketAssignees,
  tickets,
  type TicketsRow,
  ticketStatuses,
  ticketTimeTracker,
  ticketTypes,
  users,
} from '@/lib/fsdb'
import {
  type ActivityQuery,
  hasTicketFilters,
  sessionInRange,
  splitIntoBuckets,
  ticketPassesActivityFilters,
  unionSeconds,
} from '@/lib/people-activity-core'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { effectiveSkillsFor } from '@/lib/ticket-skill-lookup'
import { ballWithClientSlugs } from '@/lib/ticket-status-defaults'
import { CLOSED_LIKE_TICKET_STATUSES, isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

const DAY = 86_400_000
const MAX_TICKETS_LISTED = 25

type TicketLite = Pick<TicketsRow, 'id' | 'title' | 'status' | 'ticketType' | 'dueDate' | 'typeId' | 'companyId' | 'requiredSkills' | 'createdBy' | 'contactUserId'>
const TICKET_FIELDS = ['id', 'title', 'status', 'ticketType', 'dueDate', 'typeId', 'companyId', 'requiredSkills', 'createdBy', 'contactUserId'] as const

export async function loadPeopleActivity(q: ActivityQuery, viewer: CalendarViewer, now = new Date()) {
  const filtered = hasTicketFilters(q)

  // ── time entries that touch the period: those started in it (or the day before), and timers still running
  const [recent, running] = await Promise.all([
    find(ticketTimeTracker, { where: [['startTime', '>=', new Date(q.from.getTime() - DAY)], ['startTime', '<=', q.to]] }),
    find(ticketTimeTracker, { where: [['stopTime', '==', null]] }),
  ])
  const entries = [...new Map([...recent, ...running].map((s) => [s.id, s])).values()]
    .map((s) => ({ row: s, part: sessionInRange(s, q.from, q.to, now) }))
    .filter((e): e is { row: typeof e.row; part: NonNullable<typeof e.part> } => !!e.part && (!q.userIds.length || q.userIds.includes(e.row.userId)))

  // ── tickets: the open ones (for load) plus the ones worked on in the period
  const openRows = (await find(tickets, {
    where: [['ticketType', '==', DEFAULT_TICKET_TYPE], ['status', 'not-in', CLOSED_LIKE_TICKET_STATUSES]],
    select: [...TICKET_FIELDS],
  })) as TicketLite[]
  const known = new Map<number, TicketLite>(openRows.filter((t) => !isClosedLikeTicketStatus(t.status)).map((t) => [t.id, t]))
  const open = new Set(known.keys())
  const workedIds = [...new Set(entries.map((e) => e.row.ticketId))].filter((id) => !known.has(id))
  if (workedIds.length) for (const t of (await getManyMap(tickets, workedIds)).values()) known.set(t.id, t as TicketLite)

  const skillsOf = q.skills.length ? await effectiveSkillsFor([...known.values()]) : new Map<number, string[]>()
  const passes = (id: number) => {
    const t = known.get(id)
    return !!t && (!filtered || ticketPassesActivityFilters(t, q, skillsOf.get(id) ?? []))
  }

  // ── people and their teams
  const [userRows, memberRows, assigneeRows, statusRows, companyRows, typeRows] = await Promise.all([
    find(users, { select: ['id', 'email', 'fullName', 'role', 'status', 'skills', 'deletedAt'] }),
    find(teamMembers, { select: ['teamId', 'userId'] }),
    open.size ? find(ticketAssignees, { where: [['ticketId', 'in', [...open]]], select: ['ticketId', 'userId'] }) : Promise.resolve([]),
    find(ticketStatuses, {}),
    getManyMap(companies, [...known.values()].map((t) => t.companyId)),
    find(ticketTypes, { select: ['id', 'title'] }),
  ])
  const waiting = new Set(ballWithClientSlugs(statusRows))
  const typeTitle = new Map(typeRows.map((t) => [t.id, t.title]))
  const teamsOf = new Map<string, string[]>()
  for (const m of memberRows) teamsOf.set(m.userId, [...(teamsOf.get(m.userId) ?? []), m.teamId])
  const haveSkill = (have: string[] | null) => !q.agentSkills.length || q.agentSkills.some((s) => (have ?? []).some((h) => h.toLowerCase() === s.toLowerCase()))

  const people = userRows.filter(
    (u) =>
      !u.deletedAt &&
      u.status === 'active' &&
      !!u.role &&
      u.role.toLowerCase() !== 'customer' &&
      (!q.userIds.length || q.userIds.includes(u.id)) &&
      haveSkill(u.skills) &&
      (!q.teamIds.length || (teamsOf.get(u.id) ?? []).some((t) => q.teamIds.includes(t)))
  )

  // ── load: open tickets assigned to each person
  const assignedTo = new Map<string, number[]>()
  const assigned = new Set<number>()
  for (const a of assigneeRows) {
    if (!open.has(a.ticketId)) continue
    assigned.add(a.ticketId)
    assignedTo.set(a.userId, [...(assignedTo.get(a.userId) ?? []), a.ticketId])
  }

  // ── calendar: leave, holidays and meetings in the period
  const calendar = await listCalendarItems(viewer, { from: q.from, to: q.to, timeZone: q.timeZone, types: ['leave', 'holiday', 'meeting'], includeDerived: false }).catch(() => [])
  const involved = (i: { owner_id: string | null; attendee_ids: string[] }, uid: string) => i.owner_id === uid || i.attendee_ids.includes(uid)

  const agents = people.map((u) => {
    const mine = entries.filter((e) => e.row.userId === u.id && passes(e.row.ticketId))
    const byTicket = new Map<number, { seconds: number; sessions: number }>()
    const buckets = new Map<string, number>()
    for (const e of mine) {
      const b = byTicket.get(e.row.ticketId) ?? { seconds: 0, sessions: 0 }
      b.seconds += e.part.seconds
      b.sessions++
      byTicket.set(e.row.ticketId, b)
      for (const [k, v] of splitIntoBuckets(e.part.start, e.part.end, e.part.seconds, q.breakdown, q.timeZone)) buckets.set(k, (buckets.get(k) ?? 0) + v)
    }
    const trackedSeconds = mine.reduce((n, e) => n + e.part.seconds, 0)
    const timer = mine.find((e) => e.part.running && !e.row.stopTime)
    const ids = assignedTo.get(u.id) ?? []
    const rows = ids.map((id) => known.get(id)!).filter(Boolean)
    const waitingN = rows.filter((t) => waiting.has(t.status)).length
    const matching = rows.filter((t) => passes(t.id))
    const leave = calendar.filter((i) => i.type === 'leave' && involved(i, u.id))
    const meetings = calendar.filter((i) => i.type === 'meeting' && involved(i, u.id))
    return {
      id: u.id,
      name: u.fullName || u.email,
      email: u.email,
      role: (u.role ?? '').toLowerCase(),
      skills: u.skills ?? [],
      team_ids: teamsOf.get(u.id) ?? [],
      working: trackedSeconds > 0 || !!timer,
      tracked_seconds: trackedSeconds,
      sessions: mine.length,
      first_start: mine.length ? new Date(Math.min(...mine.map((e) => e.part.start.getTime()))).toISOString() : null,
      last_end: mine.length ? new Date(Math.max(...mine.map((e) => e.part.end.getTime()))).toISOString() : null,
      active_timer: timer ? { ticket_id: timer.row.ticketId, title: known.get(timer.row.ticketId)?.title ?? null, since: new Date(timer.row.startTime).toISOString() } : null,
      ...(q.breakdown !== 'none' ? { [q.breakdown === 'hour' ? 'by_hour' : 'by_day']: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, seconds]) => ({ [q.breakdown]: bucket, seconds })) } : {}),
      ...(q.includeTickets
        ? {
            tickets_worked: [...byTicket.entries()]
              .sort(([, a], [, b]) => b.seconds - a.seconds)
              .slice(0, MAX_TICKETS_LISTED)
              .map(([id, v]) => {
                const t = known.get(id)!
                return { id, title: t.title, status: t.status, company: t.companyId ? (companyRows.get(t.companyId)?.name ?? null) : null, type: t.typeId != null ? (typeTitle.get(t.typeId) ?? null) : null, seconds: v.seconds, sessions: v.sessions }
              }),
          }
        : {}),
      tickets_worked_count: byTicket.size,
      load: {
        open: rows.length,
        active: rows.length - waitingN,
        waiting_on_client: waitingN,
        overdue: rows.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now.getTime()).length,
        due_in_period: rows.filter((t) => t.dueDate && new Date(t.dueDate).getTime() >= q.from.getTime() && new Date(t.dueDate).getTime() <= q.to.getTime()).length,
        /** Open tickets of theirs that match the ticket filters (all of them when there are none) */
        matching_filters: matching.length,
      },
      calendar: {
        on_leave: leave.length > 0,
        leave: leave.map((i) => ({ title: i.title, start: i.start, end: i.end })),
        meetings: meetings.length,
        meeting_minutes: Math.round(unionSeconds(meetings.map((m) => ({ start: new Date(m.all_day ? `${m.start}T00:00:00Z` : m.start), end: new Date(m.all_day ? `${m.end}T23:59:59Z` : m.end) }))) / 60),
      },
    }
  })

  const shown = agents.filter((a) => !q.onlyWorking || a.working).sort((a, b) => b.tracked_seconds - a.tracked_seconds || b.load.matching_filters - a.load.matching_filters || a.name.localeCompare(b.name))

  return {
    from: q.from.toISOString(),
    to: q.to.toISOString(),
    time_zone: q.timeZone,
    filters: {
      user_ids: q.userIds,
      agent_skills: q.agentSkills,
      team_ids: q.teamIds,
      company_ids: q.companyIds,
      customer_ids: q.customerIds,
      skills: q.skills,
      skills_match: q.skillsMatch,
      type_ids: q.typeIds,
      only_working: q.onlyWorking,
    },
    totals: {
      agents: shown.length,
      working: shown.filter((a) => a.working).length,
      tracked_seconds: shown.reduce((n, a) => n + a.tracked_seconds, 0),
      /** Open tickets matching the ticket filters that nobody is assigned to: work waiting for someone */
      unassigned_matching: [...open].filter((id) => !assigned.has(id) && passes(id)).length,
    },
    holidays: calendar.filter((i) => i.type === 'holiday').map((i) => ({ title: i.title, start: i.start, end: i.end })),
    agents: shown,
  }
}
