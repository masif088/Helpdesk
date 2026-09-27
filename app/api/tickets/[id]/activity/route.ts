import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { count, find, getManyMap, ticketActivityLog, users } from '@/lib/fsdb'

const DEFAULT_LIMIT = 20

/** GET /api/tickets/[id]/activity - Append-only activity log for this ticket */
export async function GET(
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

  const url = new URL(request.url)
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10)), 100)
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const [total, logRows] = await Promise.all([
    count(ticketActivityLog, [['ticketId', '==', ticketId]]),
    find(ticketActivityLog, {
      where: [['ticketId', '==', ticketId]],
      orderBy: [['createdAt', 'desc']],
      limit,
      offset,
    }),
  ])
  const actorById = await getManyMap(users, logRows.map((r) => r.actorUserId))
  const rows = logRows.map((r) => {
    const actor = r.actorUserId ? actorById.get(r.actorUserId) : undefined
    return {
      id: r.id,
      ticket_id: r.ticketId,
      actor_user_id: r.actorUserId,
      actor_role: r.actorRole,
      action: r.action,
      metadata: r.metadata,
      related_comment_id: r.relatedCommentId,
      created_at: r.createdAt,
      actor_name: actor?.fullName ?? null,
      actor_email: actor?.email ?? null,
      actor_avatar_url: actor?.avatarUrl ?? null,
    }
  })

  const data = rows.map((r) => ({
    id: r.id,
    ticket_id: r.ticket_id,
    actor_user_id: r.actor_user_id,
    actor_role: r.actor_role,
    action: r.action,
    metadata: r.metadata,
    related_comment_id: r.related_comment_id,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    actor: r.actor_user_id
      ? {
          name: r.actor_name ?? null,
          email: r.actor_email ?? null,
          avatar_url: r.actor_avatar_url ?? null,
        }
      : null,
  }))

  return NextResponse.json({ data, total, limit, offset })
}
