import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { assertCustomerMayAccessTicket } from '@/lib/customer-ticket-access'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { find, get, ticketAssignees, tickets, update, users } from '@/lib/fsdb'
import { FINISHED_STATUSES } from '@/lib/sla'

/** Ratings of this or lower tell the team right away */
const LOW_RATING = 2

/**
 * POST /api/tickets/[id]/csat { rating: 1-5, comment? }
 * The client rates a finished ticket (and may change the answer later). Staff cannot rate on a client's behalf.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { id: string; role?: string; name?: string | null }
  if (user.role?.toLowerCase() !== 'customer') return NextResponse.json({ error: 'Only the client can rate a ticket' }, { status: 403 })

  const ticketId = parseInt((await params).id, 10)
  if (!Number.isFinite(ticketId)) return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 })
  const access = await assertCustomerMayAccessTicket(user.id, ticketId)
  if (!access.ok) return NextResponse.json({ error: access.status === 404 ? 'Not found' : 'Forbidden' }, { status: access.status })

  const ticket = await get(tickets, ticketId)
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!FINISHED_STATUSES.has(ticket.status)) return NextResponse.json({ error: 'You can rate a ticket once it is resolved' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as { rating?: unknown; comment?: unknown }
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: 'Rating must be 1 to 5' }, { status: 400 })
  const comment = String(body.comment ?? '').trim().slice(0, 1000) || null

  const now = new Date()
  await update(tickets, ticketId, { csatRating: rating, csatComment: comment, csatAt: now, csatBy: user.id })

  if (rating <= LOW_RATING) {
    const [assignees, managers] = await Promise.all([
      find(ticketAssignees, { where: [['ticketId', '==', ticketId]], select: ['userId'] }),
      find(users, { where: [['role', 'in', ['admin', 'manager']]] }),
    ])
    await notifyTicketUsers({
      recipientUserIds: [...assignees.map((a) => a.userId), ...managers.filter((m) => !m.deletedAt && m.status !== 'inactive').map((m) => m.id)],
      ticketId,
      ticketTitle: ticket.title,
      type: 'csat_low',
      title: `Low rating: ${rating}/5`,
      body: `${user.name || 'A client'} rated "${ticket.title}" ${rating}/5${comment ? `: ${comment.slice(0, 200)}` : ''}`,
      actorUserId: user.id,
      actorName: user.name || 'Client',
      actorRole: 'customer',
    }).catch((e) => console.error('[csat] notify:', e))
  }

  return NextResponse.json({ csat: { rating, comment, at: now.toISOString() } })
}
