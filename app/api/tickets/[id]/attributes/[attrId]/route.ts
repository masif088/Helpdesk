import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { get, remove, ticketAttributs, update } from '@/lib/fsdb'
import { logTicketActivity, type TicketActorRole } from '@/lib/ticket-activity-log'

/** PATCH /api/tickets/[id]/attributes/[attrId] - Update attribute */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; attrId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, attrId } = await params
  const ticketId = parseInt(id, 10)
  const body = await request.json()
  const { meta_value } = body

  const current = await get(ticketAttributs, attrId)
  if (!current) {
    return NextResponse.json({ error: 'Attribute not found' }, { status: 404 })
  }

  await update(ticketAttributs, attrId, { metaValue: meta_value ?? null, updatedAt: new Date() })

  if (!isNaN(ticketId)) bumpTicketDataVersion(ticketId)

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id ?? null,
    actorRole,
    action: 'ticket_attribute_updated',
    metadata: {
      attribute_id: attrId,
      meta_key: current.metaKey,
      changes: {
        meta_value: { from: current.metaValue, to: meta_value ?? null },
      },
      changed_keys: ['meta_value'],
    },
  })

  return NextResponse.json({ ok: true })
}

/** DELETE /api/tickets/[id]/attributes/[attrId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; attrId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, attrId } = await params
  const ticketId = parseInt(id, 10)
  const current = await get(ticketAttributs, attrId)
  if (!current) {
    return NextResponse.json({ error: 'Attribute not found' }, { status: 404 })
  }

  await remove(ticketAttributs, attrId)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }
  bumpTicketDataVersion(ticketId)

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id ?? null,
    actorRole,
    action: 'ticket_attribute_deleted',
    metadata: {
      attribute_id: attrId,
      meta_key: current.metaKey,
      meta_value: current.metaValue,
    },
  })

  return NextResponse.json({ ok: true })
}
