import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { dashboardAnnouncements, get, remove, update } from '@/lib/fsdb'
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

/** PATCH — update (admin). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const existing = await get(dashboardAnnouncements, id)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const title =
    body.title !== undefined
      ? typeof body.title === 'string'
        ? body.title.trim()
        : existing.title
      : existing.title
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const textBody = body.body !== undefined ? (typeof body.body === 'string' ? body.body : existing.body) : existing.body
  const isPublished = body.is_published !== undefined ? body.is_published === true : existing.isPublished
  const sortOrder =
    body.sort_order !== undefined && typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? body.sort_order
      : existing.sortOrder ?? 0

  let targetRoles = existing.targetRoles
  if (body.target_roles !== undefined) {
    targetRoles = normalizeTargetRolesInput(body.target_roles)
  }

  let startsAt = existing.startsAt
  let endsAt = existing.endsAt
  if (body.starts_at !== undefined) startsAt = parseOptionalDate(body.starts_at)
  if (body.ends_at !== undefined) endsAt = parseOptionalDate(body.ends_at)

  if (isPublished) {
    if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
      return NextResponse.json({ error: 'End must be after start' }, { status: 400 })
    }
  } else if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
    return NextResponse.json({ error: 'End must be after start' }, { status: 400 })
  }

  try {
    const updated = await update(dashboardAnnouncements, id, {
      title,
      body: textBody ?? '',
      targetRoles,
      isPublished,
      startsAt,
      endsAt,
      sortOrder,
      updatedAt: new Date(),
    })

    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(rowToAdminJson(updated))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Database error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** DELETE (admin). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const deleted = await remove(dashboardAnnouncements, id)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
