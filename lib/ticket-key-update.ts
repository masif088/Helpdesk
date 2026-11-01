/**
 * The database side of a ticket change made with an API key (`tickets:update`): the request is checked against what a key may
 * change, the status and people must exist, and the ticket must be one the key's user may see. The result is a body for the normal
 * ticket PATCH route, so notifications, queue order, automation and the activity log all behave exactly as for a person.
 */
import { isAdminOrManager } from '@/lib/auth-utils'
import { find, findBy, get, getManyMap, ticketAssignees, tickets, ticketStatuses, users } from '@/lib/fsdb'
import { parseKeyTicketPatch, toPatchBody } from '@/lib/ticket-key-update-core'
import { staffTicketPredicate } from '@/lib/ticket-staff-access'

export type KeyUpdateResult = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }

export async function prepareKeyTicketUpdate(raw: unknown, ctx: { ticketId: number; userId: string; role: string | undefined }): Promise<KeyUpdateResult> {
  if ((ctx.role ?? '').toLowerCase() === 'customer') return { ok: false, status: 403, error: 'A key of a client cannot change tickets' }
  const parsed = parseKeyTicketPatch(raw)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  const { patch } = parsed

  const ticket = await get(tickets, ctx.ticketId)
  if (!ticket) return { ok: false, status: 404, error: 'Ticket not found' }
  if (!(await staffTicketPredicate(ctx.userId, isAdminOrManager(ctx.role)))(ticket)) return { ok: false, status: 404, error: 'Ticket not found' }

  if (patch.status !== undefined) {
    const statuses = await find(ticketStatuses, { select: ['slug', 'isActive'] })
    if (!statuses.some((s) => s.slug === patch.status && s.isActive !== false)) return { ok: false, status: 400, error: `Unknown status "${patch.status}" (see GET /api/tickets/lookup)` }
  }

  const wanted = [...new Set([...(patch.assignees ?? []), ...(patch.addAssignees ?? [])])]
  if (wanted.length) {
    const found = await getManyMap(users, wanted)
    const bad = wanted.filter((id) => {
      const u = found.get(id)
      return !u || u.deletedAt || u.status !== 'active' || !u.role || u.role.toLowerCase() === 'customer'
    })
    if (bad.length) return { ok: false, status: 400, error: `Not an active team member: ${bad.slice(0, 3).join(', ')}` }
  }

  const current = patch.assignees === undefined ? (await findBy(ticketAssignees, { ticketId: ctx.ticketId })).map((a) => a.userId) : []
  return { ok: true, body: toPatchBody(patch, current) }
}
