/**
 * Support performance for a period (support tickets only; spam / trash / notifications are left out):
 *   first response = ticket opened by a client (portal or email) → first public reply from the team
 *   resolution     = ticket created → moved to a finished status (from the activity log; else last update)
 * New tickets and first responses are counted for tickets created in the period, resolutions for tickets
 * finished in the period.
 */
import dayjs from 'dayjs'

import { find, getManyMap, teams, ticketActivityLog, ticketAssignees, ticketComments, tickets, ticketTimeTracker, users } from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

const FINISHED = new Set(['resolved', 'closed', 'completed'])

export type DurationStats = { count: number; avgSeconds: number | null; medianSeconds: number | null }

export type SupportReportAgent = {
  userId: string
  name: string
  /** Tickets created in the period that are assigned to them */
  assigned: number
  /** Assigned tickets finished in the period */
  resolved: number
  /** Public replies they sent in the period */
  replies: number
  /** Tickets where they sent the first reply to the client */
  firstResponse: DurationStats
  trackedSeconds: number
}

export type SupportReportTeam = { teamId: string | null; name: string; created: number; resolved: number; firstResponse: DurationStats; resolution: DurationStats }

export type SupportReport = {
  from: string
  to: string
  totals: {
    created: number
    resolved: number
    /** Open support tickets right now */
    openNow: number
    /** Created in the period by a client and still without a reply from the team */
    awaitingFirstResponse: number
    firstResponse: DurationStats
    resolution: DurationStats
  }
  agents: SupportReportAgent[]
  teams: SupportReportTeam[]
  /** Tickets created / resolved per day */
  days: { day: string; created: number; resolved: number }[]
}

function stats(values: number[]): DurationStats {
  if (!values.length) return { count: 0, avgSeconds: null, medianSeconds: null }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return {
    count: sorted.length,
    avgSeconds: Math.round(sorted.reduce((n, v) => n + v, 0) / sorted.length),
    medianSeconds: Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2),
  }
}

const push = <K>(m: Map<K, number[]>, k: K, v: number) => m.set(k, [...(m.get(k) ?? []), v])
const bump = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by)

