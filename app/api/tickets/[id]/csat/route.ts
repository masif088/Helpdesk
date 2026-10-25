import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { CsatError, recordCsat } from '@/lib/csat'
import { assertCustomerMayAccessTicket } from '@/lib/customer-ticket-access'
import { get, tickets } from '@/lib/fsdb'

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

  const body = (await request.json().catch(() => ({}))) as { rating?: unknown; comment?: unknown }
  try {
    return NextResponse.json({ csat: await recordCsat(ticket, user, body.rating, body.comment) })
  } catch (e) {
    if (e instanceof CsatError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
