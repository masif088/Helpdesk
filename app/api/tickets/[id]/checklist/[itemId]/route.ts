import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { get, type Patch, remove, ticketChecklist, update, users } from '@/lib/fsdb'
import { mapChecklistItemToDto } from '@/lib/ticket-checklist-map'

/** PATCH /api/tickets/[id]/checklist/[itemId] - Toggle or update checklist item */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied

  const { id, itemId } = await params
  const ticketId = parseInt(id, 10)
  const body = await request.json().catch(() => ({}))

  const updates: Patch<typeof ticketChecklist.$inferSelect> = {}

  if (body.is_completed !== undefined) {
    const completing = Boolean(body.is_completed)
    updates.isCompleted = completing
    if (completing) {
      updates.completedAt = new Date()
      updates.completedByUserId = session.user.id
      if (body.completion_note !== undefined) {
        const note =
          typeof body.completion_note === 'string' ? body.completion_note.trim() : ''
        updates.completionNote = note.length > 0 ? note : null
      }
    } else {
      updates.completedAt = null
      updates.completedByUserId = null
    }
  }

  if (body.title !== undefined) {
    updates.title = String(body.title)
  }

  if (body.completion_note !== undefined && body.is_completed === undefined) {
    const note = typeof body.completion_note === 'string' ? body.completion_note.trim() : ''
    updates.completionNote = note.length > 0 ? note : null
  }

  if ('group_name' in body) {
    updates.groupName = typeof body.group_name === 'string' ? body.group_name.trim() || null : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 })
  }

  const row = await update(ticketChecklist, itemId, updates)

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let completer: { id: string; fullName: string | null; email: string } | undefined
  if (row.completedByUserId) {
    completer = (await get(users, row.completedByUserId)) ?? undefined
  }

  if (!isNaN(ticketId)) bumpTicketDataVersion(ticketId)
  return NextResponse.json(mapChecklistItemToDto(row, completer))
}

/** DELETE /api/tickets/[id]/checklist/[itemId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied

  const { id, itemId } = await params
  const ticketId = parseInt(id, 10)
  await remove(ticketChecklist, itemId)
  if (!isNaN(ticketId)) bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}
