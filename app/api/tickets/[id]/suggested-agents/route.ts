import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { suggestAgentsForTicket } from '@/lib/agent-suggestions'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'

/** GET /api/tickets/[id]/suggested-agents — agents ranked for this ticket (skills of its type and tags, then workload). Internal users only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied
  const ticketId = parseInt((await params).id, 10)
  if (!Number.isFinite(ticketId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const result = await suggestAgentsForTicket(ticketId)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result)
}
