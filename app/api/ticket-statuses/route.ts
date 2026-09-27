import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { find, findOneBy, insert, ticketStatuses } from '@/lib/fsdb'
import { logSettingsCreated } from '@/lib/settings-activity-log'
import { isTicketStatusInKanban } from '@/lib/ticket-status-kanban'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

function statusSnapshot(r: {
  title: string
  slug: string
  customerTitle?: string | null
  description?: string | null
  color?: string | null
  showInKanban?: boolean | null
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
    sort_order: r.sortOrder ?? 0,
    is_deletable: r.isDeletable ?? true,
    is_active: r.isActive ?? true,
  }
}

/** GET /api/ticket-statuses - List all ticket statuses */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await find(ticketStatuses, { orderBy: [['sortOrder', 'asc']] })

  const data = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    customer_title: r.customerTitle ?? undefined,
    description: r.description ?? undefined,
    color: r.color,
    show_in_kanban: isTicketStatusInKanban(r.showInKanban),
    is_deletable: r.isDeletable,
    is_active: r.isActive,
    sort_order: r.sortOrder ?? 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/ticket-statuses - Create ticket status */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, slug, customer_title, description, color, show_in_kanban, sort_order, is_deletable, is_active } =
    body

  if (!title || !slug) {
    return NextResponse.json({ error: 'title and slug required' }, { status: 400 })
  }

  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (await findOneBy(ticketStatuses, { slug: normalizedSlug })) {
    return NextResponse.json({ error: 'A status with this slug already exists' }, { status: 409 })
  }
  const inserted = await insert(ticketStatuses, {
      title: String(title).trim(),
      slug: normalizedSlug,
      customerTitle: customer_title?.trim() || null,
      description: description?.trim() || '',
      color: color || '#8c8c8c',
      showInKanban: !!show_in_kanban,
      isDeletable: is_deletable !== false,
      isActive: is_active !== false,
      sortOrder: Number(sort_order) ?? 0,
    })

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  await logSettingsCreated({
    session,
    entityType: 'ticket_status',
    entityId: String(inserted.id),
    label: inserted.title,
    snapshot: statusSnapshot(inserted),
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: inserted.id,
    slug: inserted.slug,
    title: inserted.title,
    customer_title: inserted.customerTitle ?? undefined,
    description: inserted.description ?? undefined,
    color: inserted.color,
    show_in_kanban: isTicketStatusInKanban(inserted.showInKanban),
    is_deletable: inserted.isDeletable,
    is_active: inserted.isActive,
    sort_order: inserted.sortOrder ?? 0,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
