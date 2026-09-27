import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { deleteTagRestrict, get, type Patch, tags, update } from '@/lib/fsdb'
import { logSettingsDeleted, logSettingsUpdated } from '@/lib/settings-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

const TAG_LOG_KEYS = ['name', 'slug', 'color']

/** PATCH /api/tags/[id] - Update tag */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, slug, color } = body

  const values: Record<string, unknown> = {}
  if (name !== undefined) values.name = String(name).trim()
  if (slug !== undefined) values.slug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (color !== undefined) values.color = color || '#000000'

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const current = await get(tags, id)
  if (!current) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  const updated = await update(tags, id, values as Patch<typeof tags.$inferSelect>)

  if (!updated) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  await logSettingsUpdated({
    session,
    entityType: 'tag',
    entityId: id,
    label: updated.name,
    before: {
      name: current.name,
      slug: current.slug,
      color: current.color ?? '#000000',
    },
    after: {
      name: updated.name,
      slug: updated.slug,
      color: updated.color ?? '#000000',
    },
    keys: TAG_LOG_KEYS,
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    color: updated.color ?? '#000000',
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/tags/[id] - Delete tag */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const current = await get(tags, id)
    if (!current) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    const deleted = await deleteTagRestrict(id)

    if (!deleted) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    await logSettingsDeleted({
      session,
      entityType: 'tag',
      entityId: id,
      label: current.name,
      snapshot: { name: current.name, slug: current.slug, color: current.color ?? '#000000' },
    })

    revalidateTicketsLookupCatalog()
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return NextResponse.json(
        { error: 'Cannot delete: this tag is currently in use on one or more tickets. It must be removed from all tickets before deletion.' },
        { status: 409 }
      )
    }
    console.error('[DELETE tags]', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
