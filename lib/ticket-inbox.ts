/**
 * Inbox = support tickets nobody has picked up yet (no assignee, not closed).
 * Separate from priority: it answers "has anyone seen this?", newest first.
 */
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import {
  companies,
  find,
  findBy,
  get,
  teamMembers,
  ticketAssignees,
  type TicketsRow,
  users,
} from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export { isTicketScope, TICKET_SCOPE_LABELS, TICKET_SCOPES, type TicketScope } from '@/lib/ticket-scope'

/** Ticket ids that have at least one assignee. */
export async function loadAssignedTicketIds(): Promise<Set<number>> {
  const rows = await find(ticketAssignees, { select: ['ticketId'] })
  return new Set(rows.map((r) => r.ticketId))
}

/** "My tickets" = assigned to me, or belonging to a team I am a member of. */
export type MyTicketScope = { ticketIds: Set<number>; teamIds: Set<string> }

export async function loadMyTicketScope(userId: string): Promise<MyTicketScope> {
  const [assignments, memberships] = await Promise.all([findBy(ticketAssignees, { userId }), findBy(teamMembers, { userId })])
  return {
    ticketIds: new Set(assignments.map((r) => r.ticketId)),
    teamIds: new Set(memberships.map((m) => m.teamId)),
  }
}

export function isMyTicket(t: Pick<TicketsRow, 'id' | 'teamId'>, mine: MyTicketScope): boolean {
  return mine.ticketIds.has(t.id) || (!!t.teamId && mine.teamIds.has(t.teamId))
}

export function isInboxTicket(t: Pick<TicketsRow, 'id' | 'status' | 'ticketType'>, assigned: Set<number>): boolean {
  return (t.ticketType ?? DEFAULT_TICKET_TYPE) === DEFAULT_TICKET_TYPE && !assigned.has(t.id) && !isClosedLikeTicketStatus(t.status)
}

/**
 * Who hears about a new unassigned ticket:
 * the ticket's team, else the company's active team; plus the company's active manager.
 * Nobody found → all active admins and managers.
 */
async function newTicketRecipients(
  teamId: string | null,
  company: { activeTeamId: string | null; activeManagerId: string | null } | null
): Promise<string[]> {
  const ids = new Set<string>()
  const team = teamId || company?.activeTeamId || null
  if (team) {
    const members = await findBy(teamMembers, { teamId: team })
    members.forEach((m) => ids.add(m.userId))
  }
  if (company?.activeManagerId) ids.add(company.activeManagerId)
  if (ids.size === 0) {
    const leads = await find(users, { where: [['role', 'in', ['admin', 'manager']]] })
    leads.filter((u) => !u.deletedAt && u.status !== 'inactive').forEach((u) => ids.add(u.id))
  }
  return [...ids]
}

/** In-app bell notification for a new support ticket that has no assignee yet. */
export async function notifyNewUnassignedTicket(params: {
  ticketId: number
  ticketTitle: string
  teamId: string | null
  companyId: string | null
  /** Creator (excluded from recipients) */
  actorUserId: string
  actorName: string
  actorRole?: string | null
}): Promise<void> {
  const company = params.companyId ? await get(companies, params.companyId) : null
  const recipientUserIds = await newTicketRecipients(params.teamId, company)
  if (recipientUserIds.length === 0) return
  const from = company?.name ? `${params.actorName} (${company.name})` : params.actorName
  await notifyTicketUsers({
    recipientUserIds,
    excludeUserId: params.actorUserId,
    ticketId: params.ticketId,
    ticketTitle: params.ticketTitle,
    type: 'new_ticket',
    title: 'New ticket in Inbox',
    body: `${from} opened "${params.ticketTitle}" — nobody is assigned yet`,
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actorRole: params.actorRole ?? null,
  })
}
