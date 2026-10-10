import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { canAccessTicketAttributes } from '@/lib/auth-utils'
import { find, findOneBy, insert, ticketTypes } from '@/lib/fsdb'
import { logSettingsCreated } from '@/lib/settings-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'
import { normalizeSkills } from '@/lib/user-skills'
import { knownSkills } from '@/lib/user-skills-server'

/** GET /api/ticket-types - List all ticket types */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const rows = await find(ticketTypes, {
    where: [role === 'customer' && ['isAgentOnly', '==', false]],
    orderBy: [['sortOrder', 'asc']],
  })

  const data = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description ?? '',
    color: r.color ?? '#000000',
    sort_order: r.sortOrder ?? 0,
    is_agent_only: r.isAgentOnly ?? false,
    required_skills: r.requiredSkills ?? [],
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/ticket-types - Create ticket type */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, canAccessTicketAttributes)
  if (denied) return denied

  const body = await request.json()
  const { title, slug, color, sort_order, description, is_agent_only, required_skills } = body

  if (!title || !slug) {
    return NextResponse.json({ error: 'title and slug required' }, { status: 400 })
  }

  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (await findOneBy(ticketTypes, { slug: normalizedSlug })) {
    return NextResponse.json({ error: 'A ticket type with this slug already exists' }, { status: 409 })
  }
  const inserted = await insert(ticketTypes, {
    title: String(title).trim(),
    slug: normalizedSlug,
    description: typeof description === 'string' ? description : '',
    color: color || '#000000',
    isAgentOnly: Boolean(is_agent_only),
    requiredSkills: normalizeSkills(required_skills, await knownSkills()),
    ...(sort_order !== undefined && { sortOrder: Number(sort_order) ?? 0 }),
  })

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  await logSettingsCreated({
    session,
    entityType: 'ticket_type',
    entityId: String(inserted.id),
    label: inserted.title,
    snapshot: {
      title: inserted.title,
      slug: inserted.slug,
      color: inserted.color ?? '#000000',
      sort_order: inserted.sortOrder ?? 0,
      description: inserted.description ?? '',
      is_agent_only: inserted.isAgentOnly ?? false,
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
    is_agent_only: inserted.isAgentOnly ?? false,
    required_skills: inserted.requiredSkills ?? [],
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