/** `from` / `to` are inclusive dates (YYYY-MM-DD). */
export async function getSupportReport(from: string, to: string): Promise<SupportReport> {
  const start = dayjs(from).startOf('day')
  const end = dayjs(to).endOf('day')
  const inPeriod = (d: Date | null | undefined) => !!d && !dayjs(d).isBefore(start) && !dayjs(d).isAfter(end)

  const [ticketRows, assigneeRows, teamRows, commentRows, logRows, sessionRows] = await Promise.all([
    find(tickets, { select: ['id', 'status', 'teamId', 'ticketType', 'createdBy', 'createdVia', 'createdAt', 'updatedAt'] }),
    find(ticketAssignees, { select: ['ticketId', 'userId'] }),
    find(teams, { select: ['id', 'name'] }),
    // Replies to tickets created in the period can only come after its start
    find(ticketComments, { where: [['createdAt', '>=', start.toDate()]], select: ['ticketId', 'userId', 'authorType', 'visibility', 'createdAt'] }),
    find(ticketActivityLog, { where: [['createdAt', '>=', start.toDate()]], select: ['ticketId', 'action', 'metadata', 'createdAt'] }),
    find(ticketTimeTracker, { where: [['startTime', '>=', start.toDate()]], select: ['id', 'userId', 'startTime', 'stopTime', 'durationSeconds', 'durationAdjustment'] }),
  ])

  const support = ticketRows.filter((t) => (t.ticketType ?? DEFAULT_TICKET_TYPE) === DEFAULT_TICKET_TYPE)
  const ticketById = new Map(support.map((t) => [t.id, t]))
  const creators = await getManyMap(users, [...new Set(support.map((t) => t.createdBy).filter((id): id is string => !!id))])
  const openedByClient = (t: (typeof support)[number]) => t.createdVia === 'email' || (!!t.createdBy && creators.get(t.createdBy)?.role?.toLowerCase() === 'customer')

  const assigneesByTicket = new Map<number, string[]>()
  for (const a of assigneeRows) assigneesByTicket.set(a.ticketId, [...(assigneesByTicket.get(a.ticketId) ?? []), a.userId])

  // First public reply from the team per ticket, and replies per agent in the period
  const firstReply = new Map<number, { at: Date; userId: string }>()
  const replies = new Map<string, number>()
  for (const c of commentRows) {
    if (c.authorType !== 'agent' || (c.visibility !== 'reply' && c.visibility !== 'public') || !ticketById.has(c.ticketId)) continue
    if (inPeriod(c.createdAt)) bump(replies, c.userId)
    const cur = firstReply.get(c.ticketId)
    if (!cur || c.createdAt < cur.at) firstReply.set(c.ticketId, { at: c.createdAt, userId: c.userId })
  }

  // When each ticket was finished: the last move into a finished status
  const finishedAt = new Map<number, Date>()
  for (const l of logRows) {
    if (l.ticketId == null || l.action !== 'ticket_updated') continue
    const to = (l.metadata as { changes?: { status?: { to?: unknown } } } | null)?.changes?.status?.to
    if (typeof to !== 'string' || !FINISHED.has(to)) continue
    const cur = finishedAt.get(l.ticketId)
    if (!cur || l.createdAt > cur) finishedAt.set(l.ticketId, l.createdAt)
  }

  const frtAll: number[] = []
  const resAll: number[] = []
  const frtByAgent = new Map<string, number[]>()
  const frtByTeam = new Map<string | null, number[]>()
  const resByTeam = new Map<string | null, number[]>()
  const createdByTeam = new Map<string | null, number>()
  const resolvedByTeam = new Map<string | null, number>()
  const assignedByAgent = new Map<string, number>()
  const resolvedByAgent = new Map<string, number>()
  const dayCreated = new Map<string, number>()
  const dayResolved = new Map<string, number>()
  let created = 0
  let resolved = 0
  let awaitingFirstResponse = 0

  for (const t of support) {
    const team = t.teamId ?? null
    if (inPeriod(t.createdAt)) {
      created++
      bump(createdByTeam, team)
      bump(dayCreated, dayjs(t.createdAt).format('YYYY-MM-DD'))
      for (const uid of assigneesByTicket.get(t.id) ?? []) bump(assignedByAgent, uid)
      if (openedByClient(t)) {
        const first = firstReply.get(t.id)
        if (first) {
          const secs = Math.max(0, (first.at.getTime() - new Date(t.createdAt).getTime()) / 1000)
          frtAll.push(secs)
          push(frtByAgent, first.userId, secs)
          push(frtByTeam, team, secs)
        } else if (!isClosedLikeTicketStatus(t.status)) {
          awaitingFirstResponse++
        }
      }
    }
    if (FINISHED.has(t.status)) {
      const at = finishedAt.get(t.id) ?? t.updatedAt
      if (inPeriod(at)) {
        resolved++
        bump(resolvedByTeam, team)
        bump(dayResolved, dayjs(at).format('YYYY-MM-DD'))
        for (const uid of assigneesByTicket.get(t.id) ?? []) bump(resolvedByAgent, uid)
        const secs = Math.max(0, (new Date(at).getTime() - new Date(t.createdAt).getTime()) / 1000)
        resAll.push(secs)
        push(resByTeam, team, secs)
      }
    }
  }

  const tracked = new Map<string, number>()
  for (const s of sessionRows) if (s.stopTime && inPeriod(s.startTime)) bump(tracked, s.userId, reportedDurationSeconds(s))

  const agentIds = new Set([...assignedByAgent.keys(), ...resolvedByAgent.keys(), ...replies.keys(), ...frtByAgent.keys(), ...tracked.keys()])
  const agentRows = await getManyMap(users, [...agentIds])
  const agents: SupportReportAgent[] = [...agentIds]
    .map((id) => {
      const u = agentRows.get(id)
      return {
        userId: id,
        name: u?.fullName || u?.email || 'Deleted user',
        role: u?.role?.toLowerCase() ?? '',
        assigned: assignedByAgent.get(id) ?? 0,
        resolved: resolvedByAgent.get(id) ?? 0,
        replies: replies.get(id) ?? 0,
        firstResponse: stats(frtByAgent.get(id) ?? []),
        trackedSeconds: tracked.get(id) ?? 0,
      }
    })
    .filter((a) => a.role !== 'customer')
    .map(({ role: _role, ...a }) => a)
    .sort((a, b) => b.resolved - a.resolved || b.replies - a.replies || a.name.localeCompare(b.name))

  const teamName = new Map(teamRows.map((t) => [t.id, t.name]))
  const teamKeys = new Set<string | null>([...createdByTeam.keys(), ...resolvedByTeam.keys()])
  const teamList: SupportReportTeam[] = [...teamKeys]
    .map((id) => ({
      teamId: id,
      name: id == null ? 'No team' : teamName.get(id) ?? 'Deleted team',
      created: createdByTeam.get(id) ?? 0,
      resolved: resolvedByTeam.get(id) ?? 0,
      firstResponse: stats(frtByTeam.get(id) ?? []),
      resolution: stats(resByTeam.get(id) ?? []),
    }))
    .sort((a, b) => b.created - a.created || a.name.localeCompare(b.name))

  const days: SupportReport['days'] = []
  const lastDay = end.isAfter(dayjs()) ? dayjs().endOf('day') : end
  for (let d = start; !d.isAfter(lastDay) && days.length < 370; d = d.add(1, 'day')) {
    const key = d.format('YYYY-MM-DD')
    days.push({ day: key, created: dayCreated.get(key) ?? 0, resolved: dayResolved.get(key) ?? 0 })
  }

  return {
    from: start.format('YYYY-MM-DD'),
    to: end.format('YYYY-MM-DD'),
    totals: {
      created,
      resolved,
      openNow: support.filter((t) => !isClosedLikeTicketStatus(t.status)).length,
      awaitingFirstResponse,
      firstResponse: stats(frtAll),
      resolution: stats(resAll),
    },
    agents,
    teams: teamList,
    days,
  }
}
