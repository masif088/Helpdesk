/** Saving a client's rating of a finished ticket: shared by the portal and by the public link in the closing email. */
import { csatToken, csatTokenTicketId, csatTokenValid } from '@/lib/csat-token'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { find, get, ticketAssignees, tickets, type TicketsRow, update, users } from '@/lib/fsdb'
import { FINISHED_STATUSES } from '@/lib/sla'

/** Ratings of this or lower tell the team right away */
const LOW_RATING = 2

export class CsatError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** Signing secret for public rating links (CSAT_LINK_SECRET, else the scheduler secret, else the Firebase private key). */
function linkSecret(): string {
  return process.env.CSAT_LINK_SECRET?.trim() || process.env.SYNC_INBOX_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.FIREBASE_PRIVATE_KEY?.trim() || ''
}

/** Public rating link for a ticket, or null when the ticket has no requester or no secret is configured. */
export function publicRatingUrl(baseUrl: string, ticket: Pick<TicketsRow, 'id' | 'createdBy'>, rating?: number): string | null {
  const secret = linkSecret()
  if (!secret || !ticket.createdBy) return null
  return `${baseUrl.replace(/\/$/, '')}/rate/${csatToken(secret, ticket.id, ticket.createdBy)}${rating ? `?r=${rating}` : ''}`
}

/** The ticket behind a public rating link; null when the link is not genuine. */
export async function ticketForRatingToken(token: string): Promise<TicketsRow | null> {
  const id = csatTokenTicketId(token)
  if (id == null) return null
  const ticket = await get(tickets, id)
  if (!ticket?.createdBy || !csatTokenValid(linkSecret(), token, ticket.createdBy)) return null
  return ticket
}

/** Store the rating (a client may change the answer later). Low ratings tell the team. */
export async function recordCsat(ticket: TicketsRow, by: { id: string; name?: string | null }, rating: unknown, commentRaw: unknown) {
  if (!FINISHED_STATUSES.has(ticket.status)) throw new CsatError('You can rate a ticket once it is resolved', 400)
  const n = Number(rating)
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new CsatError('Rating must be 1 to 5', 400)
  const comment = String(commentRaw ?? '').trim().slice(0, 1000) || null

  const now = new Date()
  await update(tickets, ticket.id, { csatRating: n, csatComment: comment, csatAt: now, csatBy: by.id })

  if (n <= LOW_RATING) {
    const [assignees, managers] = await Promise.all([
      find(ticketAssignees, { where: [['ticketId', '==', ticket.id]], select: ['userId'] }),
      find(users, { where: [['role', 'in', ['admin', 'manager']]] }),
    ])
    await notifyTicketUsers({
      recipientUserIds: [...assignees.map((a) => a.userId), ...managers.filter((m) => !m.deletedAt && m.status !== 'inactive').map((m) => m.id)],
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      type: 'csat_low',
      title: `Low rating: ${n}/5`,
      body: `${by.name || 'A client'} rated "${ticket.title}" ${n}/5${comment ? `: ${comment.slice(0, 200)}` : ''}`,
      actorUserId: by.id,
      actorName: by.name || 'Client',
      actorRole: 'customer',
    }).catch((e) => console.error('[csat] notify:', e))
  }
  return { rating: n, comment, at: now.toISOString() }
}
