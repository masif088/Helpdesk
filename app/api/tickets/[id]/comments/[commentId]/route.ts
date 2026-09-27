import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { deleteCommentCascade, get, ticketComments, update } from '@/lib/fsdb'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import { logTicketActivity } from '@/lib/ticket-activity-log'

/** PATCH /api/tickets/[id]/comments/[commentId] - Update comment */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, commentId } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { comment } = body

  const prev = await get(ticketComments, commentId)

  if (!prev) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  // Only allow editing another agent's comment if it is a note
  const isOwnComment = prev.userId === session.user.id
  if (!isOwnComment && prev.visibility !== 'note') {
    return NextResponse.json({ error: 'Cannot edit another agent\'s reply' }, { status: 403 })
  }

  const now = new Date()
  await update(ticketComments, commentId, {
    comment: comment ?? '',
    editedByUserId: session.user.id!,
    editedAt: now,
  })

  const actorRole: TicketActorRole = 'agent'
  if (String(prev.comment ?? '') !== String(comment ?? '')) {
    await logTicketActivity({
      ticketId,
      actorUserId: session.user.id!,
      actorRole,
      action: 'comment_updated',
      relatedCommentId: commentId,
      metadata: {
        body_preview: String(comment ?? '').replace(/<[^>]+>/g, ' ').trim().slice(0, 200),
        edited_other: !isOwnComment,
      },
    })
  }

  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true, editedByUserId: session.user.id, editedAt: now.toISOString() })
}

/** DELETE /api/tickets/[id]/comments/[commentId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, commentId } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id!,
    actorRole,
    action: 'comment_deleted',
    relatedCommentId: commentId,
    metadata: { comment_id: commentId },
  })

  await deleteCommentCascade(commentId)
  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}
