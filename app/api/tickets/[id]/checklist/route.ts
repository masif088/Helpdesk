import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { find, getManyMap, insert, ticketChecklist, users } from '@/lib/fsdb'
import { mapChecklistItemToDto } from '@/lib/ticket-checklist-map'

/** GET /api/tickets/[id]/checklist - List checklist items */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const items = await find(ticketChecklist, {
    where: [['ticketId', '==', ticketId]],
    orderBy: [['orderIndex', 'asc']],
  })
  const completerById = await getManyMap(users, items.map((i) => i.completedByUserId))
  const rows = items.map((item) => ({
    item,
    completer: item.completedByUserId ? completerById.get(item.completedByUserId) ?? null : null,
  }))

  return NextResponse.json(rows.map((r) => mapChecklistItemToDto(r.item, r.completer ?? undefined)))
}

/** POST /api/tickets/[id]/checklist - Add checklist item */
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
  const { title, order_index, group_name } = body

  const row = await insert(ticketChecklist, {
    ticketId: ticketId,
    title: title || 'Item',
    isCompleted: false,
    orderIndex: order_index ?? 0,
    groupName: typeof group_name === 'string' ? group_name.trim() || null : null,
  })

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  bumpTicketDataVersion(ticketId)

  return NextResponse.json(mapChecklistItemToDto(row))
}
