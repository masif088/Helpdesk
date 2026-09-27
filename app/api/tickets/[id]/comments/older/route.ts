import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { customerCanAccessTicket } from '@/lib/customer-ticket-access'
import { get, tickets } from '@/lib/fsdb'
import {
  fetchTicketCommentsWindow,
  TICKET_COMMENTS_PAGE_SIZE,
  type TicketCommentOlderCursor,
} from '@/lib/ticket-detail'

/** GET /api/tickets/[id]/comments/older?before_created_at=&before_id= — next page of older comments */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const before_created_at = searchParams.get('before_created_at')?.trim()
  const before_id = searchParams.get('before_id')?.trim()
  if (!before_created_at || !before_id) {
    return NextResponse.json({ error: 'before_created_at and before_id required' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const userId = session.user.id!
  let customerPortal: { userId: string; companyId: string | null } | undefined
  if (role === 'customer') {
    customerPortal = { userId, companyId: await getCustomerCompanyId(userId) }
  }

  const trow = await get(tickets, ticketId)
  if (!trow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (customerPortal && !customerCanAccessTicket(trow, customerPortal.userId, customerPortal.companyId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const olderThan: TicketCommentOlderCursor = { created_at: before_created_at, id: before_id }
  const limitParam = searchParams.get('limit')
  const pageSize = Math.min(50, Math.max(1, parseInt(limitParam || String(TICKET_COMMENTS_PAGE_SIZE), 10) || TICKET_COMMENTS_PAGE_SIZE))

  const {
    comments,
    comments_has_older,
    comments_older_cursor,
    comments_older_remaining,
  } = await fetchTicketCommentsWindow(
    ticketId,
    customerPortal ? { customerPortal } : undefined,
    'older',
    olderThan,
    pageSize
  )

  return NextResponse.json({
    comments,
    comments_has_older,
    comments_older_cursor,
    comments_older_remaining,
  })
}
