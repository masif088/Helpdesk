import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { find, findOneBy, insert, ticketPriorities } from '@/lib/fsdb'
import { logSettingsCreated } from '@/lib/settings-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

/** GET /api/ticket-priorities */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await find(ticketPriorities, { orderBy: [['sortOrder', 'asc']] })

  const data = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description ?? '',
    color: r.color ?? '#000000',
    sort_order: r.sortOrder ?? 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/ticket-priorities */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, slug, color, sort_order, description } = body

  if (!title || !slug) {
    return NextResponse.json({ error: 'title and slug required' }, { status: 400 })
  }

  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (await findOneBy(ticketPriorities, { slug: normalizedSlug })) {
    return NextResponse.json({ error: 'A priority with this slug already exists' }, { status: 409 })
  }
  const inserted = await insert(ticketPriorities, {
    title: String(title).trim(),
    slug: normalizedSlug,
    description: typeof description === 'string' ? description : '',
    color: color || '#000000',
    ...(sort_order !== undefined && { sortOrder: Number(sort_order) ?? 0 }),
  })

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  await logSettingsCreated({
    session,
    entityType: 'ticket_priority',
    entityId: String(inserted.id),
    label: inserted.title,
    snapshot: {
      title: inserted.title,
      slug: inserted.slug,
      color: inserted.color ?? '#000000',
      sort_order: inserted.sortOrder ?? 0,
      description: inserted.description ?? '',
    },
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: inserted.id,
    slug: inserted.slug,
    title: inserted.title,
    description: inserted.description ?? '',
    color: inserted.color ?? '#000000',
    sort_order: inserted.sortOrder ?? 0,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
