import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { customerTicketsAccessPredicate } from '@/lib/customer-ticket-access'
import {
  type Cond,
  find,
  getManyMap,
  scan,
  tags,
  ticketActivityLog,
  type TicketActivityLogRow,
  tickets,
  type TicketsRow,
  ticketTags,
  users,
  type UsersRow,
} from '@/lib/fsdb'
import { TICKET_ACTIVITY_ACTIONS, type TicketActivityAction } from '@/lib/ticket-activity-actions'
import { buildTicketVisibilityPredicate } from '@/lib/ticket-visibility-server'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
/** Upper bound of activity rows inspected per request when filtering in memory (search / access rules). */
const MAX_SCAN = 10_000

type Joined = { log: TicketActivityLogRow; ticket: TicketsRow; actor: UsersRow | null }

/**
 * GET /api/ticket-activity — recent ticket_activity_log rows scoped like GET /api/tickets (company / visibility).
 * Query: limit, offset, action (TicketActivityAction), search (ticket id, title, actor, metadata text)
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id!
  const role = (session.user as { role?: string }).role?.toLowerCase()

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10)),
    MAX_LIMIT
  )
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const actionParam = url.searchParams.get('action')?.trim() ?? ''
  const actionFilter: TicketActivityAction | null =
    actionParam && (TICKET_ACTIVITY_ACTIONS as readonly string[]).includes(actionParam)
      ? (actionParam as TicketActivityAction)
      : null

  const searchRaw = url.searchParams.get('search')?.trim() ?? ''
  const needle = searchRaw.toLowerCase()
  const idStr = searchRaw.startsWith('#') ? searchRaw.slice(1).trim() : searchRaw
  const idNum = parseInt(idStr, 10)
  const searchId = !Number.isNaN(idNum) && idStr !== '' && String(idNum) === idStr ? idNum : null

  let ticketAllowed: ((t: TicketsRow) => boolean) | null = null
  if (role === 'customer') {
    const companyId = await getCustomerCompanyId(userId)
    ticketAllowed = await customerTicketsAccessPredicate(userId, companyId)
  } else if (!isAdmin(role)) {
    ticketAllowed = await buildTicketVisibilityPredicate(userId, role)
  }

  const matchesSearch = (j: Joined): boolean => {
    if (!needle) return true
    if (searchId !== null && j.ticket.id === searchId) return true
    return (
      (j.ticket.title ?? '').toLowerCase().includes(needle) ||
      (j.actor?.fullName ?? '').toLowerCase().includes(needle) ||
      (j.actor?.email ?? '').toLowerCase().includes(needle) ||
      JSON.stringify(j.log.metadata ?? '').toLowerCase().includes(needle)
    )
  }

  // Logs without a ticket are skipped below (inner join); no inequality filter keeps the index simple.
  const where: Cond<TicketActivityLogRow>[] = []
  if (actionFilter) where.push(['action', '==', actionFilter])

  // Rows are joined to their ticket (inner join: logs of deleted tickets are skipped) and actor, then filtered.
  const matched: Joined[] = []
  let total = 0
  let scanned = 0
  for await (const page of scan(ticketActivityLog, { where, orderBy: [['createdAt', 'desc']] }, 500)) {
    scanned += page.length
    const [ticketById, actorById] = await Promise.all([
      getManyMap(tickets, page.map((l) => l.ticketId)),
      getManyMap(users, page.map((l) => l.actorUserId)),
    ])
    for (const log of page) {
      const ticket = log.ticketId != null ? ticketById.get(String(log.ticketId)) : undefined
      if (!ticket) continue
      if (ticketAllowed && !ticketAllowed(ticket)) continue
      const j: Joined = { log, ticket, actor: log.actorUserId ? actorById.get(log.actorUserId) ?? null : null }
      if (!matchesSearch(j)) continue
      total++
      if (total > offset && matched.length < limit) matched.push(j)
    }
    if (scanned >= MAX_SCAN) break
  }

  // Fetch tags for all ticket IDs in this page
  const ticketIds = [...new Set(matched.map((r) => r.ticket.id))]
  const links = await find(ticketTags, { where: [['ticketId', 'in', ticketIds]] })
  const tagById = await getManyMap(tags, links.map((l) => l.tagId))
  const tagsByTicket: Record<number, { id: string; name: string; color: string | null }[]> = {}
  for (const l of links) {
    const t = tagById.get(l.tagId)
    if (!t) continue
    if (!tagsByTicket[l.ticketId]) tagsByTicket[l.ticketId] = []
    tagsByTicket[l.ticketId].push({ id: t.id, name: t.name ?? '', color: t.color ?? null })
  }

  const data = matched.map(({ log, ticket, actor }) => ({
    id: log.id,
    ticket_id: ticket.id,
    ticket_title: ticket.title,
    ticket_status: ticket.status ?? null,
    ticket_tags: tagsByTicket[ticket.id] ?? [],
    action: log.action,
    actor_role: log.actorRole,
    metadata: log.metadata,
    created_at: log.createdAt ? new Date(log.createdAt).toISOString() : '',
    actor:
      actor?.fullName || actor?.email || actor?.avatarUrl
        ? {
            name: actor?.fullName ?? null,
            email: actor?.email ?? null,
            avatar_url: actor?.avatarUrl ?? null,
          }
        : null,
  }))

  return NextResponse.json({ data, total })
}
