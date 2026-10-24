import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { count, find, get, type Patch, remove, tickets, ticketStatuses, update } from '@/lib/fsdb'
import { logSettingsDeleted, logSettingsUpdated } from '@/lib/settings-activity-log'
import { isAgentDefault, isCustomerDefault } from '@/lib/ticket-status-defaults'
import { materializeStatusDefaults } from '@/lib/ticket-status-defaults-store'
import { isTicketStatusInKanban } from '@/lib/ticket-status-kanban'
import { isLockedTicketStatusSlug } from '@/lib/ticket-status-locked-slugs'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

const STATUS_LOG_KEYS = [
  'title',
  'slug',
  'customer_title',
  'description',
  'color',
  'show_in_kanban',
  'agent_default_filter',
  'customer_default_filter',
  'sort_order',
  'is_deletable',
  'is_active',
]

function statusSnapshot(r: {
  title: string
  slug: string
  customerTitle?: string | null
  description?: string | null
  color?: string | null
  showInKanban?: boolean | null
  agentDefaultFilter?: boolean | null
  customerDefaultFilter?: boolean | null
  sortOrder?: number | null
  isDeletable?: boolean | null
  isActive?: boolean | null
}) {
  return {
    title: r.title,
    slug: r.slug,
    customer_title: r.customerTitle ?? null,
    description: r.description ?? '',
    color: r.color ?? '#8c8c8c',
    show_in_kanban: isTicketStatusInKanban(r.showInKanban),
    agent_default_filter: r.agentDefaultFilter ?? null,
    customer_default_filter: r.customerDefaultFilter ?? null,
    sort_order: r.sortOrder ?? 0,
    is_deletable: r.isDeletable ?? true,
    is_active: r.isActive ?? true,
  }
}

/** PATCH /api/ticket-statuses/[id] - Update ticket status */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const statusId = parseInt(id, 10)
  if (isNaN(statusId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await request.json()
  const {
    title,
    slug,
    customer_title,
    description,
    color,
    show_in_kanban,
    agent_default_filter,
    customer_default_filter,
    sort_order,
    is_deletable,
    is_active,
  } = body

  const current = await get(ticketStatuses, statusId)
  if (!current) {
    return NextResponse.json({ error: 'Status not found' }, { status: 404 })
  }

  if (agent_default_filter !== undefined) await materializeStatusDefaults('agent')
  if (customer_default_filter !== undefined) await materializeStatusDefaults('customer')

  const values: Record<string, unknown> = {}
  if (title !== undefined) values.title = String(title).trim()
  if (slug !== undefined) values.slug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (customer_title !== undefined) values.customerTitle = customer_title?.trim() || null
  if (description !== undefined) values.description = description?.trim() || ''
  if (color !== undefined) values.color = color || '#8c8c8c'
  if (show_in_kanban !== undefined) values.showInKanban = !!show_in_kanban
  if (agent_default_filter !== undefined) values.agentDefaultFilter = !!agent_default_filter
  if (customer_default_filter !== undefined) values.customerDefaultFilter = !!customer_default_filter
  if (sort_order !== undefined) values.sortOrder = Number(sort_order) ?? 0
  if (is_deletable !== undefined && !isLockedTicketStatusSlug(current.slug)) {
    values.isDeletable = !!is_deletable
  }
  if (is_active !== undefined) {
    values.isActive = !!is_active
  }

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await update(ticketStatuses, statusId, values as Patch<typeof ticketStatuses.$inferSelect>)

  if (!updated) {
    return NextResponse.json({ error: 'Status not found' }, { status: 404 })
  }

  await logSettingsUpdated({
    session,
    entityType: 'ticket_status',
    entityId: String(statusId),
    label: updated.title,
    before: statusSnapshot(current),
    after: statusSnapshot(updated),
    keys: STATUS_LOG_KEYS,
  })

  revalidateTicketsLookupCatalog()
  const all = await find(ticketStatuses, {})
  return NextResponse.json({
    id: updated.id,
    slug: updated.slug,
    title: updated.title,
    customer_title: updated.customerTitle ?? undefined,
    description: updated.description ?? undefined,
    color: updated.color,
    show_in_kanban: isTicketStatusInKanban(updated.showInKanban),
    agent_default_filter: isAgentDefault(all, updated.slug),
    customer_default_filter: isCustomerDefault(all, updated.slug),
    is_deletable: updated.isDeletable,
    is_active: updated.isActive,
    sort_order: updated.sortOrder ?? 0,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/ticket-statuses/[id] - Delete ticket status */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const statusId = parseInt(id, 10)
  if (isNaN(statusId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    // First, get the status to check its slug
    const status = await get(ticketStatuses, statusId)

    if (!status) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    if (isLockedTicketStatusSlug(status.slug) || !status.isDeletable) {
      return NextResponse.json({ error: 'This status cannot be deleted.' }, { status: 403 })
    }

    // Check if any tickets use this status
    const inUse = await count(tickets, [['status', '==', status.slug]])

    if (inUse > 0) {
      return NextResponse.json(
        { error: 'Cannot delete: this status is currently in use on one or more tickets. It must be removed from all tickets before deletion.' },
        { status: 409 }
      )
    }

    // Delete the status
    const deleted = await remove(ticketStatuses, statusId)

    if (!deleted) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    await logSettingsDeleted({
      session,
      entityType: 'ticket_status',
      entityId: String(statusId),
      label: status.title,
      snapshot: statusSnapshot(status),
    })

    revalidateTicketsLookupCatalog()
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return NextResponse.json(
        { error: 'Cannot delete: this status is currently in use on one or more tickets. It must be removed from all tickets before deletion.' },
        { status: 409 }
      )
    }
    console.error('[DELETE ticket-statuses]', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
