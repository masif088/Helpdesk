/**
 * Signed links that let a client rate a ticket without logging in (the "Rate this ticket" buttons in the closing email).
 * A link is `<ticketId>.<signature>`; the signature covers the ticket id and the person who opened the ticket, so it
 * cannot be forged and stops working if the ticket changes hands. Pure helpers: the secret is passed in.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const sign = (secret: string, ticketId: number, userId: string) =>
  createHmac('sha256', secret).update(`csat|${ticketId}|${userId}`).digest('base64url')

export function csatToken(secret: string, ticketId: number, userId: string): string {
  return `${ticketId}.${sign(secret, ticketId, userId)}`
}

/** The ticket id inside a link, or null when it is not shaped like one. Says nothing about whether it is valid. */
export function csatTokenTicketId(token: string): number | null {
  const m = /^(\d{1,12})\.[A-Za-z0-9_-]{20,64}$/.exec(token)
  return m ? Number(m[1]) : null
}

/** Is this link genuinely made for this ticket and requester? */
export function csatTokenValid(secret: string, token: string, userId: string): boolean {
  const ticketId = csatTokenTicketId(token)
  if (ticketId == null || !secret) return false
  const a = Buffer.from(token)
  const b = Buffer.from(csatToken(secret, ticketId, userId))
  return a.length === b.length && timingSafeEqual(a, b)
}
