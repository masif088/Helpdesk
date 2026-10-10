import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { canAccessTicketAttributes } from '@/lib/auth-utils'
import { deleteTicketTypeRestrict, get, type Patch, ticketTypes, update } from '@/lib/fsdb'
import { logSettingsDeleted, logSettingsUpdated } from '@/lib/settings-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'
import { normalizeSkills } from '@/lib/user-skills'
import { knownSkills } from '@/lib/user-skills-server'

const TYPE_LOG_KEYS = ['title', 'slug', 'color', 'sort_order', 'description', 'is_agent_only', 'required_skills']

/** PATCH /api/ticket-types/[id] - Update ticket type */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, canAccessTicketAttributes)
  if (denied) return denied

  const { id } = await params
  const typeId = parseInt(id, 10)
  if (isNaN(typeId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await request.json()
  const { title, slug, color, sort_order, description, is_agent_only, required_skills } = body

  const values: Record<string, unknown> = {}
  if (title !== undefined) values.title = String(title).trim()
  if (slug !== undefined) values.slug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (color !== undefined) values.color = color || '#000000'
  if (sort_order !== undefined) values.sortOrder = Number(sort_order) ?? 0
  if (description !== undefined) values.description = typeof description === 'string' ? description : ''
  if (is_agent_only !== undefined) values.isAgentOnly = Boolean(is_agent_only)
  if (required_skills !== undefined) values.requiredSkills = normalizeSkills(required_skills, await knownSkills())

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const current = await get(ticketTypes, typeId)
  if (!current) {
    return NextResponse.json({ error: 'Ticket type not found' }, { status: 404 })
  }

  const updated = await update(ticketTypes, typeId, values as Patch<typeof ticketTypes.$inferSelect>)

  if (!updated) {
    return NextResponse.json({ error: 'Ticket type not found' }, { status: 404 })
  }

  const snap = (r: typeof current) => ({
    title: r.title,
    slug: r.slug,
    color: r.color ?? '#000000',
    sort_order: r.sortOrder ?? 0,
    description: r.description ?? '',
    is_agent_only: r.isAgentOnly ?? false,
    required_skills: r.requiredSkills ?? [],
  })
  await logSettingsUpdated({
    session,
    entityType: 'ticket_type',
    entityId: String(typeId),
    label: updated.title,
    before: snap(current),
    after: snap(updated),
    keys: TYPE_LOG_KEYS,
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: updated.id,
    slug: updated.slug,
    title: updated.title,
    description: updated.description ?? '',
    color: updated.color ?? '#000000',
    sort_order: updated.sortOrder ?? 0,
    is_agent_only: updated.isAgentOnly ?? false,
    required_skills: updated.requiredSkills ?? [],
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/ticket-types/[id] - Delete ticket type */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, canAccessTicketAttributes)
  if (denied) return denied

  const { id } = await params
  const typeId = parseInt(id, 10)
  if (isNaN(typeId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const current = await get(ticketTypes, typeId)
    if (!current) {
      return NextResponse.json({ error: 'Ticket type not found' }, { status: 404 })
    }

    const deleted = await deleteTicketTypeRestrict(typeId)

    if (!deleted) {
      return NextResponse.json({ error: 'Ticket type not found' }, { status: 404 })
    }

    await logSettingsDeleted({
      session,
      entityType: 'ticket_type',
      entityId: String(typeId),
      label: current.title,
      snapshot: {
        title: current.title,
        slug: current.slug,
        color: current.color ?? '#000000',
        sort_order: current.sortOrder ?? 0,
        description: current.description ?? '',
        is_agent_only: current.isAgentOnly ?? false,
      },
    })

    revalidateTicketsLookupCatalog()
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return NextResponse.json(
        { error: 'Cannot delete: this ticket type is currently in use on one or more tickets. It must be removed from all tickets before deletion.' },
        { status: 409 }
      )
    }
    console.error('[DELETE ticket-types]', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
