import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { find, insert, tags } from '@/lib/fsdb'
import { logSettingsCreated } from '@/lib/settings-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

/** GET /api/tags - List all tags */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await find(tags, { orderBy: [['name', 'asc']] })

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    color: r.color ?? '#000000',
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/tags - Create tag */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, slug, color } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug required' }, { status: 400 })
  }

  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if ((await find(tags, { where: [['slug', '==', normalizedSlug]], limit: 1 })).length > 0) {
    return NextResponse.json({ error: 'A tag with this slug already exists' }, { status: 409 })
  }
  const inserted = await insert(tags, {
    name: String(name).trim(),
    slug: normalizedSlug,
    color: color || '#000000',
  })

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  await logSettingsCreated({
    session,
    entityType: 'tag',
    entityId: inserted.id,
    label: inserted.name,
    snapshot: { name: inserted.name, slug: inserted.slug, color: inserted.color ?? '#000000' },
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: inserted.id,
    name: inserted.name,
    slug: inserted.slug,
    color: inserted.color ?? '#000000',
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
