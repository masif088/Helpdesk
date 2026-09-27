import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { commentAttachments, get, remove, ticketComments } from '@/lib/fsdb'
import { deleteObject } from '@/lib/storage-idrive'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import { logTicketActivity } from '@/lib/ticket-activity-log'

/** DELETE /api/tickets/[id]/comments/[commentId]/attachments/[attachmentId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string; attachmentId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, commentId, attachmentId } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const commentDoc = await get(ticketComments, commentId)
  const comment = commentDoc && commentDoc.ticketId === ticketId ? commentDoc : null

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }
  if (comment.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const attDoc = await get(commentAttachments, attachmentId)
  const att = attDoc && attDoc.commentId === commentId ? attDoc : null

  if (!att) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  await remove(commentAttachments, attachmentId)

  const fp = att.filePath?.trim()
  if (fp) {
    const result = await deleteObject(fp.replace(/^\/+/, ''))
    if (!result.ok) {
      console.error('[DELETE comment attachment] storage', result.error)
    }
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id,
    actorRole,
    action: 'comment_attachment_deleted',
    relatedCommentId: commentId,
    metadata: { file_name: att.fileName ?? '' },
  })

  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}
