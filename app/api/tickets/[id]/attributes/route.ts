import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { insert, ticketAttributs } from '@/lib/fsdb'
import { logTicketActivity, type TicketActorRole } from '@/lib/ticket-activity-log'

/** POST /api/tickets/[id]/attributes - Add attribute */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const body = await request.json()
  const { meta_key, meta_value } = body

  const row = await insert(ticketAttributs, {
    ticketId,
    metaKey: meta_key || 'key',
    metaValue: meta_value ?? null,
  })

  if (!row) {
    return NextResponse.json({ error: 'Failed to create attribute' }, { status: 500 })
  }

  bumpTicketDataVersion(ticketId)

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id ?? null,
    actorRole,
    action: 'ticket_attribute_added',
    metadata: {
      attribute_id: row.id,
      meta_key: row.metaKey,
      meta_value: row.metaValue,
    },
  })

  return NextResponse.json({
    id: row.id,
    ticket_id: row.ticketId,
    meta_key: row.metaKey,
    meta_value: row.metaValue,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}
