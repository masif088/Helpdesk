import { getCustomerCompanyId } from '@/lib/customer-company'
import { loadCustomerAccessibleTickets } from '@/lib/customer-ticket-access'
import type { TicketsRow } from '@/lib/fsdb'
import { FINISHED_STATUSES } from '@/lib/sla'
import { coerceTicketType,DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

/** A support ticket the team has finished and the client has not rated yet. */
export const awaitsRating = (t: Pick<TicketsRow, 'status' | 'ticketType' | 'csatRating'>) =>
  FINISHED_STATUSES.has(t.status) && coerceTicketType(t.ticketType) === DEFAULT_TICKET_TYPE && !t.csatRating

export type ToRateItem = { id: number; title: string; status: string; finishedAt: string }

/** The client's finished tickets that still wait for a rating, most recently finished first. */
export async function ticketsToRate(userId: string): Promise<ToRateItem[]> {
  const rows = await loadCustomerAccessibleTickets(userId, await getCustomerCompanyId(userId))
  return rows
    .filter(awaitsRating)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((t) => ({ id: t.id, title: t.title, status: t.status, finishedAt: new Date(t.updatedAt).toISOString() }))
}
