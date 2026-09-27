import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { get, screenshots, update } from '@/lib/fsdb'

/** PATCH /api/screenshots/link - Update screenshot ticket link (for web app with session) */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, ticket_id } = body

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const existing = await get(screenshots, id)
  const updated =
    existing && existing.userId === session.user.id
      ? await update(screenshots, id, {
          ticketId: ticket_id != null && ticket_id !== '' ? Number(ticket_id) : null,
          updatedAt: new Date(),
        })
      : null

  if (!updated) {
    return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, screenshot: updated })
}
