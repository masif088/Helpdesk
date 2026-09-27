import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { dashboardAnnouncements, find, insert } from '@/lib/fsdb'
import { normalizeTargetRolesInput } from '@/lib/knowledge-base-article-roles'

function sessionRole(session: { user?: { role?: string; id?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

function rowToAdminJson(row: typeof dashboardAnnouncements.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? '',
    target_roles: row.targetRoles ?? null,
    is_published: row.isPublished,
    starts_at: row.startsAt ? row.startsAt.toISOString() : null,
    ends_at: row.endsAt ? row.endsAt.toISOString() : null,
    sort_order: row.sortOrder ?? 0,
    created_at: row.createdAt ? row.createdAt.toISOString() : '',
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : '',
  }
}

function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** GET — all rows (admin). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const rows = await find(dashboardAnnouncements, { orderBy: [['updatedAt', 'desc']] })
    return NextResponse.json({ items: rows.map(rowToAdminJson) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Database error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** POST — create (admin). */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  const textBody = typeof body.body === 'string' ? body.body : ''
  const isPublished = body.is_published === true
  const sortOrder = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order) ? body.sort_order : 0
  const targetRoles = normalizeTargetRolesInput(body.target_roles)
  const startsAt = parseOptionalDate(body.starts_at)
  const endsAt = parseOptionalDate(body.ends_at)

  if (isPublished) {
    if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
      return NextResponse.json({ error: 'End must be after start' }, { status: 400 })
    }
  } else if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
    return NextResponse.json({ error: 'End must be after start' }, { status: 400 })
  }

  try {
    const inserted = await insert(dashboardAnnouncements, {
      title,
      body: textBody,
      targetRoles,
      isPublished,
      startsAt,
      endsAt,
      sortOrder,
      createdBy: session.user.id,
      updatedAt: new Date(),
    })

    if (!inserted) {
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }
    return NextResponse.json(rowToAdminJson(inserted))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Database error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
