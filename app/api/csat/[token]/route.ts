import { NextResponse } from 'next/server'

import { CsatError, recordCsat, ticketForRatingToken } from '@/lib/csat'
import { get, users } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

/**
 * POST /api/csat/[token] { rating: 1-5, comment? }
 * Public: the signed link from the closing email stands in for the login. The rating is stored as if the client
 * who opened the ticket had given it in the portal.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ticket = await ticketForRatingToken((await params).token)
  if (!ticket?.createdBy) return NextResponse.json({ error: 'This link is not valid' }, { status: 404 })
  const requester = await get(users, ticket.createdBy)
  const body = (await request.json().catch(() => ({}))) as { rating?: unknown; comment?: unknown }
  try {
    const csat = await recordCsat(ticket, { id: ticket.createdBy, name: requester?.fullName ?? null }, body.rating, body.comment)
    return NextResponse.json({ csat })
  } catch (e) {
    if (e instanceof CsatError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
