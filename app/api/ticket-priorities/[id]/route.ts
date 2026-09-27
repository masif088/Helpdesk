import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { get, type Patch, remove, ticketPriorities, update } from '@/lib/fsdb'
import { logSettingsDeleted, logSettingsUpdated } from '@/lib/settings-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

const PRIORITY_LOG_KEYS = ['title', 'slug', 'color', 'sort_order', 'description']

/** PATCH /api/ticket-priorities/[id] */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const priorityId = parseInt(id, 10)
  if (isNaN(priorityId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await request.json()
  const { title, slug, color, sort_order, description } = body

  const values: Record<string, unknown> = {}
  if (title !== undefined) values.title = String(title).trim()
  if (slug !== undefined) values.slug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (color !== undefined) values.color = color || '#000000'
  if (sort_order !== undefined) values.sortOrder = Number(sort_order) ?? 0
  if (description !== undefined) values.description = typeof description === 'string' ? description : ''

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const current = await get(ticketPriorities, priorityId)
  if (!current) {
    return NextResponse.json({ error: 'Priority not found' }, { status: 404 })
  }

  const updated = await update(ticketPriorities, priorityId, values as Patch<typeof ticketPriorities.$inferSelect>)

  if (!updated) {
    return NextResponse.json({ error: 'Priority not found' }, { status: 404 })
  }

  const snap = (r: typeof current) => ({
    title: r.title,
    slug: r.slug,
    color: r.color ?? '#000000',
    sort_order: r.sortOrder ?? 0,
    description: r.description ?? '',
  })
  await logSettingsUpdated({
    session,
    entityType: 'ticket_priority',
    entityId: String(priorityId),
    label: updated.title,
    before: snap(current),
    after: snap(updated),
    keys: PRIORITY_LOG_KEYS,
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: updated.id,
    slug: updated.slug,
    title: updated.title,
    description: updated.description ?? '',
    color: updated.color ?? '#000000',
    sort_order: updated.sortOrder ?? 0,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/ticket-priorities/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const priorityId = parseInt(id, 10)
  if (isNaN(priorityId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const current = await get(ticketPriorities, priorityId)
    if (!current) {
      return NextResponse.json({ error: 'Priority not found' }, { status: 404 })
    }

    const deleted = await remove(ticketPriorities, priorityId)

    if (!deleted) {
      return NextResponse.json({ error: 'Priority not found' }, { status: 404 })
    }

    await logSettingsDeleted({
      session,
      entityType: 'ticket_priority',
      entityId: String(priorityId),
      label: current.title,
      snapshot: {
        title: current.title,
        slug: current.slug,
        color: current.color ?? '#000000',
        sort_order: current.sortOrder ?? 0,
        description: current.description ?? '',
      },
    })

    revalidateTicketsLookupCatalog()
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return NextResponse.json(
        { error: 'Cannot delete: one or more tickets use this priority. Change those tickets first.' },
        { status: 409 }
      )
    }
    console.error('[DELETE ticket-priorities]', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
