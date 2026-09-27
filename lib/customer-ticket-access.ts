import { getCustomerCompanyId } from '@/lib/customer-company'
import { find, get, tickets, type TicketsRow } from '@/lib/fsdb'
import { coerceTicketType } from '@/lib/ticket-classification'
import {
  isTicketVisibilityLevel,
  TICKET_VISIBILITY_LEVELS,
  userMatchesVisibilityRule,
} from '@/lib/ticket-visibility'
import { getTicketVisibilityRules } from '@/lib/ticket-visibility-server'

export type CustomerTicketRow = {
  companyId: string | null
  contactUserId: string | null
  createdBy: string | null
  visibility?: string | null
}

/** Ticket without company: contact or creator. */
export function customerOwnsPersonalTicket(ticket: CustomerTicketRow, userId: string): boolean {
  return ticket.contactUserId === userId || ticket.createdBy === userId
}

/** Whether a visibility value is allowed for the customer role under current rules. */
export async function customerMaySeeVisibility(visibility: string | null | undefined): Promise<boolean> {
  if (!visibility) return true
  if (!isTicketVisibilityLevel(visibility)) {
    // Legacy public/private/specific_users — company/ownership still gates access
    return true
  }
  const rules = await getTicketVisibilityRules()
  return userMatchesVisibilityRule(
    { role: 'customer', department: null, position: null },
    rules[visibility]
  )
}

/** Customer portal may see company tickets or personal ones (company null). */
export function customerCanAccessTicket(
  ticket: CustomerTicketRow,
  userId: string,
  customerCompanyId: string | null
): boolean {
  if (ticket.companyId) {
    return customerCompanyId !== null && ticket.companyId === customerCompanyId
  }
  return customerOwnsPersonalTicket(ticket, userId)
}

/** Visibility levels the customer role must not see (from configured rules). */
export async function customerBlockedVisibilityLevels(): Promise<string[]> {
  const rules = await getTicketVisibilityRules()
  return TICKET_VISIBILITY_LEVELS.filter(
    (level) =>
      !userMatchesVisibilityRule({ role: 'customer', department: null, position: null }, rules[level])
  )
}

/** Access check for the customer ticket list (company tickets + own personal tickets, minus blocked levels). */
export async function customerTicketsAccessPredicate(
  userId: string,
  customerCompanyId: string | null
): Promise<(t: Pick<TicketsRow, 'companyId' | 'contactUserId' | 'createdBy' | 'visibility'>) => boolean> {
  const blocked = new Set(await customerBlockedVisibilityLevels())
  return (t) => {
    const inScope = t.companyId
      ? customerCompanyId !== null && t.companyId === customerCompanyId
      : t.contactUserId === userId || t.createdBy === userId
    return inScope && !blocked.has(t.visibility)
  }
}

/**
 * All tickets a customer may see (before type/status filters): company tickets + personal ones.
 * Indexed equality queries merged; callers filter further in memory.
 */
export async function loadCustomerAccessibleTickets(
  userId: string,
  customerCompanyId: string | null
): Promise<TicketsRow[]> {
  const [byCompany, byContact, byCreator] = await Promise.all([
    customerCompanyId ? find(tickets, { where: [['companyId', '==', customerCompanyId]] }) : Promise.resolve([]),
    find(tickets, { where: [['contactUserId', '==', userId], ['companyId', '==', null]] }),
    find(tickets, { where: [['createdBy', '==', userId], ['companyId', '==', null]] }),
  ])
  const allow = await customerTicketsAccessPredicate(userId, customerCompanyId)
  const seen = new Set<number>()
  const out: TicketsRow[] = []
  for (const t of [...byCompany, ...byContact, ...byCreator]) {
    if (seen.has(t.id) || !allow(t)) continue
    seen.add(t.id)
    out.push(t)
  }
  return out
}

export async function assertCustomerMayAccessTicket(
  userId: string,
  ticketId: number
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  const customerCompanyId = await getCustomerCompanyId(userId)
  const trow = await get(tickets, ticketId)
  if (!trow) return { ok: false, status: 404 }
  if (!customerCanAccessTicket(trow, userId, customerCompanyId)) {
    return { ok: false, status: 403 }
  }
  if (!(await customerMaySeeVisibility(trow.visibility))) {
    return { ok: false, status: 403 }
  }
  const cls = coerceTicketType(trow.ticketType)
  if (cls === 'spam' || cls === 'trash' || cls === 'project') {
    return { ok: false, status: 403 }
  }
  return { ok: true }
}
