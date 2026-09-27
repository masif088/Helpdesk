import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { purgeTrashedTickets } from '@/lib/ticket-purge'

/** POST /api/tickets/purge { ids } — admin only; permanently deletes tickets that are in Trash. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Only admins can delete tickets permanently' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
  if (ids.length === 0) return NextResponse.json({ error: 'ids is required' }, { status: 400 })
  if (ids.length > 200) return NextResponse.json({ error: 'At most 200 tickets at a time' }, { status: 400 })
  return NextResponse.json(await purgeTrashedTickets(ids))
}
