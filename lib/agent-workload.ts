/**
 * Who is working on what: per internal user the open support tickets they are assigned to, how many are past
 * their due date or waiting on the client, and the time they tracked this week. Shared by the Workload page and
 * the "suggested agents" on a ticket.
 */
import dayjs from 'dayjs'

import { find, teamMembers, ticketAssignees, tickets, ticketStatuses, ticketTimeTracker, users } from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { customerDefaultSlugs } from '@/lib/ticket-status-defaults'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

export type AgentWorkload = {
  userId: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
  skills: string[]
  teamIds: string[]
  /** Open support tickets assigned to them */
  open: number
  overdue: number
  waitingOnClient: number
  /** Open and not waiting on the client: what is on their plate now */
  active: number
  trackedTodaySeconds: number
  trackedWeekSeconds: number
}

export type WorkloadSnapshot = {
  agents: AgentWorkload[]
  /** Open support tickets nobody is assigned to */
  unassigned: number
  openTotal: number
  overdueTotal: number
}

export async function loadAgentWorkload(): Promise<WorkloadSnapshot> {
  const weekStart = dayjs().startOf('day').subtract((dayjs().day() + 6) % 7, 'day')
  const today = dayjs().startOf('day')
  const [userRows, ticketRows, assigneeRows, memberRows, sessions, statusRows] = await Promise.all([
    find(users, { select: ['id', 'email', 'fullName', 'role', 'status', 'avatarUrl', 'skills', 'deletedAt'] }),
    find(tickets, { select: ['id', 'status', 'ticketType', 'dueDate'] }),
    find(ticketAssignees, { select: ['ticketId', 'userId'] }),
    find(teamMembers, { select: ['teamId', 'userId'] }),
    find(ticketTimeTracker, { where: [['startTime', '>=', weekStart.toDate()]], select: ['userId', 'startTime', 'stopTime', 'durationSeconds', 'durationAdjustment'] }),
    find(ticketStatuses, {}),
  ])
  // Statuses where the ball is with the client (Settings -> Ticket statuses), not with the team
  const WAITING_ON_CLIENT = new Set(customerDefaultSlugs(statusRows))

  const open = new Map(
    ticketRows.filter((t) => (t.ticketType ?? DEFAULT_TICKET_TYPE) === DEFAULT_TICKET_TYPE && !isClosedLikeTicketStatus(t.status)).map((t) => [t.id, t])
  )
  const now = Date.now()
  const per = new Map<string, { open: number; overdue: number; waiting: number }>()
  const assignedOpen = new Set<number>()
  for (const a of assigneeRows) {
    const t = open.get(a.ticketId)
    if (!t) continue
    assignedOpen.add(t.id)
    const m = per.get(a.userId) ?? { open: 0, overdue: 0, waiting: 0 }
    m.open++
    if (t.dueDate && new Date(t.dueDate).getTime() < now) m.overdue++
    if (WAITING_ON_CLIENT.has(t.status)) m.waiting++
    per.set(a.userId, m)
  }

  const tracked = new Map<string, { today: number; week: number }>()
  for (const s of sessions) {
    if (!s.stopTime) continue
    const secs = reportedDurationSeconds(s)
    const m = tracked.get(s.userId) ?? { today: 0, week: 0 }
    m.week += secs
    if (!dayjs(s.startTime).isBefore(today)) m.today += secs
    tracked.set(s.userId, m)
  }

  const teamsByUser = new Map<string, string[]>()
  for (const m of memberRows) teamsByUser.set(m.userId, [...(teamsByUser.get(m.userId) ?? []), m.teamId])

  const agents: AgentWorkload[] = userRows
    .filter((u) => !u.deletedAt && u.status === 'active' && (u.role ?? '').toLowerCase() !== 'customer' && (u.role ?? '') !== '')
    .map((u) => {
      const w = per.get(u.id) ?? { open: 0, overdue: 0, waiting: 0 }
      const t = tracked.get(u.id) ?? { today: 0, week: 0 }
      return {
        userId: u.id,
        name: u.fullName || u.email,
        email: u.email,
        role: (u.role ?? '').toLowerCase(),
        avatarUrl: u.avatarUrl ?? null,
        skills: u.skills ?? [],
        teamIds: teamsByUser.get(u.id) ?? [],
        open: w.open,
        overdue: w.overdue,
        waitingOnClient: w.waiting,
        active: w.open - w.waiting,
        trackedTodaySeconds: t.today,
        trackedWeekSeconds: t.week,
      }
    })
    .sort((a, b) => b.active - a.active || b.open - a.open || a.name.localeCompare(b.name))

  return {
    agents,
    unassigned: [...open.keys()].filter((id) => !assignedOpen.has(id)).length,
    openTotal: open.size,
    overdueTotal: [...open.values()].filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length,
  }
}
