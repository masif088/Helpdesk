/** Staff queue views on the support list (client-safe; server helpers live in `ticket-inbox.ts`). */
export const TICKET_SCOPES = ['inbox', 'mine'] as const
export type TicketScope = (typeof TICKET_SCOPES)[number]

export function isTicketScope(v: unknown): v is TicketScope {
  return typeof v === 'string' && (TICKET_SCOPES as readonly string[]).includes(v)
}

export const TICKET_SCOPE_LABELS: Record<TicketScope, string> = {
  inbox: 'Inbox',
  mine: 'My tickets',
}
